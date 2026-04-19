---
name: opcode
description: A semantic 6502-inspired DSL for structured, replayable triage-and-fix workflows against a GitHub or GitLab project. Invoke when the user asks you to execute a .s file, references opcodes like LDA, JSR, BRK, or says "assemble this", "run this asm", or "/asm". Walks a tiny 15-opcode core ISA to fetch issues, edit files, run tests, commit, push, and open PRs/MRs — and responds in the same DSL.
---

# opcode

### Opcode Oriented Programming (OOP)
### 6502 mnemonics. Modern AI execution. Fewer tokens.

> Every program ends the same way: `BRK`. Commit the work. Halt the machine.

## Why this exists

Three real wins, in order of importance:

1. **Fewer tokens.** Claude's *output* — the expensive side of the pipe — drops by 5–8× because the response format is itself a `.s` program. No filler, no restatement, no markdown, no "Let me now…". A full triage session that would normally be 800 tokens of prose becomes ~150 tokens of assembly trace. See "Output format" below for the rules that earn this.
2. **Structured, replayable workflows.** A `.s` file is a versionable, diffable, reviewable recipe. Commit it alongside the code, re-run it on the next batch of issues, and read the trace back as an audit log.
3. **A forcing function.** The 6502 aesthetic is fun, but the constraint is useful — you commit to a verb sequence before execution instead of wandering through chat mode, and the resulting traces scan faster than prose.

This is a **semantic 6502-inspired DSL**, not literal 6502. The opcodes *look* like 6502 because the aesthetic is fun and the constraint is useful, but the language is tuned for issue triage, not byte-accurate emulation. The **core ISA is 15 opcodes** you can hold in your head; an optional extended layer mimics more of the real 6502 for completeness and nostalgia.

> **Honest note on "fewer tokens":** the savings come almost entirely from Claude's output format, not from the assembly input. Writing `JSR FIX` instead of "please fix it" is a wash. The win is that Claude's *reply* is also assembly, and BPE tokenization rewards short structured output. Sessions with many tool calls save the most — prose Claude narrates every step; opcode Claude just emits one trace line per instruction.

## Ticket contract — tickets are the task package

Opcode treats a forge ticket (GitHub issue / GitLab issue) as a **self-contained task package**. Zero-page slots hold issue IDs, not inline blobs — the ticket is the context pointer, and the ticket itself must carry everything needed to do the work. If your team culture is *"fix the bug, see the Slack thread,"* opcode will underperform; if your tickets are written well, opcode has everything it needs from one `gh issue view` call.

What `ANALYZE` is expected to pull from a ticket, in order:

1. **Title and body.** The primary description. `gh issue view <id> --json title,body` on GitHub; `glab issue view <id> --output json` on GitLab.
2. **Recent comments.** Clarifications, repro updates, and ACs often live in comments rather than the original body. Pull at least the last several; include `--json comments` on GitHub.
3. **Labels.** Already used for the bitmask filter at `FETCH` time, but `ANALYZE` should also note them as hints (e.g. `security` label means run a stricter `REVIEW`).
4. **Embedded images.** Screenshots of bugs, UI mocks, and architecture diagrams appear as CDN URLs in the markdown body (`https://user-images.githubusercontent.com/...` on GitHub, `https://gitlab.com/.../uploads/...` on GitLab). Fetch the URL and pass the image to vision — do not skip, guess, or narrate around it.
5. **PDF and text attachments.** Readable via the `Read` tool after download (PDFs up to 20 pages per call). Failing test logs, spec documents, and crash dumps often arrive this way.
6. **Linked issues / PRs / commits.** When the body or a comment cross-references another ticket or a prior commit, follow the link and pull that too. Don't infer what the linked item says.

What opcode **cannot** consume from a ticket, and should narrate as missing:

- Binary attachments other than PDFs (zip, executables, proprietary formats)
- Video attachments
- External links behind auth (private Google Docs, Figma with no public share, internal wikis)

When any of these are the only source of context and the ticket body alone is insufficient, halt with `.ERR missing context: <what>` rather than guessing. A ticket that cannot be resolved to a self-contained task is a legitimate failure mode, and recording it as one is more useful than an educated-guess fix.

## Authoritative reference

**Always read `ISA.md` at the start of every run.** It is the single source of truth. Start with the **Core ISA** section. If the user writes an opcode that isn't in the Core ISA, check whether it's in Extended (permitted with `.EXTENDED ON`) or Unsafe (permitted with `.UNSAFE ON`). If it's in none of those three sections, stop and say so — do not invent behavior.

`OPCODES.md` is the printable cheat sheet.

## The core 15

This is the entire working vocabulary. Everything `peek.s`, `oneshot.s`, and `drain-the-swamp.s` actually use fits in this list. `full-triage.s` layers on `.IRQ` + `RTI` from the extended set.

| # | Op | Effect | Flags |
|---|---|---|---|
| 1 | `LDA` | Load issue / slot / queue entry into `A` | `N Z` |
| 2 | `STA` | Persist `A` to a zero-page slot | `-` |
| 3 | `LDX` | Initialize the loop cursor | `N Z` |
| 4 | `INX` | Advance the loop cursor | `N Z` |
| 5 | `CPX` | Compare loop cursor to a bound | `N Z C` |
| 6 | `JSR` | Call a vector (`FETCH`, `FIX`, `TEST`, `PUSH`, `ANALYZE`, `LINT`, `REVIEW`, `PULL`, `CLONE`) or a user label | `-` |
| 7 | `RTS` | Return from subroutine | `-` |
| 8 | `BRK` | **Commit and halt.** Uses `$05` as commit message. | `-` |
| 9 | `BEQ` | Branch if `Z=1` — empty queue slot or clean diff | `-` |
| 10 | `BNE` | Branch if `Z=0` — something changed, keep going | `-` |
| 11 | `BCC` | Branch if `C=0` — tests failed OR reviewer concern | `-` |
| 12 | `BCS` | Branch if `C=1` — tests passed AND review clean | `-` |
| 13 | `JMP` | Unconditional jump | `-` |
| 14 | `PHA` | Push `A` as a new pending todo (`TaskCreate`) | `-` |
| 15 | `PLA` | Pop the newest pending todo into `A` | `N Z` |

Plus **9 I/O vector aliases** that are `JSR` operands, not separate opcodes: `FETCH`, `PULL`, `PUSH` (aka `OPEN_PR`/`OPEN_MR`), `CLONE`, `ANALYZE`, `FIX`, `TEST`, `LINT`, `REVIEW`.

## Extended (compatibility layer)

The full 6502-ish ISA — transfers, arithmetic, logic, shifts, extra branches, and more flag ops — lives in `ISA.md` under **Extended**. It's gated at the documentation level by the `.EXTENDED ON` directive: programs can opt in for retro completeness or to port existing 6502 code. Core programs should not use extended ops. Extended ops retain their honesty tags (`M` = metaphor, narrated not executed).

## Unsafe (illegal opcodes)

Six real undocumented 6502 ops (`LAX`, `SAX`, `DCP`, `ISC`, `SLO`, `RLA`) live behind `.UNSAFE ON` in `ISA.md` under **Unsafe**. All are `F` = flavor — narrated, never executed. They exist because the joke demands them.

## Execution loop

**Resolving skill scripts:** `scripts/forge.mjs` and `scripts/assemble.mjs` are the skill's own infrastructure — they live under the skill's install directory, NOT the user's working copy. The installed skill path is authoritative; CWD is only a fallback for the developer edge case of running from the source repo.

1. **Default path:** `~/.claude/skills/opcode/scripts/forge.mjs` — use this unconditionally unless step 2 applies.
2. **Source-repo override:** only if the CWD looks like the opcode source repo itself (i.e. `./SKILL.md` exists AND `./scripts/forge.mjs` exists), use `./scripts/forge.mjs` instead.
3. Only if BOTH paths are missing (verify with `ls`, not assumption), halt with `.ERR "opcode infrastructure not found"`.

Never assume CWD contains `scripts/`. The user's working copy is the *target* of triage, not the skill's installation.

**Resolving `.s` programs:** when the user asks to run a `.s` file by name (e.g. `peek.s`, `oneshot.s`), resolve in this exact order. **No filesystem search. No glob. No `find` / `grep`.** Each step is a single `ls` check.

1. **CWD:** `./<name>.s` — use if it exists. The user's local copy is authoritative.
2. **Skill examples:** `~/.claude/skills/opcode/examples/<name>.s` — use only if step 1 missed. Emit `.NOTE "loaded from skill examples"` so the user knows you didn't run their local copy.
3. **Neither:** halt immediately with `.ERR "<name>.s not found in CWD or skill examples"`. Do not search elsewhere.

Two non-negotiables: this resolution must complete in ≤2 tool calls (one `ls` per candidate), and the source actually used must be visible in the trace. Don't be helpful by hunting — be deterministic by failing fast.

0. **First-run preflight.** Run the resolved `forge.mjs doctor`. If any check fails, print the output to the user **verbatim** and halt — do not try to install or fix anything yourself. Skip this step on subsequent invocations in the same session.
1. Assemble: `node <resolved>/scripts/assemble.mjs <path>` (or pipe via stdin). You get a JSON opcode stream.
2. Initialize VM state in your working notes:
   - Registers: `A=0 X=0 Y=0 PC=0 SP=0xFF`
   - Flags: `N=0 V=0 D=0 I=0 Z=0 C=0`
   - Memory: empty map; zero-page (`$00–$2F`) and stack page (`$0100–$01FF`) are the hot zones
3. Walk the opcode stream. For each instruction, execute per `ISA.md`, update flags/memory, and emit one trace line in the output format below.
4. Halt on `BRK` or `RTS` at stack depth 0, or on `.ERR`.

## Zero-page slot map

Use the named aliases. Raw hex (`$00`, `$20`, etc.) still works but is discouraged in new code.

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

The `$0100–$01FF` page is the todo stack (see below).

## Literal formats

The assembler accepts three literal formats. **Decimal is preferred** in all new code:

- `#42` — decimal (preferred)
- `#$2A` — hex (legal; useful for bitmasks where you want to see the bit pattern)
- `#%00101010` — binary (legal; useful for label-filter masks)

Claude's output should default to decimal. Use hex or binary only when the value is genuinely easier to read that way (e.g. a bitmask).

## Todo stack ↔ Claude Code task list

The `$0100` page **IS** the Claude Code todo list:

- `PHA` → `TaskCreate`, subject = current value of `A`
- `PLA` → `TaskList`, find the most recently created pending task, mark it `in_progress`, load its subject into `A`, mark it `completed`
- `JSR` pushes a return-pc breadcrumb as a task with `{return_pc: N}` metadata. `RTS` pops it.

Extended adds `TSX` / `TXS` / `PHP` / `PLP` on top of this mapping for the 6502-completeness feel.

## I/O vectors → real commands

All forge interaction goes through `scripts/forge.mjs` (resolved per the **Execution loop** rules — try CWD, then `~/.claude/skills/opcode/scripts/`), which auto-detects GitHub (`gh`), GitLab (`glab`), or an override from `$OPCODE_FORGE` / `.opcode.json`. See `FORGE.md` for details.

- `JSR FETCH` has **two modes**, chosen by how the caller set up registers:
  - **Single-issue** — `A` holds an issue ID, `LABELS` ($20) is unset/zero. FETCH pulls that one issue's metadata into `ISSUE` ($00). Example: `peek.s:3 — LDA #42 ; issue 42 / JSR FETCH`.
  - **Queue** — `LABELS` ($20) is set to a non-zero label mask (via explicit `STA LABELS`). FETCH runs `forge.mjs fetch --labels <mask>` and fills `$10–$1F` with matching issue IDs. A's prior value is irrelevant. Example: `drain-the-swamp.s:4–6 — LDA #1 / STA LABELS / JSR FETCH`.
  - **Never treat `A` as a label mask implicitly.** A raw `LDA #n / JSR FETCH` (no `STA LABELS` between them) is single-issue mode for issue `n`. The mask interpretation requires an explicit `STA LABELS`.
- `JSR PULL`  → `git pull`
- `JSR PUSH`  → `git push -u origin <branch>` then `node <resolved>/forge.mjs pr` (opens a PR on GitHub, an MR on GitLab — same vector, same effect). Aliases: `OPEN_PR`, `OPEN_MR`.
- `JSR CLONE` → `git clone` the project referenced by `A`

## Reasoning vectors → things you do yourself

- `JSR ANALYZE` — read the issue in `A`, produce a short plan, write it to `$03`
- `JSR FIX` — edit the file at `$02` to resolve issue `A` (use `Edit`/`Write`)
- `JSR TEST` — run the project's test command. **Sets `C=1` on pass**, `C=0` on fail.
- `JSR LINT` — run linters. **Sets `Z=1` on clean**.
- `JSR REVIEW` — re-read the diff in `$03`. **Sets `C=1` if the diff looks safe**, `C=0` if you have concerns. (This differs from the extended ISA's `N`-based semantics so `BCC`/`BCS` alone cover both test and review in the core.)

## `BRK` — commit and halt

`BRK` is re-purposed. When you hit it:
1. Use the string at `$05` as the commit message (or auto-generate from issue `A` if empty)
2. Stage the files modified since the last `BRK` or program start
3. `git commit`
4. **Halt program execution**

## Flags cheat sheet (core)

| Flag | Set by | Read by |
|---|---|---|
| `C` | `TEST` (pass), `REVIEW` (clean) | `BCC` / `BCS` |
| `Z` | `LDA`, `LINT` (clean), `CPX`, `INX` | `BEQ` / `BNE` |
| `N` | `LDA` (high bit), arithmetic | (extended) |
| `D` | `.DRYRUN ON` / `.DRYRUN OFF` directives | runtime |

## Output format — Claude responds in 6502

**This is the single most important rule in the skill.** While `opcode` is active, Claude's entire response is itself a valid `.s` program. The trace IS the reply. There is no prose around it, before it, or after it.

### Absolute rules

1. **Every line is one of three things:** an instruction (`OP  operand  ; comment`), a directive (`.ASK`, `.NOTE`, `.ERR`, `.DIFF`, `.DUMP`, `.FORGE`, `.DRYRUN`, `.TRACE`), or a bare comment line (`; ...`). Nothing else.
2. **No PC addresses in the trace.** Drop the `$0600` column entirely. It's decorative and wastes tokens. Start each instruction line with the mnemonic.
3. **Decimal literals by default.** Write `LDA #42`, not `LDA #$2A`. Hex and binary are legal for bitmasks but decimal is preferred everywhere else.
4. **Named slots, not hex addresses.** Write `STA LABELS`, `LDA QUEUE,X`, `STA MSG` — never `STA $20`, `LDA $10,X`, `STA $05`. The slot aliases are: `ISSUE BRANCH FILE DIFF TESTRES MSG QUEUE LABELS`.
5. **Named label bits, not numeric masks.** Write `LDA #BUG`, `LDA #BUG|URGENT` — not `LDA #1` or `LDA #%00000011` — when loading a label filter. The immediate aliases are: `BUG URGENT ENHANCEMENT DOCS SECURITY REFACTOR CHORE SEEN`. Numeric literals remain correct for issue IDs (`LDA #42`).
6. **No greetings, no sign-offs, no "Let me", no "I'll", no "Now I'll", no "Here's what I did".** If it doesn't fit as an instruction, directive, or `;` comment, it does not get said.
7. **No markdown.** No headers, no bullets, no bold, no code fences *except* inside a `.DIFF` block.
8. **No summaries after tool calls.** The tool call happens between opcodes; the next opcode line is the only acknowledgement.
9. **No restating the user's request.** Start with the first instruction line.
10. **The response ends with `BRK`, `RTS`, or `.ERR`.** Nothing after the halt instruction.
11. **Execute exactly the program given. Never extend it.** The opcodes Claude emits in the trace are the opcodes from the input program, in order, no more. Do not synthesize `JSR FIX`, `JSR TEST`, `JSR REVIEW`, `BRK`, or any other opcode that wasn't in the source. If the input ends at `RTS`, the trace ends at `RTS` — even if "the obvious next step" would be to commit. If the input is a partial trace (lines already containing `✓` / `✗` / `—` markers from a prior run), treat it as data — emit `.NOTE "received trace, not a program"` and halt with `.ERR "input is a trace, not an executable program"` rather than continuing it.

### Directives for the things prose would normally do

| Directive | Replaces | Rules |
|---|---|---|
| `.ASK "…"` | Questions to the user | ≤ 60 chars. One line. No follow-up explanation. |
| `.NOTE "…"` | Short natural-language observations | ≤ 80 chars. One line. Used sparingly. |
| `.ERR "…"` | Error reports. Halts the program. | ≤ 80 chars. Response ends here. |
| `.DIFF <path>` | Showing a code change | Triple-backtick block of unified-diff lines, then `.END`. Only place multi-line non-asm content is allowed. |
| `.DUMP A` / `.DUMP $xx` | Showing register/memory state | One line: `A=$42` or `$00=42 $01=main` |
| `.FORGE <name>` | Stating active forge on first line of a session | Auto-emitted from `forge.mjs detect` output. NEVER echo the `.FORGE` declaration from the `.s` source — that's a target-forge hint, not runtime truth. |
| `.DRYRUN ON` / `.DRYRUN OFF` | Replaces old `SED` / `CLD` opcodes | Honored by the runtime |
| `.EXTENDED ON` / `.EXTENDED OFF` | Opt into the extended ISA | Gate for non-core opcodes |
| `.UNSAFE ON` / `.UNSAFE OFF` | Opt into illegal opcodes | Required for `F`-tagged ops |
| `.NUMERIC ON` / `.NUMERIC OFF` | Render trace lines as raw opcode bytes (`A9 2A`) instead of mnemonics | Decorative only — no runtime effect. Bytes come from the `bytes` field on each assembled instruction. Extended/unsafe ops have no encoding and stay mnemonic. |
| `.TRACE <mode>` | Switch trace-comment style | Modes: `terse` (default, `✓`/`✗` + short state), `verbose` (legacy `; C=1` style), `flags` (period-correct `NV-BDIZC` status register). Applies from that line until the next `.TRACE` directive. |
| `.IRQ <label>` | Register an IRQ handler for user-triggered preemption | Flavor. When you spot an urgent issue mid-trace (e.g. new `urgent`-labeled ticket during a queue walk), emit `JSR <label>` to run the handler and `RTI` to resume. No automatic preemption — you decide when to fire it. |

### Example responses

**User:** "fix issue 42"

```
.FORGE  github
LDA     #42             ; issue 42
JSR     FETCH           ; gh issue view 42 → "null ref auth.ts"
JSR     FIX             ; Edit src/auth.ts L42 add null check
JSR     TEST            ; pnpm test → 47/47 C=1
JSR     REVIEW          ; diff +3 -0 C=1
BRK                     ; commit "fix(auth): null check L42" HALT
;                         PR #128 opened
```

**User:** "run drain-the-swamp.s"

```
.FORGE  github
LDA     #1              ; mask=bug
STA     LABELS
JSR     FETCH           ; issues: 101 104 108
LDX     #0
LDA     QUEUE,X         ; issue 101
JSR     FIX             ; Edit src/login.ts add guard
JSR     TEST            ; 52/52 C=1
BRK                     ; commit fix(login) #101
INX
LDA     QUEUE,X         ; issue 104
JSR     FIX             ; Edit src/db.ts retry logic
JSR     TEST            ; 51/52 C=0
.NOTE   "db test flaky"
INX
LDA     QUEUE,X         ; issue 108
JSR     FIX             ; Edit README.md typo
JSR     TEST            ; 52/52 C=1
BRK                     ; commit docs #108
JSR     PUSH            ; PRs #129 #130
RTS                     ; done 2/3
```

**User:** "fix issue 42, show bytes" (`.NUMERIC ON`)

```
.NUMERIC ON
A9 2A           ; LDA #42
20 00 FE        ; JSR FETCH
20 00 81        ; JSR FIX
20 00 82        ; JSR TEST     C=1
00              ; BRK          commit HALT
```

**User:** "triage bugs, preempt on urgent" (`.IRQ` handler)

```
.FORGE  github
.IRQ    urgent_handler
LDA     #1              ; mask=bug
STA     LABELS
JSR     FETCH           ; 101 104 108
LDX     #0
LDA     QUEUE,X         ; 101
JSR     FIX
JSR     TEST            ; 47/47 C=1
BRK                     ; commit #101
.NOTE   "new urgent issue 777 landed"
JSR     urgent_handler  ; IRQ fire
INX
LDA     QUEUE,X         ; 104 — resume queue
JSR     FIX
JSR     TEST            ; 52/52 C=1
BRK                     ; commit #104
RTS                     ; done
urgent_handler:
  LDA   #777
  JSR   FIX
  JSR   TEST            ; C=1
  BRK                   ; commit #777
  RTI                   ; resume queue
```

**User:** "the tests are failing, why?"

```
.DUMP   TESTRES         ; last test result: 2 failed
.NOTE   "src/db.ts:44 timeout on flaky mock"
.ASK    "retry with longer timeout?"
```

### `.DIFF` — strict unified-diff format

Every `.DIFF` block MUST contain, in this order:

1. `--- a/<path>` and `+++ b/<path>` file headers
2. One or more hunk headers: `@@ -oldStart,oldCount +newStart,newCount @@`
3. Lines prefixed `-` (removed), `+` (added), or ` ` (space, for context)
4. `.END` on its own line

Good:

~~~
.DIFF sum.js
```diff
--- a/sum.js
+++ b/sum.js
@@ -1,5 +1,5 @@
 export function sum(xs) {
   let total = 0;
-  for (let i = 0; i < xs.length - 1; i++) total += xs[i];
+  for (let i = 0; i < xs.length; i++) total += xs[i];
   return total;
 }
```
.END
~~~

Hunk-header math: `oldStart` and `newStart` are the first line shown in each side; `oldCount` and `newCount` are the total number of lines shown on each side (counting context lines + `-` lines for the old side, context + `+` lines for the new side). For the example above: 5 lines from line 1 on both sides → `@@ -1,5 +1,5 @@`.

Bad (any of these disqualify the block):

- Both lines prefixed `-` — the new line MUST start with `+`.
- Bare `@@` with no line ranges.
- Missing `--- / +++` headers or missing `.END`.
- Guessed line counts in the hunk header. If you can't count exactly, **omit the `.DIFF` block** and emit `.NOTE "edited <path> Lx: <one-line summary>"` instead. Wrong hunk math is worse than no diff.

### Comment discipline

Instruction-line comments state what the machine just did. They are telemetry, not commentary.

OK:

```
LDA     #1              ; issue 1
JSR     FETCH           ; bug|urgent
JSR     TEST            ; 47/47 C=1
```

Not OK:

```
LDA     #1              ; issue 1 (override of peek.s #42 — see test plan)
JSR     FETCH           ; fetching the issue from the forge driver now
JSR     TEST            ; all tests passed so we can proceed
```

Rules:

1. One fact per comment. No splicing two observations.
2. No justifications (`override of…`, `see…`, `because…`). Use `.NOTE` if context is truly needed.
3. No English verbs when a state assignment works. `; C=1` beats `; tests passed`.
4. Don't repeat what a directive just printed. If `.DUMP TESTRES` rendered the result, the next instruction doesn't re-state it.

### Trace symbols

The default trace style is **terse**. Each instruction ends with a status marker and a short state payload. No `; ` prefix before the marker — the marker replaces the semicolon.

| Marker | Meaning |
|---|---|
| `✓` | Success. For `TEST`/`REVIEW` the relevant flag is set (`C=1`); for `LINT` `Z=1`; for `FIX` the edit applied; for `FETCH` the queue is populated; for `BRK` the commit landed. |
| `✗` | Failure. `C=0`, `Z=0`, or the side-effect failed. Payload describes what. |
| `—` | Noop / skipped. Use when an instruction deliberately does nothing (e.g. `FIX` detects no diff and the program skips `BRK`). |

Example (terse, default):

```
.FORGE  local
LDA     #1              ✓ A=1
STA     LABELS          ✓ mask=bug
JSR     FETCH           ✓ queue: 1 2
LDA     QUEUE           ✓ issue 2
JSR     ANALYZE         ✓ input.js empty-array crash
JSR     FIX             ✓ input.js L2 guard
JSR     TEST            ✓ 5/5
JSR     REVIEW          ✓ +1 -0
BRK                     ✓ d37c15f fix(input) #2
```

### Trace modes

- **`.TRACE terse`** (default) — `✓`/`✗`/`—` + compact payload. Shortest, scannable, single-token markers.
- **`.TRACE symbol`** — marker-only. Just `✓`/`✗`/`—` with NO payload after. Critical state (commit SHA, failure reason, fetched issue IDs) goes on its own line via `.NOTE` or `.ERR`. Maximum signal-to-noise for glanceable traces; loses inline context.
- **`.TRACE verbose`** — legacy `; C=1` / `; 3/3 C=1` style. Use when you need flag values visible on the page (teaching, debugging).
- **`.TRACE flags`** — period-correct 6502 status register: `; NV-BDIZC` with `.` for clear bits. E.g. `; ......ZC` means `Z=1` and `C=1`. Hardware-accurate, cryptic.

Mix within a session: `.TRACE <mode>` applies from that line until the next `.TRACE` directive. Existing examples in this document predate the default change and use `verbose`; treat them as illustrative of *instruction flow*, not of *preferred comment style*.

Example (`.TRACE symbol`):

```
.TRACE  symbol
.FORGE  local
LDA     #1              ✓
STA     LABELS          ✓
JSR     FETCH           ✓
.NOTE   "queue: 1 2"
LDX     #0
LDA     QUEUE,X         ✓
JSR     FIX             ✓
JSR     TEST            ✓
JSR     REVIEW          ✓
BRK                     ✓
.NOTE   "fd1fd30"
```

### The forcing function

The temptation to add "just one sentence of context" is the whole failure mode. Resist it absolutely. If the user needs more context than fits in a `; comment` or a `.NOTE`, they will ask — and the answer goes back in the same format. The constraint is the feature.

### When this rule does NOT apply

- **Plan mode / exploratory chat.** If the user is asking "what should we do?" or "how does X work?", respond in normal prose.
- **Meta-questions about the skill itself.** "What opcodes do I have?" is a tool question, not an execution request. Prose is fine.
- **Explicit override.** If the user says "explain that in English" — switch to prose for that response only.

The rule is: **if the user's request is an execution request, the reply is assembly. Everything else is normal.**

## Safety

- **Never** execute `F`-tagged opcodes (`LAX`, `SAX`, `DCP`, `ISC`, `SLO`, `RLA`) at all — even with `.UNSAFE ON`, they are narrated, never run.
- **Never** execute extended opcodes without `.EXTENDED ON` appearing earlier in the program.
- **Always** honor `.DRYRUN ON` — print the intended action in the trace but don't shell out.
- **`.DRYRUN` is sourced from the program or the user, never inferred.** Enable it iff: the `.s` source contains `.DRYRUN ON`, the user typed it in their prompt, or `CA_DRY_RUN=1` is in the environment. Do not infer dry-run from context (e.g. "this is the `local` forge" or "this is a first run"). The `local` driver already guarantees no network by design — its presence is not a reason to dry-run `FIX` / `TEST` / `BRK`.
- If `git` operations would lose uncommitted work, stop and ask the user via `.ASK`.
