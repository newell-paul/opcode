// GitLab driver — uses the `glab` CLI.

export function fetch({ labels, run }) {
  const args = ["issue", "list", "--output", "json", "--per-page", "16"];
  if (labels.length) { args.push("--label", labels.join(",")); }
  const r = run("glab", args);
  try {
    const issues = JSON.parse(r.stdout || "[]");
    return issues.slice(0, 16).map(i => i.iid ?? i.id);
  } catch {
    return [];
  }
}

export function view({ id, run }) {
  const r = run("glab", ["issue", "view", id, "--output", "json"]);
  if (r.stdout) process.stdout.write(r.stdout);
}

export function pr({ branch, run }) {
  const args = ["mr", "create", "--fill"];
  if (branch) { args.push("--source-branch", branch); }
  run("glab", args);
}
