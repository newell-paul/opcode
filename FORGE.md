# Forge configuration

## Getting started (fresh install)

Run the preflight check before anything else:

```sh
node scripts/forge.mjs doctor
```

It verifies:

- `git` is installed
- `node` is installed
- the forge can be detected from your git remote (or override)
- the matching CLI (`gh` or `glab`) is installed
- the matching CLI is authenticated

For any failing check, `doctor` prints the exact command to fix it. A typical fresh-start sequence on macOS:

```sh
brew install gh                       # or: brew install glab
gh auth login                         # or: glab auth login
node scripts/forge.mjs doctor         # confirm everything is green
```

On Linux, substitute `apt install gh` / `apt install glab` (after adding the upstream repos — see the install hints `doctor` prints).

The skill runs `doctor` automatically on first invocation in a session. You only need to run it manually if you want to re-verify after changing config.

---



`opcode` talks to whichever code-hosting forge your repo lives on. Opcodes like `FETCH`, `PUSH`, and `CLONE` dispatch through `scripts/forge.mjs`, which picks a driver at runtime.

## Supported forges

| Forge    | Driver                      | Required CLI |
|----------|-----------------------------|--------------|
| GitHub   | `scripts/drivers/github.mjs` | [`gh`](https://cli.github.com/) |
| GitLab   | `scripts/drivers/gitlab.mjs` | [`glab`](https://gitlab.com/gitlab-org/cli) |

Both CLIs must be installed and authenticated (`gh auth login` / `glab auth login`) before running any I/O opcodes.

## Detection order

`forge.mjs` picks a driver using the first rule that matches:

1. **Environment variable** — `OPCODE_FORGE=github|gitlab`
2. **Project config** — a `.opcode.json` file in the current directory:
   ```json
   { "forge": "github" }
   ```
3. **Auto-detect from git remote** — `git remote get-url origin` is matched against:
   - `github.com/*` → `github`
   - any URL containing `gitlab` (including self-hosted) → `gitlab`

If none of the above produce a match, `forge.mjs` exits with an error and asks you to set `OPCODE_FORGE`.

## Verifying the active forge

Run this once at the top of an asm program (or from the shell) to see which driver is active:

```
$ node scripts/forge.mjs detect
github
```

In a `.s` program you can force this check by starting with:

```asm
        .TRACE  ON          ; show the detect line in the trace
        SED                 ; dry-run while you verify
```

## Overriding per run

One-off:

```sh
OPCODE_FORGE=gitlab node scripts/forge.mjs fetch --labels 1
```

Per project (committed to the repo):

```sh
echo '{"forge":"gitlab"}' > .opcode.json
```

Per shell session:

```sh
export OPCODE_FORGE=github
```

## Self-hosted GitLab

The auto-detect rule matches any URL containing the substring `gitlab`, which covers most self-hosted instances (`gitlab.mycorp.com`, `git.example.org/gitlab`, etc.). If your instance uses a non-obvious hostname, set `OPCODE_FORGE=gitlab` explicitly and make sure `glab` is configured to point at it:

```sh
glab auth login --hostname gitlab.mycorp.com
```

## Adding a new forge (e.g. Bitbucket, Gitea, Forgejo)

The driver interface is three functions — copy `scripts/drivers/github.mjs` as a template:

```js
export function fetch({ labels, run }) { /* return array of issue IDs */ }
export function view({ id, run })       { /* print one issue as JSON */ }
export function pr({ branch, run })     { /* open a PR/MR for <branch> */ }
```

Then wire it into `scripts/forge.mjs`:

1. `import * as bitbucket from "./drivers/bitbucket.mjs";`
2. Add `bitbucket` to the `DRIVERS` map
3. Add a detection rule in `detectForge()` (e.g. `if (/bitbucket/i.test(url)) return "bitbucket";`)

No opcode changes needed — `FETCH`, `PUSH`, etc. remain identical.

## Vocabulary

GitHub calls them **pull requests (PRs)**, GitLab calls them **merge requests (MRs)**. They're the same concept with different names.

- **Default vocabulary is PR** (GitHub is the larger audience).
- The `PUSH` opcode at `$FE06` opens whichever one applies for your active forge.
- The assembler also accepts `OPEN_PR` and `OPEN_MR` as explicit aliases for the same vector — pick whichever reads right in your source.
- Runtime traces substitute forge-appropriate wording automatically: a GitHub session logs `gh pr create`, a GitLab session logs `glab mr create`.
- `forge.mjs` accepts both `pr` and `mr` as CLI subcommand aliases.

Nobody has to compromise their vocabulary.

## Dry-run

All drivers honor `CA_DRY_RUN=1` — set automatically when the 6502 `D` flag is high (`SED`). In dry-run, `forge.mjs` logs the CLI command it *would* have run and exits cleanly. Always verify a new forge configuration in dry-run mode first:

```sh
CA_DRY_RUN=1 node scripts/forge.mjs fetch --labels 1
```
