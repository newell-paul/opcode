// Local driver — no forge, no network.
// Reads .opcode/todos.json as a stand-in for GitHub/GitLab issues.
// pr() never contacts a remote; it logs what `gh pr create --fill` would have done.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function loadTodos() {
  if (!existsSync(".opcode/todos.json")) return [];
  try { return JSON.parse(readFileSync(".opcode/todos.json", "utf8")); }
  catch { return []; }
}

export function fetch({ labels }) {
  const todos = loadTodos();
  const filtered = labels.length
    ? todos.filter(t => (t.labels || []).some(l => labels.includes(l)))
    : todos;
  return filtered.slice(0, 16).map(t => t.id);
}

export function view({ id }) {
  const todos = loadTodos();
  const t = todos.find(x => String(x.id) === String(id));
  if (!t) { console.error(`local: issue ${id} not found`); process.exit(1); }
  console.log(JSON.stringify({
    number: t.id,
    title: t.title,
    body: t.body || "",
    labels: (t.labels || []).map(name => ({ name })),
  }, null, 2));
}

export function pr({ branch }) {
  const head = branch || (spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout || "").trim();
  const subject = (spawnSync("git", ["log", "-1", "--pretty=%s"], { encoding: "utf8" }).stdout || "").trim();
  console.log(JSON.stringify({ dryRun: true, branch: head, commit: subject }, null, 2));
}
