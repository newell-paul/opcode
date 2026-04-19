# Opcode cheat sheet

One page. Core first. For flag effects and the full Extended/Unsafe layers, see `ISA.md`.

## Core ISA — 15 opcodes

Everything in core is load-bearing. This is the whole working vocabulary for real programs.

| # | Op | What it does |
|---|---|---|
| 1 | `LDA #imm` / `LDA $zp` / `LDA $zp,X` | Load issue / slot / queue entry into `A` |
| 2 | `STA $zp` | Persist `A` to a zero-page slot |
| 3 | `LDX #imm` | Initialize the loop cursor |
| 4 | `INX` | Advance the loop cursor |
| 5 | `CPX #imm` | Compare loop cursor to a bound |
| 6 | `JSR label` | Call vector (`FETCH`, `FIX`, `TEST`, `PUSH`, etc.) or subroutine |
| 7 | `RTS` | Return from subroutine |
| 8 | `BRK` | **Commit and halt.** Uses `$05` as commit message |
| 9 | `BEQ label` | Branch if `Z=1` — empty slot or clean diff |
| 10 | `BNE label` | Branch if `Z=0` — more work to do |
| 11 | `BCC label` | Branch if `C=0` — tests failed OR review concern |
| 12 | `BCS label` | Branch if `C=1` — tests passed AND review clean |
| 13 | `JMP label` | Unconditional jump |
| 14 | `PHA` | Push `A` as a new pending todo (real `TaskCreate`) |
| 15 | `PLA` | Pop newest pending todo into `A` (real `TaskList` → complete) |

## Core I/O vectors (JSR operands, not separate opcodes)

| Vector | Mnemonic | What it does | Sets |
|---|---|---|---|
| `$FE00` | `FETCH` | Fill `$10–$1F` with issue IDs matching the label mask at `$20` | — |
| `$FE03` | `PULL` | `git pull` current branch | — |
| `$FE06` | `PUSH` / `OPEN_PR` / `OPEN_MR` | `git push` + forge PR/MR create | — |
| `$FE09` | `CLONE` | `git clone` project `A` | — |
| `$8000` | `ANALYZE` | Read issue `A`, write plan to `$03` | — |
| `$8100` | `FIX` | Edit file at `$02` to resolve issue `A` | — |
| `$8200` | `TEST` | Run project test command | `C=1` pass |
| `$8300` | `LINT` | Run linters | `Z=1` clean |
| `$8400` | `REVIEW` | Self-review diff in `$03` | `C=1` clean |

## Zero-page slot map

Use the named aliases in new code. Raw hex addresses still work but are discouraged.

| Alias | Addr | Meaning |
|---|---|---|
| `ISSUE` | `$00` | current issue ID |
| `BRANCH` | `$01` | branch name |
| `FILE` | `$02` | current file |
| `DIFF` | `$03` | diff / plan buffer |
| `TESTRES` | `$04` | last test result |
| `MSG` | `$05` | commit message |
| `QUEUE` | `$10` | base of fetched issue queue (`$10–$1F`) |
| `LABELS` | `$20` | label filter mask |
| — | `$0100–$01FF` | the todo stack (Claude Code task list) |

## Label bit aliases

Use named label bits in immediate values when loading a label filter. Combine with `|`.

| Alias | Bit | Label |
|---|---|---|
| `BUG` | `0x01` | bug |
| `URGENT` | `0x02` | urgent |
| `ENHANCEMENT` | `0x04` | enhancement |
| `DOCS` | `0x08` | docs |
| `SECURITY` | `0x10` | security |
| `REFACTOR` | `0x20` | refactor |
| `CHORE` | `0x40` | chore |
| `SEEN` | `0x80` | seen |

Examples: `LDA #BUG`, `LDA #BUG|URGENT`, `LDA #SECURITY|URGENT`.

## Literal formats

- `#42` — **decimal (preferred)**
- `#$2A` — hex (legal; use for bitmasks)
- `#%00101010` — binary (legal; use for label masks)

## Directives

| Directive | What it does |
|---|---|
| `.ORG $0600` | Program origin |
| `.DRYRUN ON` / `.DRYRUN OFF` | Toggle dry-run mode |
| `.EXTENDED ON` / `.EXTENDED OFF` | Opt into the Extended ISA |
| `.UNSAFE ON` / `.UNSAFE OFF` | Opt into illegal opcodes (narrated only) |
| `.NUMERIC ON` / `.NUMERIC OFF` | Render trace lines as raw opcode bytes instead of mnemonics (decorative) |
| `.IRQ <label>` | Register `<label>` as the IRQ handler. Fire manually with `JSR <label>`, return with `RTI` |
| `.TRACE ON` / `.TRACE OFF` | Verbose opcode narration |
| `.FORGE <name>` | Emitted by Claude after `forge.mjs detect` |
| `.ASK "…"` | Question to user (≤60 chars) |
| `.NOTE "…"` | Short observation in output (≤80 chars) |
| `.ERR "…"` | Error state, halts program (≤80 chars) |
| `.DIFF <path>` / `.END` | Inline unified diff block |
| `.DUMP A` / `.DUMP $xx` | Show register or memory slot |
| `.WATCH A` | Print register at this point |

## Smallest useful program

Six opcodes, three core flags in play. This is the heart of what the skill does.

```asm
        LDA     #42         ; issue 42
        JSR     FETCH
        JSR     FIX
        JSR     TEST
        BCC     skip        ; tests failed → bail
        BRK                 ; commit + halt
skip:   RTS                 ; leave uncommitted
```

For an even simpler "just inspect a ticket" program (no fix, no commit), see `examples/peek.s`. The full example set in `examples/`:

- `peek.s` — fetch + analyze + halt
- `oneshot.s` — fix one issue with a retry branch
- `drain-the-swamp.s` — drain the `bug` queue via the todo stack

## Extended and Unsafe

Extended (~40 mnemonics) and Unsafe (6 illegal opcodes) live in `ISA-extended.md` and `ISA-unsafe.md`. You opt in with `.EXTENDED ON` or `.UNSAFE ON`. Most extended ops are **metaphor** — narrated in the trace but not executed. Unsafe ops are pure flavor — narrated, never executed, not even with the directive set.

You don't need either layer to write a real program.
