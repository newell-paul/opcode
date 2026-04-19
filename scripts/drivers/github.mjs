// GitHub driver — uses the `gh` CLI.

export function fetch({ labels, run }) {
  const args = ["issue", "list", "--state", "open", "--limit", "16",
                "--json", "number"];
  if (labels.length) { args.push("--label", labels.join(",")); }
  const r = run("gh", args);
  try {
    const issues = JSON.parse(r.stdout || "[]");
    return issues.slice(0, 16).map(i => i.number);
  } catch {
    return [];
  }
}

export function view({ id, run }) {
  const r = run("gh", ["issue", "view", id, "--json", "number,title,body,labels"]);
  if (r.stdout) process.stdout.write(r.stdout);
}

export function pr({ branch, run }) {
  const args = ["pr", "create", "--fill"];
  if (branch) { args.push("--head", branch); }
  run("gh", args);
}
