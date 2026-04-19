# opcode — test plan (staged)

> Not executed yet. Staged so each phase is shippable on its own. Stage 1 is where most bugs will surface.

## Future ideas (parked)

- **Per-JSR model suffix** (`JSR FIX.H` / `JSR REVIEW.O`) dispatched via `Agent` subagents with `model` override. Subagent self-fetches the ticket via `gh`/`glab` — no prompt-stuffing needed because issue IDs already live in zero-page slots. Real token savings on top of the DSL's existing output-format win, but introduces non-determinism (Haiku vs Opus solve bugs differently) and new failure modes per call. Revisit after stage 1 smoke passes and the core eval ("does Claude reply in assembly reliably?") is confirmed.

## Unit tests

Assembler unit tests live in `test/assemble.test.mjs`. Run with:

```
node --test test/*.test.mjs
```

No dependencies, no `package.json`, no install step. Tests are development-only and not required to use the skill at runtime.

## Context

The `opcode` skill is a pseudo-6502 DSL that drives an ANALYZE → FIX → TEST → PUSH triage loop against a forge. It has four example programs (`examples/peek.s`, `examples/oneshot.s`, `examples/drain-the-swamp.s`, `examples/full-triage.s`) and a forge-agnostic dispatcher (`scripts/forge.mjs`) that wraps `gh` / `glab`. We want to prove the full flow works end-to-end before relying on it — but without immediately committing to seeding two remote test repos.

Two gotchas:

1. **Reasoning vectors** (`ANALYZE`, `FIX`, `TEST`, `LINT`, `REVIEW`) are executed by Claude, not the scripts. Testing means invoking Claude Code in a working copy and feeding it a `.s` program.
2. `scripts/forge.mjs` has a **hardcoded label vocabulary** (`LABEL_BITS`, L18–27: `bug`, `urgent`, `enhancement`, `docs`, `security`, `refactor`, `chore`, `seen`). Any remote repo must seed these labels verbatim.

---

## Stage 1 — Local-only smoke (no forge, no remote)

Goal: exercise the full ISA walk (assemble → walk stream → ANALYZE → FIX → TEST → REVIEW → commit → dry-run PUSH → BRK) on a local working copy with no network, no CLI auth, no cleanup burden.

### Build

A small **`local` driver** added to `scripts/forge.mjs`'s `DRIVERS` map:

- `scripts/drivers/local.mjs` — ~30 lines, same surface as `github.mjs`/`gitlab.mjs`:
  - `fetch({ labels, run })` — reads `.opcode/todos.json`, filters by label mask, returns IDs.
  - `view({ id, run })` — logs the matching todo entry as JSON (mimics `gh issue view --json`).
  - `pr({ branch, run })` — logs what *would* have been pushed (branch name, last commit subject). Never touches a remote.
- `forge.mjs` dispatch: recognise `$OPCODE_FORGE=local` or `"forge": "local"` in `.opcode.json`.
- `forge.mjs doctor`: for `local`, only check git + node + `.opcode/todos.json` readable. Skip `gh`/`glab` auth probes.

`.opcode/todos.json` shape:

```json
[
  { "id": 1, "title": "off-by-one in sum()",  "labels": ["bug"],           "body": "…" },
  { "id": 2, "title": "crash on empty input", "labels": ["bug", "urgent"], "body": "…" },
  { "id": 3, "title": "add --verbose flag",   "labels": ["enhancement"],   "body": "…" }
]
```

String labels, so existing `maskToLabels()` in `forge.mjs` just works.

### Fixture

Throwaway repo at e.g. `~/tmp/opcode-local/`:

- `git init`, initial commit, no remote
- `sum.js` with off-by-one; `input.js` with empty-array crash
- `package.json` with `"test": "node --test"`; two failing `*.test.js` files
- `.opcode/todos.json` as above
- `.opcode.json`: `{"forge": "local"}`

### Runs

1. **Pre-flight**:
   - `node --test test/*.test.mjs` → 33/33 pass
   - `for f in examples/*.s; do node scripts/assemble.mjs "$f" > /dev/null; done` → all four assemble clean
   - `node scripts/forge.mjs doctor` → `forge: local`, all green
   - `node scripts/forge.mjs fetch --labels 1` → `[1, 2]`
2. **Run 1.0 — `peek.s`** (edit local copy to target issue `#1`): expect FETCH → ANALYZE → RTS. No branches created, no commits, no files modified. This is the cheapest "does Claude walk a `.s` at all" check.
3. **Run 1.A — `oneshot.s`** (edit local copy to target issue `#1`): expect FETCH → ANALYZE → FIX edits `sum.js` → TEST passes → commit on the current branch → dry-run PUSH log → BRK. No branch-creation opcode exists in the core ISA, so commits land wherever `HEAD` is.
4. **Run 1.B — `drain-the-swamp.s`**: expect two commits (one per bug) on the current branch, issue #3 untouched, two dry-run PUSH logs.

### Pass criteria

- [ ] Claude's reply is assembly, not prose
- [ ] All three programs run top-to-bottom, no user interrupts
- [ ] `peek.s` produces no commits and no modified files
- [ ] `oneshot.s` and `drain-the-swamp.s` produce real commits (current branch is fine)
- [ ] `node --test` passes after each commit (scoped to the files touched by that commit)
- [ ] `PUSH` log matches what `gh pr create --fill` would have been
- [ ] Issue #3 (`enhancement`) never touched

If stage 1 passes, skill **logic** is proven. Stages 2/3 only exist to prove the forge drivers.

---

## Stage 2 — GitHub smoketest repo

Prove `drivers/github.mjs`. Create `github.com/<you>/opcode-smoketest` with the 8 hardcoded labels and issues #1–#3 mirroring stage-1 todos. Seed the same defects. Remove `.opcode.json` so auto-detect picks `github` from remote. Repeat Runs 1.A / 1.B without `CA_DRY_RUN`. Expect real PRs linked to issues.

`oneshot.s` hardcodes `#42`. Edit the local copy to `#1`, don't touch upstream.

---

## Stage 3 — GitLab smoketest repo

Same as stage 2 on `gitlab.com/<you>/opcode-smoketest`. Expect **MRs** not PRs. Verifies `glab mr create --source-branch` in `drivers/gitlab.mjs` L19–23. If default branch differs from `main`, pass `--target-branch` explicitly.

---

## Files referenced

- `SKILL.md` — skill entry point; must be discoverable from test repo
- `ISA.md` — Claude reads at start of every run
- `scripts/forge.mjs` L16 (`DRIVERS` map — needs `local`), L18–27 (`LABEL_BITS`), L41–43 (`.opcode.json`), L54–56 (`CA_DRY_RUN`)
- `scripts/drivers/github.mjs`, `scripts/drivers/gitlab.mjs` — shape reference for `local.mjs`
- `scripts/drivers/local.mjs` — **new**, stage 1 deliverable
- `examples/peek.s`, `examples/oneshot.s`, `examples/drain-the-swamp.s`, `examples/full-triage.s`

## Out of scope

- Decorative / flavor directives: `.UNSAFE ON`, `.EXTENDED ON`, `.NUMERIC ON`
- `full-triage.s` and the `.IRQ` / `RTI` preempt path — manual demo only; not part of the smoke set
- Token-count benchmarking (qualitative only)
- `gh` / `glab` auth setup — not needed until stage 2/3

## Risks

1. **Skill discoverability from a foreign working dir.** If Claude Code doesn't find `SKILL.md` from the test repo, `/asm` won't trigger. Fix: install opcode as a user-level skill under `~/.claude/skills/opcode/` (symlink `SKILL.md`, `ISA.md`, `OPCODES.md`, `scripts/`, **`examples/`**) before stage 1. The `examples/` symlink is easy to forget — Claude falls back on CWD heuristics without it and may fail to locate `.s` programs when invoked from a foreign fixture.
2. **Issue numbering in `oneshot.s`** is hardcoded `#42` — edit the copy.
3. **FIX quality**: keep defects mechanical. If `oneshot.s`'s retry branch fires more than once, fixture is too hard for a smoke test.
4. **`local.mjs` drift**: if `github`/`gitlab` driver contracts change, `local.mjs` will silently fall out of sync. Keep it in the same directory so the similarity is obvious.
