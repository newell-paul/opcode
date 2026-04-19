#!/usr/bin/env node
// Forge-agnostic I/O for opcode.
// Detects GitHub vs GitLab from `git remote get-url origin` (or an env/config
// override) and dispatches to the right driver. All drivers expose the same
// subcommands: fetch / view / pr. Opcodes (FETCH, PUSH, ...) stay unchanged.
//
// Override order: $OPCODE_FORGE > .opcode.json > auto-detect.
//
// Honors CA_DRY_RUN=1 (set when the 6502 D flag is high).

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import * as github from "./drivers/github.mjs";
import * as gitlab from "./drivers/gitlab.mjs";
import * as local from "./drivers/local.mjs";

const DRIVERS = { github, gitlab, local };

const LABEL_BITS = {
  0x01: "bug",
  0x02: "urgent",
  0x04: "enhancement",
  0x08: "docs",
  0x10: "security",
  0x20: "refactor",
  0x40: "chore",
  0x80: "seen",
};

export function maskToLabels(mask) {
  const out = [];
  for (const [bit, name] of Object.entries(LABEL_BITS)) {
    if (mask & Number(bit)) out.push(name);
  }
  return out;
}

function detectForge() {
  if (process.env.OPCODE_FORGE) return process.env.OPCODE_FORGE;
  if (existsSync(".opcode.json")) {
    try {
      const cfg = JSON.parse(readFileSync(".opcode.json", "utf8"));
      if (cfg.forge) return cfg.forge;
    } catch { /* ignore */ }
  }
  const r = spawnSync("git", ["remote", "get-url", "origin"], { encoding: "utf8" });
  const url = (r.stdout || "").trim();
  if (/github\.com/i.test(url)) return "github";
  if (/gitlab/i.test(url)) return "gitlab";
  if (/bitbucket/i.test(url)) return "bitbucket";
  throw new Error(`cannot detect forge from remote "${url}"; set OPCODE_FORGE`);
}

export function run(cmd, args) {
  if (process.env.CA_DRY_RUN === "1") {
    console.error(`[dry-run] ${cmd} ${args.join(" ")}`);
    return { stdout: "", stderr: "", status: 0 };
  }
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stderr || `${cmd} failed`);
    process.exit(r.status || 1);
  }
  return r;
}

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}

// --- doctor (runs before forge detection so it can diagnose a failed detect) ---

const INSTALL_HINTS = {
  gh: {
    darwin: "brew install gh",
    linux: "see https://cli.github.com (apt: `sudo apt install gh` after adding the repo)",
    other: "https://cli.github.com",
  },
  glab: {
    darwin: "brew install glab",
    linux: "see https://gitlab.com/gitlab-org/cli (apt: `sudo apt install glab`)",
    other: "https://gitlab.com/gitlab-org/cli",
  },
};

function installHint(cli) {
  const p = process.platform === "darwin" ? "darwin"
          : process.platform === "linux"  ? "linux" : "other";
  return INSTALL_HINTS[cli]?.[p] || INSTALL_HINTS[cli]?.other || "";
}

function check(label, cmd, args, fixHint) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status === 0) {
    console.log(`  ok   ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}`);
  if (fixHint) console.log(`       → ${fixHint}`);
  return false;
}

function doctor() {
  console.log("opcode doctor");
  console.log("----------------------");
  let ok = true;
  ok = check("git installed",  "git",  ["--version"], "install git first") && ok;
  ok = check("node installed", "node", ["--version"], "install node 18+") && ok;

  // Forge detection (non-throwing)
  let forgeName = null;
  try { forgeName = detectForge(); } catch (e) {
    console.log(`  FAIL forge detected`);
    console.log(`       → ${e.message}`);
    ok = false;
  }
  if (forgeName) console.log(`  ok   forge detected: ${forgeName}`);

  // CLI presence + auth (only for the detected forge)
  if (forgeName === "github") {
    ok = check("gh installed",     "gh", ["--version"],    `install gh: ${installHint("gh")}`) && ok;
    ok = check("gh authenticated", "gh", ["auth", "status"], "run: gh auth login") && ok;
  } else if (forgeName === "gitlab") {
    ok = check("glab installed",     "glab", ["--version"],    `install glab: ${installHint("glab")}`) && ok;
    ok = check("glab authenticated", "glab", ["auth", "status"], "run: glab auth login") && ok;
  } else if (forgeName === "local") {
    if (existsSync(".opcode/todos.json")) {
      console.log("  ok   .opcode/todos.json readable");
    } else {
      console.log("  FAIL .opcode/todos.json readable");
      console.log("       → create .opcode/todos.json with an array of {id,title,labels,body}");
      ok = false;
    }
  }

  console.log("----------------------");
  console.log(ok ? "all checks passed" : "one or more checks FAILED — fix the items above");
  process.exit(ok ? 0 : 1);
}

if (process.argv[2] === "doctor") doctor();

// --- dispatch ---
const sub = process.argv[2];
const forgeName = detectForge();
const driver = DRIVERS[forgeName];
if (!driver) {
  console.error(`unsupported forge "${forgeName}"`);
  process.exit(1);
}

switch (sub) {
  case "detect": {
    console.log(forgeName);
    break;
  }
  case "fetch": {
    const mask = parseInt(arg("--labels", "0"), 10);
    const ids = driver.fetch({ labels: maskToLabels(mask), run });
    for (const id of ids) console.log(id);
    break;
  }
  case "view": {
    const id = process.argv[3];
    if (!id) { console.error("view: missing issue id"); process.exit(1); }
    driver.view({ id, run });
    break;
  }
  case "pr":
  case "mr": {
    const branch = arg("--branch", "");
    driver.pr({ branch, run });
    break;
  }
  default:
    console.error("usage: forge.mjs <doctor|detect|fetch|view|pr> [args]");
    process.exit(1);
}
