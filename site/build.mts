// Builds site/index.html from real data: live simulations (read-only), results/*.json and the mainnet write log.
import { readFileSync, writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { Chain } from "../src/chain.js";
import { VerificationGate } from "../src/gate.js";
import { canonicalSignature, signatureHash } from "../src/signature.js";
import { compile } from "../scenarios/dsl.js";
import { scenarios } from "../scenarios/scenarios.js";

const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const chain = new Chain();
const short = (s: string) => s.replace(/0x0{20,}([0-9a-f]+)/g, "0x$1");

const writes = readFileSync("results/mainnet-writes.md", "utf8").split("\n")
  .filter((l) => /^\| \d+ /.test(l)).map((l) => l.split("|").map((x) => x.trim()).slice(1, -1))
  .map(([n, type, scenario, blob]) => ({ n: Number(n), type, scenario, blob }));

const replay: any[] = [];
for (const s of scenarios) {
  const bad = await chain.simulate(compile(s.program, sender), { checksEnabled: false });
  const ft = new Transaction(); ft.setSender(sender); s.fixed(ft);
  const good = await chain.simulate(ft, { checksEnabled: false });
  const f = bad.facts!;
  const hash = signatureHash(f);
  // Real refusal messages straight from the gate
  const gate = new VerificationGate();
  const failedV = gate.record({ signatureHash: hash, passed: false, txBytesHash: "x" });
  const refusal = (() => { try { gate.require(failedV.id, hash); return ""; } catch (e: any) { return e.message; } })();
  replay.push({
    id: s.id, family: s.family, program: s.program, fixHint: s.fixHint,
    failure: { kind: f.kind, message: short(f.message), command: f.command ?? null },
    signature: short(canonicalSignature(f)), hash,
    badPassed: bad.passed, goodPassed: good.passed, via: good.via, refusal,
    fixBlob: writes.find((w) => w.scenario === s.id && w.type === "verified_fix")?.blob ?? null,
    outcomeBlob: writes.find((w) => w.scenario === s.id && w.type === "outcome")?.blob ?? null,
  });
  console.log("replay", s.id, "bad fails:", !bad.passed, "good passes:", good.passed);
}
const b1 = JSON.parse(readFileSync("results/benchmark.json", "utf8"));
const b2 = JSON.parse(readFileSync("results/benchmark-llm.json", "utf8"));
const data = {
  builtAt: new Date().toISOString(),
  counts: { memories: writes.length, fixes: writes.filter((w) => w.type === "verified_fix").length, outcomes: writes.filter((w) => w.type === "outcome").length, unverified: 0, scenarios: scenarios.length },
  writes, replay,
  bench: { scripted: { meta: b1.meta, summary: b1.summary }, llm: { meta: b2.meta, summary: b2.summary } },
};
const tpl = readFileSync("site/template.html", "utf8");
writeFileSync("site/index.html", tpl.replace("/*__DATA__*/null", JSON.stringify(data)));
console.log("wrote site/index.html");
