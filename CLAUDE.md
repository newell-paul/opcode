# opcode

A pseudo-6502 DSL that drives an ANALYZE → FIX → TEST → PUSH triage loop against a forge. Three example programs (`examples/peek.s`, `examples/oneshot.s`, `examples/drain-the-swamp.s`) and a forge-agnostic dispatcher (`scripts/forge.mjs`) that wraps `gh` / `glab`.

**Always read `ISA.md` at the start of every run.** It is the single source of truth for the Core ISA.

## Key facts

- Reasoning vectors (`ANALYZE`, `FIX`, `TEST`, `LINT`, `REVIEW`) are executed by Claude, not the scripts.
- `scripts/forge.mjs` has a hardcoded label vocabulary: `bug`, `urgent`, `enhancement`, `docs`, `security`, `refactor`, `chore`, `seen`. Any remote repo must seed these labels verbatim.
- Forge is auto-detected from `git remote`. Override with `OPCODE_FORGE=github|gitlab|local` or `{"forge": "..."}` in `.opcode.json`.
- The `local` driver reads `.opcode/todos.json` — no auth, no network.

## Unit tests

```
node --test test/*.test.mjs
```

No dependencies, no install step. Development-only — not required at runtime.

## Drivers

All drivers in `scripts/drivers/` expose the same surface: `fetch`, `view`, `pr`. Keep `local.mjs` in sync with `github.mjs`/`gitlab.mjs` — if the driver contract changes, update all three.
