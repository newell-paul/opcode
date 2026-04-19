> Load this file only when `.UNSAFE ON` appears in the program.

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
