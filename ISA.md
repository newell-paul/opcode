# `opcode` ISA

The authoritative opcode → action contract. Claude reads this at the start of every run. Organized in three layers:

1. **Core ISA** — 15 opcodes + 9 I/O vectors. The real working set. Always enabled.
2. **Extended** — the rest of the 6502-ish ISA. Opt-in via `.EXTENDED ON`. Mix of real and metaphor.
3. **Unsafe** — six illegal opcodes. Opt-in via `.UNSAFE ON`. Pure flavor — narrated, never executed.

Flags column uses standard 6502 notation: `N V - B D I Z C`. A dash means the flag is untouched.

**Honesty tags:** **L** = load-bearing (real effect) · **M** = metaphor (narrated, no-op) · **F** = flavor (illegal, narrated only).

---

# 1 · Core ISA (15 opcodes)

This is the whole working vocabulary. Every core opcode is **L** — load-bearing.

## 1.1 Data movement

| Mnemonic | Mode | Effect | Flags |
|---|---|---|---|
| `LDA #imm` | Immediate | Load literal `imm` into `A` | `N Z` |
| `LDA $zp` | Zero-page | Load slot `$zp` into `A` | `N Z` |
| `LDA $zp,X` | ZP,X | Load queue entry (e.g. `LDA $10,X`) | `N Z` |
| `STA $zp` | Zero-page | Persist `A` to a zero-page slot | `-` |

## 1.2 Loop control

| Mnemonic | Effect | Flags |
|---|---|---|
| `LDX #imm` | Initialize loop cursor | `N Z` |
| `INX` | Advance loop cursor by 1 | `N Z` |
| `CPX #imm` | Compare loop cursor to literal | `N Z C` |

## 1.3 Control flow

| Mnemonic | Taken when | Typical use |
|---|---|---|
| `BEQ label` | `Z=1` | Empty queue slot, clean diff |
| `BNE label` | `Z=0` | More work to do |
| `BCC label` | `C=0` | Tests failed OR review flagged a concern |
| `BCS label` | `C=1` | Tests passed AND review clean |
| `JMP label` | always | Unconditional jump |
| `JSR label` | always | Call vector or subroutine (pushes return breadcrumb) |
| `RTS` | — | Return from subroutine |
| `BRK` | — | **Commit and halt.** Uses `$05` as commit message |

## 1.4 Todo stack

The `$0100–$01FF` page is the Claude Code task list.

| Mnemonic | Effect | Flags |
|---|---|---|
| `PHA` | Push `A` as a new pending todo (`TaskCreate`) | `-` |
| `PLA` | Pop newest pending todo into `A`, mark in_progress → completed | `N Z` |

Detecting an empty stack: `PLA` loads zero when there is nothing to pop. Use `PLA / BEQ done` as the drain pattern — issue IDs are never zero.

## 1.5 Core I/O vectors

These are `JSR` targets at fixed addresses. Use them as mnemonics: `JSR FETCH`, `JSR FIX`.

| Vector | Mnemonic | Action | Sets |
|---|---|---|---|
| `$FE00` | `FETCH` | Dual-mode: if `$20` (LABELS) is non-zero, `forge.mjs fetch --labels <$20>` → fill `$10–$1F` (queue mode). Otherwise `A` is an issue ID → pull that one issue into `$00` (ISSUE) (single mode). Mask mode requires explicit `STA LABELS` first. | — |
| `$FE03` | `PULL` | `git pull` | — |
| `$FE06` | `PUSH` / `OPEN_PR` / `OPEN_MR` | `git push` + forge PR/MR create | — |
| `$FE09` | `CLONE` | `git clone` project referenced by `A` | — |
| `$8000` | `ANALYZE` | Read issue `A`, write plan to `$03` | — |
| `$8100` | `FIX` | Edit file at `$02` to resolve issue `A` | — |
| `$8200` | `TEST` | Run project tests | `C=1` on pass |
| `$8300` | `LINT` | Run linters | `Z=1` on clean |
| `$8400` | `REVIEW` | Self-review diff in `$03` | `C=1` if clean, `C=0` on concern |

`PUSH`, `OPEN_PR`, and `OPEN_MR` are three names for the same vector. Traces substitute forge-appropriate vocabulary.

**Core REVIEW uses `C`** (not `N` like extended) so `BCC`/`BCS` cover both tests and review in the 15-op core.

## 1.6 Zero-page slot map

Use the named aliases. Raw hex still works for retro feel, but aliases are preferred everywhere — examples, docs, output traces, and `.s` source.

| Alias | Addr | Meaning |
|---|---|---|
| `ISSUE` | `$00` | current issue ID |
| `BRANCH` | `$01` | branch name ptr |
| `FILE` | `$02` | current file |
| `DIFF` | `$03` | diff / plan buffer |
| `TESTRES` | `$04` | last test result |
| `MSG` | `$05` | commit message |
| `QUEUE` | `$10` | base of fetched issue queue (`$10–$1F`) |
| `LABELS` | `$20` | label filter mask |

## 1.7 Literal formats

The assembler accepts three literal formats. **Decimal is preferred.**

| Format | Example | When to use |
|---|---|---|
| Decimal | `#42` | **Default for everything** — issue IDs, counters, bounds |
| Hex | `#$2A` | Legal, but avoid unless the value is genuinely clearer in hex |
| Binary | `#%00101010` | Legal; useful for label-filter bitmasks where bit layout matters |

In particular: **never write issue numbers in hex.** `LDA #42` is always clearer than `LDA #$2A`.

---

# 2 · Extended ISA (compatibility layer)

Everything below requires `.EXTENDED ON` earlier in the program. It exists so that nostalgic 6502 programs assemble and narrate correctly, and so that real arithmetic/logic/transfer behavior is available if someone actually needs it. Most of the extended layer is `M`-tagged metaphor — narrated, not executed.

## 2.1 Extended load/store

| Mnemonic | Effect | Flags | Tag |
|---|---|---|---|
| `LDY #imm` | Load `Y` | `N Z` | **L** |
| `STX $zp` | Persist `X` to slot | `-` | **L** |
| `STY $zp` | Persist `Y` to slot | `-` | **L** |

## 2.2 Extended stack / todos

| Mnemonic | Effect | Flags | Tag |
|---|---|---|---|
| `TSX` | `X ← SP` — count of pending todos | `N Z` | **L** |
| `PHP` | "Push flag state as a status-note todo" | `-` | **M** |
| `PLP` | "Pop a status-note todo, restore flags" | `N V D I Z C` | **M** |
| `TXS` | "Truncate todo list to `X` entries" (requires `.UNSAFE ON`) | `-` | **M** |

## 2.3 Arithmetic

| Mnemonic | Effect | Flags | Tag |
|---|---|---|---|
| `INY` / `DEY` | Advance/rewind secondary (file-in-issue) cursor | `N Z` | **L** |
| `DEX` | Rewind loop cursor | `N Z` | **L** |
| `ADC $zp` | "Apply a diff hunk from `$zp`" | `N V Z C` | **M** |
| `SBC $zp` | "Revert a hunk" | `N V Z C` | **M** |
| `INC $zp` / `DEC $zp` | "Bump file cursor via zero-page" (redundant with `INY`/`DEY`) | `N Z` | **M** |

## 2.4 Logic (label-filter algebra)

| Mnemonic | Effect | Flags | Tag |
|---|---|---|---|
| `AND #imm` | "Intersect label mask" | `N Z` | **M** |
| `ORA #imm` | "Union label mask" | `N Z` | **M** |
| `EOR #imm` | "Toggle label bits" | `N Z` | **M** |
| `BIT $zp` | "Non-destructive label test" | `N V Z` | **M** |

## 2.5 Shifts

| Mnemonic | Effect | Flags | Tag |
|---|---|---|---|
| `ASL A` | "Promote priority" | `N Z C` | **M** |
| `LSR A` | "Demote priority" | `N Z C` | **M** |
| `ROL A` | "Round-robin reviewer assignment" | `N Z C` | **M** |
| `ROR A` | "Reverse round-robin" | `N Z C` | **M** |

## 2.6 Extended branches

| Mnemonic | Taken when | Use | Tag |
|---|---|---|---|
| `BMI label` | `N=1` | Extended REVIEW concern (N-based semantics) | **L** |
| `BPL label` | `N=0` | All clear | **M** |
| `BVS label` | `V=1` | "Merge conflict" | **M** |
| `BVC label` | `V=0` | "Clean merge" | **M** |
| `JMP (ind)` | always | "Chase a referenced issue through its blocker graph" | **M** |

## 2.7 Extended transfers

| Mnemonic | Effect | Tag |
|---|---|---|
| `TAX` | `X ← A` — use current issue as loop cursor | **L** |
| `TAY` | `Y ← A` | **L** |
| `TXA` / `TYA` | Inverse | **L** |

## 2.8 Extended compare

| Mnemonic | Effect | Flags | Tag |
|---|---|---|---|
| `CMP #imm` | Compare `A` to literal | `N Z C` | **L** |
| `CPY #imm` | Compare file cursor | `N Z C` | **L** |

## 2.9 Extended flags / mode

| Mnemonic | Effect | Tag |
|---|---|---|
| `NOP` | No-op — genuine placeholder | **L** |
| `SED` / `CLD` | Legacy: use `.DRYRUN ON` / `.DRYRUN OFF` directives instead | **L** |
| `CLC` / `SEC` | "Force tests-passed state" | **M** |
| `CLI` / `SEI` | "Enable/disable CI interrupt" | **M** |
| `RTI` | Return from IRQ handler registered via `.IRQ`. Pairs with `JSR <handler>` for user-triggered preemption. | **M** |
| `CLV` | "Clear conflict flag" | **M** |

## 2.10 Extended REVIEW semantics

Under `.EXTENDED ON`, `REVIEW` uses the traditional N-based semantics: `N=1` on concern, branch with `BMI`. The core `C`-based semantics still apply unless `.EXTENDED ON` has been seen — this lets extended programs port 6502-style review loops more faithfully.

---

# 3 · Unsafe (illegal opcodes — flavor only)

All six are `F`-tagged. They are **never executed**, not even with `.UNSAFE ON`. They are narrated for the joke and the joke alone.

Require `.UNSAFE ON` to appear in the output at all. Without it, Claude refuses and emits `.ERR "unsafe required"`.

| Mnemonic | Official name | Narrated effect |
|---|---|---|
| `LAX $zp` | Load A and X | "Load same issue into both cursors" |
| `SAX $zp` | Store A AND X | "Commit intersection of diffs A and X" |
| `DCP $zp` | DEC + CMP | "Decrement retry counter and compare in one op" |
| `ISC $zp` | INC + SBC | "Advance counter, discount by position" |
| `SLO $zp` | ASL + ORA | "Promote priority and merge into label mask" |
| `RLA $zp` | ROL + AND | "Rotate priority through carry, mask against labels" |

---

# 4 · Directives (assemble-time and output-time)

Lines prefixed with `.` are directives, not opcodes. Some affect how the assembler parses the file; others shape Claude's output.

## Assemble-time

| Directive | Effect |
|---|---|
| `.ORG $0600` | Set program origin (default `$0600`) |
| `.FORGE <name>` | Declare target forge (`github` / `gitlab`). Skips a `forge.mjs detect` call at runtime. Override order: `$OPCODE_FORGE` > `.FORGE` header > `.opcode.json` > auto-detect. |
| `.EXTENDED ON` / `.EXTENDED OFF` | Gate the Extended ISA |
| `.UNSAFE ON` / `.UNSAFE OFF` | Gate the Unsafe illegal opcodes |
| `.DRYRUN ON` / `.DRYRUN OFF` | Set/clear dry-run mode (replaces `SED`/`CLD` as opcodes) |
| `.TRACE ON` / `.TRACE OFF` | Verbose per-opcode narration |
| `.IRQ <label>` | Register `<label>` as the IRQ handler. Flavor: the assembler resolves the address and surfaces it as `irqVector` on the result; execution is unchanged. User decides when to fire the handler (e.g. an urgent-label preemption between queue iterations) by emitting `JSR <label>` followed by `RTI` in the trace. |

## Output-time (Claude's replies)

| Directive | Use | Limit |
|---|---|---|
| `.FORGE <name>` | First trace line — echoes the header or the `forge.mjs detect` result | — |
| `.WATCH A` | Print register/slot contents | one line |
| `.DUMP $0200` / `.DUMP A` | Show memory region or register | one line |
| `.ASK "…"` | Question to the user | ≤60 chars |
| `.NOTE "…"` | Short natural-language observation | ≤80 chars |
| `.ERR "…"` | Error state, halts the program | ≤80 chars |
| `.DIFF <path>` | Inline unified-diff block (terminated with `.END`) | bounded block |
| `.NUMERIC ON` / `.NUMERIC OFF` | Render trace lines as raw opcode bytes (e.g. `A9 2A`) in place of mnemonics. Decorative — uses the `bytes` field attached to each core-ISA instruction by the assembler. Extended/unsafe ops have no byte encoding and remain mnemonic. | — |

---

# Totals

- **Core ISA:** 15 opcodes + 9 vector aliases — all `L`
- **Extended:** ~40 mnemonics — mix of `L` and `M`
- **Unsafe:** 6 mnemonics — all `F`

Write programs in Core. Opt into Extended only when porting existing code or for retro flavor. Unsafe is a museum exhibit behind glass.
