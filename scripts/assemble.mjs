#!/usr/bin/env node
// Tiny pseudo-6502 assembler for claude-assembler.
// Parses .s source → JSON { origin, labels, stream } for Claude to walk.
//
// Usage:
//   node scripts/assemble.mjs path/to/prog.s
//   cat prog.s | node scripts/assemble.mjs -

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MNEMONICS = new Set([
  "LDA","LDX","LDY","STA","STX","STY",
  "PHA","PLA","PHP","PLP","TSX","TXS",
  "ADC","SBC","INC","DEC","INX","DEX","INY","DEY",
  "AND","ORA","EOR","BIT",
  "ASL","LSR","ROL","ROR",
  "BEQ","BNE","BCS","BCC","BMI","BPL","BVS","BVC",
  "JMP","JSR","RTS","RTI","BRK","NOP",
  "CLC","SEC","CLD","SED","CLI","SEI","CLV",
  "TAX","TAY","TXA","TYA",
  "CMP","CPX","CPY",
  // illegal (require .UNSAFE ON at runtime, not here)
  "LAX","SAX","DCP","ISC","SLO","RLA",
]);

// Byte encodings for the Core ISA (15 opcodes). Decorative — surfaced when a
// program enables `.NUMERIC ON` so traces can show `A9 2A` next to `LDA #42`.
// Extended/unsafe mnemonics are intentionally omitted; the encoder returns
// null for anything outside this table.
const OPCODE_BYTES = {
  LDA: { immediate: 0xA9, zeropage: 0xA5, "zp,x": 0xB5, absolute: 0xAD },
  STA: { zeropage: 0x85, "zp,x": 0x95, absolute: 0x8D },
  LDX: { immediate: 0xA2, zeropage: 0xA6 },
  INX: { implied: 0xE8 },
  CPX: { immediate: 0xE0, zeropage: 0xE4 },
  JSR: { absolute: 0x20 },
  RTS: { implied: 0x60 },
  RTI: { implied: 0x40 },
  BRK: { implied: 0x00 },
  BEQ: { relative: 0xF0 },
  BNE: { relative: 0xD0 },
  BCC: { relative: 0x90 },
  BCS: { relative: 0xB0 },
  JMP: { absolute: 0x4C, indirect: 0x6C },
  PHA: { implied: 0x48 },
  PLA: { implied: 0x68 },
};

const VECTOR_ALIASES = {
  ANALYZE: "$8000", FIX: "$8100", TEST: "$8200", LINT: "$8300", REVIEW: "$8400",
  FETCH: "$FE00",   PULL: "$FE03", PUSH: "$FE06", CLONE: "$FE09",
  // PUSH synonyms — pick the vocabulary that matches your forge
  OPEN_PR: "$FE06", OPEN_MR: "$FE06",
};

// Named zero-page slot aliases. Prefer these over raw hex (e.g. `STA LABELS`
// instead of `STA $20`). Hex addresses still work for the retro faithful.
const SLOT_ALIASES = {
  ISSUE:   0x00,
  BRANCH:  0x01,
  FILE:    0x02,
  DIFF:    0x03,
  TESTRES: 0x04,
  MSG:     0x05,
  QUEUE:   0x10,  // base of the fetched issue queue ($10-$1F)
  LABELS:  0x20,  // label filter mask
};

// Named immediate-value aliases for label bits. Lets you write `LDA #BUG`
// instead of `LDA #1`. Mirror of LABEL_BITS in scripts/forge.mjs — keep in sync.
// Compose with `|` (e.g. `LDA #BUG|URGENT`).
const IMM_ALIASES = {
  BUG:         0x01,
  URGENT:      0x02,
  ENHANCEMENT: 0x04,
  DOCS:        0x08,
  SECURITY:    0x10,
  REFACTOR:    0x20,
  CHORE:       0x40,
  SEEN:        0x80,
};

function parseOperand(raw) {
  if (raw === undefined || raw === "") return null;
  const token = raw.trim();
  if (VECTOR_ALIASES[token]) return { mode: "absolute", value: parseNumber(VECTOR_ALIASES[token]), label: token };
  if (SLOT_ALIASES[token] !== undefined) return { mode: "zeropage", value: SLOT_ALIASES[token], label: token };
  if (token === "A") return { mode: "accumulator" };
  if (token.startsWith("#")) return { mode: "immediate", value: parseImmediate(token.slice(1)) };
  if (token.startsWith("(") && token.endsWith(")")) return { mode: "indirect", value: parseNumber(token.slice(1, -1)) };
  if (/,X$/i.test(token)) {
    const base = token.replace(/,X$/i, "");
    const value = SLOT_ALIASES[base] !== undefined ? SLOT_ALIASES[base] : parseNumber(base);
    return { mode: "zp,x", value, label: SLOT_ALIASES[base] !== undefined ? base : undefined };
  }
  if (/,Y$/i.test(token)) {
    const base = token.replace(/,Y$/i, "");
    const value = SLOT_ALIASES[base] !== undefined ? SLOT_ALIASES[base] : parseNumber(base);
    return { mode: "zp,y", value, label: SLOT_ALIASES[base] !== undefined ? base : undefined };
  }
  if (token.startsWith("$")) {
    const n = parseNumber(token);
    return { mode: n < 0x100 ? "zeropage" : "absolute", value: n };
  }
  // bare identifier → label reference (resolved in pass 2)
  return { mode: "label", label: token };
}

function parseNumber(token) {
  const t = token.trim();
  if (t.startsWith("$")) return parseInt(t.slice(1), 16);
  if (t.startsWith("%")) return parseInt(t.slice(1), 2);
  return parseInt(t, 10);
}

function parseImmediate(token) {
  const t = token.trim();
  if (t.includes("|")) {
    return t.split("|").map(part => parseImmediate(part)).reduce((a, b) => a | b, 0);
  }
  if (IMM_ALIASES[t] !== undefined) return IMM_ALIASES[t];
  const n = parseNumber(t);
  if (Number.isNaN(n)) throw new Error(`Unknown immediate ${JSON.stringify(t)}`);
  return n;
}

export { parseNumber, parseOperand, instructionSize, isBranch, assemble, encodeInstruction, OPCODE_BYTES };

function encodeInstruction(op, operand, pc) {
  const row = OPCODE_BYTES[op];
  if (!row) return null;
  const mode = operand ? operand.mode : "implied";
  const opByte = row[mode];
  if (opByte === undefined) return null;

  if (mode === "implied" || mode === "accumulator") return [opByte];
  if (mode === "immediate" || mode === "zeropage" || mode === "zp,x" || mode === "zp,y") {
    return [opByte, operand.value & 0xFF];
  }
  if (mode === "relative") {
    const offset = (operand.value - (pc + 2)) & 0xFF;
    return [opByte, offset];
  }
  if (mode === "absolute" || mode === "indirect") {
    return [opByte, operand.value & 0xFF, (operand.value >> 8) & 0xFF];
  }
  return null;
}

function assemble(source) {
  const lines = source.split(/\r?\n/);
  const stream = [];
  const labels = {};
  let origin = 0x0600;
  let pc = origin;

  // Pass 1: tokenize, collect labels, build instruction stream with placeholder PCs.
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    let line = lines[lineNo].replace(/;.*$/, "").trimEnd();
    if (!line.trim()) continue;

    // Directives
    if (line.trim().startsWith(".")) {
      const [directive, ...rest] = line.trim().split(/\s+/);
      const dir = directive.toUpperCase();
      if (dir === ".ORG") {
        origin = parseNumber(rest[0]);
        pc = origin;
        continue;
      }
      stream.push({ pc, directive: dir, args: rest, lineNo: lineNo + 1 });
      continue;
    }

    // Label?
    const labelMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (labelMatch) {
      labels[labelMatch[1]] = pc;
      line = labelMatch[2];
      if (!line.trim()) continue;
    }

    // Instruction
    const trimmed = line.trim();
    const parts = trimmed.split(/\s+/, 2);
    const mnemonic = parts[0].toUpperCase();
    const operandRaw = trimmed.slice(parts[0].length).trim();

    if (!MNEMONICS.has(mnemonic) && !VECTOR_ALIASES[mnemonic]) {
      throw new Error(`Line ${lineNo + 1}: unknown mnemonic "${mnemonic}"`);
    }

    const operand = parseOperand(operandRaw);
    stream.push({ pc, op: mnemonic, operand, raw: trimmed, lineNo: lineNo + 1 });
    pc += instructionSize(mnemonic, operand);
  }

  // Pass 2: resolve label references in operands.
  for (const insn of stream) {
    if (!insn.operand) continue;
    if (insn.operand.mode === "label") {
      const target = labels[insn.operand.label];
      if (target === undefined) {
        throw new Error(`Line ${insn.lineNo}: undefined label "${insn.operand.label}"`);
      }
      insn.operand.value = target;
      insn.operand.mode = isBranch(insn.op) ? "relative" : "absolute";
    }
  }

  // Pass 3: attach decorative byte encoding (surfaced under `.NUMERIC ON`).
  for (const insn of stream) {
    if (!insn.op) continue;
    const bytes = encodeInstruction(insn.op, insn.operand, insn.pc);
    if (bytes) insn.bytes = bytes;
  }

  // Resolve `.IRQ <label>` to a handler vector. Flavor-only: surfaced on the
  // result so Claude can narrate `.IRQ <label>` at trace start, but nothing
  // about program execution changes.
  let irqVector = null;
  for (const insn of stream) {
    if (insn.directive !== ".IRQ") continue;
    const name = insn.args?.[0];
    if (!name) throw new Error(`Line ${insn.lineNo}: .IRQ requires a handler label`);
    const address = labels[name];
    if (address === undefined) throw new Error(`Line ${insn.lineNo}: undefined label "${name}"`);
    irqVector = { label: name, address };
  }

  return { origin, labels, stream, irqVector };
}

function instructionSize(mnemonic, operand) {
  if (!operand) return 1;
  if (operand.mode === "accumulator") return 1;
  if (operand.mode === "immediate") return 2;
  if (operand.mode === "zeropage" || operand.mode === "zp,x" || operand.mode === "zp,y") return 2;
  if (operand.mode === "relative") return 2;
  return 3;
}

function isBranch(op) {
  return ["BEQ","BNE","BCS","BCC","BMI","BPL","BVS","BVC"].includes(op);
}

// --- main ---
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: assemble.mjs <file.s> | -");
    process.exit(1);
  }
  const source = arg === "-" ? readFileSync(0, "utf8") : readFileSync(arg, "utf8");
  try {
    const result = assemble(source);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`assemble error: ${e.message}`);
    process.exit(1);
  }
}
