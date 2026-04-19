> Load this file only when `.EXTENDED ON` appears in the program.

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
