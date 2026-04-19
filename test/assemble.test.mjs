import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNumber,
  parseOperand,
  instructionSize,
  isBranch,
  assemble,
  encodeInstruction,
} from "../scripts/assemble.mjs";

test("parseNumber: decimal, hex, binary", () => {
  assert.equal(parseNumber("42"), 42);
  assert.equal(parseNumber("$FF"), 255);
  assert.equal(parseNumber("$8000"), 0x8000);
  assert.equal(parseNumber("%1010"), 10);
  assert.equal(parseNumber("  $10  "), 16);
});

test("parseOperand: immediate with all three literal formats", () => {
  assert.deepEqual(parseOperand("#1"),     { mode: "immediate", value: 1 });
  assert.deepEqual(parseOperand("#$FF"),   { mode: "immediate", value: 255 });
  assert.deepEqual(parseOperand("#%1010"), { mode: "immediate", value: 10 });
});

test("parseOperand: vector alias resolves to absolute address", () => {
  assert.deepEqual(parseOperand("ANALYZE"), { mode: "absolute", value: 0x8000, label: "ANALYZE" });
  assert.deepEqual(parseOperand("FETCH"),   { mode: "absolute", value: 0xFE00, label: "FETCH" });
  assert.deepEqual(parseOperand("PUSH"),    { mode: "absolute", value: 0xFE06, label: "PUSH" });
  assert.deepEqual(parseOperand("OPEN_PR"), { mode: "absolute", value: 0xFE06, label: "OPEN_PR" });
  assert.deepEqual(parseOperand("OPEN_MR"), { mode: "absolute", value: 0xFE06, label: "OPEN_MR" });
});

test("parseOperand: slot alias resolves to zero-page", () => {
  assert.deepEqual(parseOperand("ISSUE"),  { mode: "zeropage", value: 0x00, label: "ISSUE" });
  assert.deepEqual(parseOperand("QUEUE"),  { mode: "zeropage", value: 0x10, label: "QUEUE" });
  assert.deepEqual(parseOperand("LABELS"), { mode: "zeropage", value: 0x20, label: "LABELS" });
});

test("parseOperand: raw hex chooses zp vs absolute by value", () => {
  assert.deepEqual(parseOperand("$10"),   { mode: "zeropage", value: 0x10 });
  assert.deepEqual(parseOperand("$FF"),   { mode: "zeropage", value: 0xFF });
  assert.deepEqual(parseOperand("$0100"), { mode: "absolute", value: 0x0100 });
  assert.deepEqual(parseOperand("$8000"), { mode: "absolute", value: 0x8000 });
});

test("parseOperand: indexed addressing preserves slot alias", () => {
  assert.deepEqual(parseOperand("QUEUE,X"), { mode: "zp,x", value: 0x10, label: "QUEUE" });
  assert.deepEqual(parseOperand("$20,Y"),   { mode: "zp,y", value: 0x20, label: undefined });
});

test("parseOperand: accumulator and indirect modes", () => {
  assert.deepEqual(parseOperand("A"),        { mode: "accumulator" });
  assert.deepEqual(parseOperand("($1234)"),  { mode: "indirect", value: 0x1234 });
});

test("parseOperand: bare identifier becomes label ref (pass 2)", () => {
  assert.deepEqual(parseOperand("loop_top"), { mode: "label", label: "loop_top" });
});

test("parseOperand: immediate label-bit aliases resolve to numeric values", () => {
  assert.deepEqual(parseOperand("#BUG"),      { mode: "immediate", value: 0x01 });
  assert.deepEqual(parseOperand("#SECURITY"), { mode: "immediate", value: 0x10 });
  assert.deepEqual(parseOperand("#SEEN"),     { mode: "immediate", value: 0x80 });
});

test("parseOperand: immediate aliases compose with | into bitwise OR", () => {
  assert.deepEqual(parseOperand("#BUG|URGENT"),       { mode: "immediate", value: 0x03 });
  assert.deepEqual(parseOperand("#BUG|URGENT|DOCS"),  { mode: "immediate", value: 0x0B });
  assert.deepEqual(parseOperand("#42|BUG"),           { mode: "immediate", value: 43 });
});

test("parseOperand: unknown immediate alias throws", () => {
  assert.throws(() => parseOperand("#TYPO"),       /Unknown immediate "TYPO"/);
  assert.throws(() => parseOperand("#BUG|URENGT"), /Unknown immediate "URENGT"/);
});

test("instructionSize: matches 6502 conventions", () => {
  assert.equal(instructionSize("RTS", null), 1);
  assert.equal(instructionSize("ASL", { mode: "accumulator" }), 1);
  assert.equal(instructionSize("LDA", { mode: "immediate", value: 1 }), 2);
  assert.equal(instructionSize("LDA", { mode: "zeropage", value: 0x10 }), 2);
  assert.equal(instructionSize("LDA", { mode: "zp,x", value: 0x10 }), 2);
  assert.equal(instructionSize("BEQ", { mode: "relative", value: 5 }), 2);
  assert.equal(instructionSize("JMP", { mode: "absolute", value: 0x8000 }), 3);
});

test("isBranch: only flag-conditional branches", () => {
  for (const op of ["BEQ","BNE","BCS","BCC","BMI","BPL","BVS","BVC"]) {
    assert.equal(isBranch(op), true, `${op} should be a branch`);
  }
  assert.equal(isBranch("JMP"), false);
  assert.equal(isBranch("JSR"), false);
  assert.equal(isBranch("RTS"), false);
});

test("assemble: empty source produces empty stream at default origin", () => {
  const r = assemble("");
  assert.equal(r.origin, 0x0600);
  assert.deepEqual(r.labels, {});
  assert.deepEqual(r.stream, []);
});

test("assemble: comments and blank lines are stripped", () => {
  const r = assemble(`
    ; top of file
    LDA #1   ; inline comment

    RTS
  `);
  assert.equal(r.stream.length, 2);
  assert.equal(r.stream[0].op, "LDA");
  assert.equal(r.stream[1].op, "RTS");
});

test("assemble: .ORG directive moves the program counter", () => {
  const r = assemble(`
    .ORG $8000
    LDA #1
  `);
  assert.equal(r.origin, 0x8000);
  assert.equal(r.stream[0].op, "LDA");
  assert.equal(r.stream[0].pc, 0x8000);
});

test("assemble: instruction PCs advance by correct size", () => {
  const r = assemble(`
    LDA #1
    LDA $10
    JMP $1234
    RTS
  `);
  const pcs = r.stream.map(i => i.pc);
  assert.deepEqual(pcs, [0x0600, 0x0602, 0x0604, 0x0607]);
});

test("assemble: labels record address and can be referenced", () => {
  const r = assemble(
`start:
  LDA #1
  JMP start
`);
  assert.equal(r.labels.start, 0x0600);
  const jmp = r.stream.find(i => i.op === "JMP");
  assert.equal(jmp.operand.mode, "absolute");
  assert.equal(jmp.operand.value, 0x0600);
});

test("assemble: branch label reference becomes relative, not absolute", () => {
  const r = assemble(
`loop:
  LDA #1
  BNE loop
`);
  const bne = r.stream.find(i => i.op === "BNE");
  assert.equal(bne.operand.mode, "relative");
  assert.equal(bne.operand.value, 0x0600);
});

test("assemble: label on same line as instruction", () => {
  const r = assemble("target: RTS");
  assert.equal(r.labels.target, 0x0600);
  assert.equal(r.stream[0].op, "RTS");
});

test("assemble: forward reference resolves in pass 2", () => {
  const r = assemble(
`  JMP end
  LDA #1
end: RTS
`);
  const jmp = r.stream.find(i => i.op === "JMP");
  const rts = r.stream.find(i => i.op === "RTS");
  assert.equal(jmp.operand.value, rts.pc);
});

test("assemble: JSR to vector alias works without explicit declaration", () => {
  const r = assemble("JSR ANALYZE");
  assert.equal(r.stream[0].op, "JSR");
  assert.equal(r.stream[0].operand.mode, "absolute");
  assert.equal(r.stream[0].operand.value, 0x8000);
});

test("assemble: unknown mnemonic throws with line number", () => {
  assert.throws(
    () => assemble("\n\n  NOPE #1"),
    /Line 3: unknown mnemonic "NOPE"/
  );
});

test("assemble: undefined label throws with line number", () => {
  assert.throws(
    () => assemble("JMP nowhere"),
    /Line 1: undefined label "nowhere"/
  );
});

test("assemble: illegal opcodes parse without error (runtime gates them)", () => {
  const r = assemble("LAX $10");
  assert.equal(r.stream[0].op, "LAX");
});

test("encodeInstruction: implied, immediate, zeropage, absolute", () => {
  assert.deepEqual(encodeInstruction("BRK", null, 0x0600), [0x00]);
  assert.deepEqual(encodeInstruction("RTS", null, 0x0600), [0x60]);
  assert.deepEqual(encodeInstruction("LDA", { mode: "immediate", value: 42 }, 0x0600), [0xA9, 0x2A]);
  assert.deepEqual(encodeInstruction("STA", { mode: "zeropage", value: 0x20 }, 0x0600), [0x85, 0x20]);
  assert.deepEqual(encodeInstruction("JSR", { mode: "absolute", value: 0xFE00 }, 0x0600), [0x20, 0x00, 0xFE]);
  assert.deepEqual(encodeInstruction("LDA", { mode: "zp,x", value: 0x10 }, 0x0600), [0xB5, 0x10]);
});

test("encodeInstruction: relative branch offset is signed 8-bit from PC+2", () => {
  // forward branch: target=0x060A, pc=0x0600 → offset=8
  assert.deepEqual(encodeInstruction("BNE", { mode: "relative", value: 0x060A }, 0x0600), [0xD0, 0x08]);
  // backward branch: target=0x0600, pc=0x0605 → offset=-7 → 0xF9
  assert.deepEqual(encodeInstruction("BEQ", { mode: "relative", value: 0x0600 }, 0x0605), [0xF0, 0xF9]);
});

test("encodeInstruction: unknown mnemonic or mode returns null", () => {
  assert.equal(encodeInstruction("TXA", null, 0x0600), null);
  assert.equal(encodeInstruction("LDA", { mode: "indirect", value: 0x1234 }, 0x0600), null);
});

test("assemble: attaches bytes field for core mnemonics", () => {
  const r = assemble(`
    LDA #42
    JSR FETCH
    BRK
  `);
  assert.deepEqual(r.stream[0].bytes, [0xA9, 0x2A]);
  assert.deepEqual(r.stream[1].bytes, [0x20, 0x00, 0xFE]);
  assert.deepEqual(r.stream[2].bytes, [0x00]);
});

test("assemble: no bytes field for extended mnemonics", () => {
  const r = assemble("TXA\nRTS");
  assert.equal(r.stream[0].bytes, undefined);
  assert.deepEqual(r.stream[1].bytes, [0x60]);
});

test("encodeInstruction: RTI encodes to 0x40", () => {
  assert.deepEqual(encodeInstruction("RTI", null, 0x0600), [0x40]);
});

test("assemble: .IRQ resolves handler label to irqVector", () => {
  const r = assemble(`
    .IRQ urgent
    RTS
urgent:
    LDA #777
    RTI
  `);
  assert.deepEqual(r.irqVector, { label: "urgent", address: r.labels.urgent });
  const rti = r.stream.find(i => i.op === "RTI");
  assert.deepEqual(rti.bytes, [0x40]);
});

test("assemble: .IRQ without label throws", () => {
  assert.throws(
    () => assemble(".IRQ"),
    /Line 1: \.IRQ requires a handler label/,
  );
});

test("assemble: .IRQ to undefined label throws", () => {
  assert.throws(
    () => assemble(".IRQ nowhere\nRTS"),
    /Line 1: undefined label "nowhere"/,
  );
});

test("assemble: no .IRQ means irqVector is null", () => {
  const r = assemble("RTS");
  assert.equal(r.irqVector, null);
});

test("assemble: indented labels are rejected (6502 convention — labels at column 0)", () => {
  assert.throws(
    () => assemble("    start:\n    RTS"),
    /unknown mnemonic "START:"/,
  );
});
