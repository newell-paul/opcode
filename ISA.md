# `opcode` ISA

The authoritative opcode → action contract. Claude reads this at the start of every run. Organized in three layers:

1. **Core ISA** — 15 opcodes + 9 I/O vectors. The real working set. Always enabled.
2. **Extended** — the rest of the 6502-ish ISA. Opt-in via `.EXTENDED ON`. Defined in `ISA-extended.md` — read that file only when `.EXTENDED ON` appears in the program.
3. **Unsafe** — six illegal opcodes. Opt-in via `.UNSAFE ON`. Defined in `ISA-unsafe.md` — read that file only when `.UNSAFE ON` appears in the program.

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

# 2 · Directives (assemble-time and output-time)

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
- **Extended:** ~40 mnemonics — mix of `L` and `M` — see `ISA-extended.md`
- **Unsafe:** 6 mnemonics — all `F` — see `ISA-unsafe.md`

Write programs in Core. Opt into Extended only when porting existing code or for retro flavor. Unsafe is a museum exhibit behind glass.
