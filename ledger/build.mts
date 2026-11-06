// Generates ledger/index.html from results/mainnet-writes.md and results/benchmark.json
import { readFileSync, writeFileSync } from "node:fs";
import { scenarios } from "../scenarios/scenarios.js";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const rows = readFileSync("results/mainnet-writes.md", "utf8").split("\n").filter((l) => /^\| \d+ /.test(l)).map((l) => l.split("|").map((x) => x.trim()).slice(1, -1));
const bench = JSON.parse(readFileSync("results/benchmark.json", "utf8"));
const hint = (id: string) => scenarios.find((s) => s.id === id)?.fixHint ?? "";
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Déjà Fix memory ledger</title><style>
:root{--bg:#fff;--fg:#1a1a1a;--mut:#666;--line:#e2e2e2;--ok:#0a7d3b}
@media(prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--mut:#999;--line:#333;--ok:#4ade80}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:24px 16px}
table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
code{font-size:12px;word-break:break-all}.ok{color:var(--ok);font-weight:600}.mut{color:var(--mut)}
</style></head><body>
<h1>Déjà Fix memory ledger</h1>
<p class="mut">Every memory below was written to Walrus Memory only after the server itself simulated the fix and saw it pass. ${rows.length} memories (${rows.filter((r) => r[1] === "verified_fix").length} verified fixes, ${rows.filter((r) => r[1] === "outcome").length} outcomes).</p>
<table><tr><th>#</th><th>Type</th><th>Scenario</th><th>Fix</th><th>Simulation</th><th>Blob ID</th></tr>
${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(hint(r[2]))}</td><td class="ok">${r[4] === "yes" ? "pass" : "?"}</td><td><code>${esc(r[3])}</code></td></tr>`).join("\n")}
</table>
<h2>Benchmark</h2>
<p class="mut">${bench.meta.scenarios} scenarios × ${bench.meta.reps} reps. Memory: ${esc(bench.meta.memory)}. Agent: ${esc(bench.meta.agent)}.</p>
<table><tr><th>Arm</th><th>Repeat fixed first try</th><th>Avg attempts (repeat)</th></tr>
${(["amnesiac", "dejafix"] as const).map((a) => `<tr><td>${a}</td><td>${pct(bench.summary[a].secondFirstTryRate)}</td><td>${bench.summary[a].secondAvgAttempts.toFixed(2)}</td></tr>`).join("\n")}
</table></body></html>`;
writeFileSync("ledger/index.html", html);
console.log("wrote ledger/index.html with", rows.length, "rows");
