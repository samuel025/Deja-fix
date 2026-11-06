// Writes one gated verified_fix per scenario. Requires CONFIRM_REAL_WRITE=1.
// Idempotent (skips scenarios already in results/mainnet-writes.md), stops on first error.
import { appendFileSync, readFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { Chain } from "../src/chain.js";
import { Memory } from "../src/memory.js";
import { VerificationGate } from "../src/gate.js";
import { signatureHash } from "../src/signature.js";
import { scenarios } from "./scenarios.js";

if (process.env.CONFIRM_REAL_WRITE !== "1") { console.error("Set CONFIRM_REAL_WRITE=1"); process.exit(1); }
const LOG = "results/mainnet-writes.md";
const done = readFileSync(LOG, "utf8");
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const mk = (f: (t: Transaction) => void) => { const t = new Transaction(); t.setSender(sender); f(t); return t; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chain = new Chain(), mem = new Memory();
if (mem.mock) { console.error("Refusing: memory is mock"); process.exit(1); }
let n = (done.match(/^\| \d+ /gm) ?? []).length;

for (const s of scenarios) {
  if (done.includes(`| ${s.id} |`)) { console.log("skip (already written):", s.id); continue; }
  const gate = new VerificationGate();
  const b = await chain.simulate(mk(s.broken), { checksEnabled: false });
  const f = await chain.simulate(mk(s.fixed), { checksEnabled: false });
  if (b.passed || !f.passed || !b.facts) { console.error("scenario no longer reproduces, stopping:", s.id); process.exit(1); }
  const hash = signatureHash(b.facts);
  const v = gate.record({ signatureHash: hash, passed: true, txBytesHash: s.id });
  gate.require(v.id, hash);
  try {
    const t0 = Date.now();
    const r: any = await mem.write({ type: "verified_fix", signatureHash: hash, summary: s.fixHint, facts: b.facts, verificationId: v.id, simulation: "pass" });
    n++;
    appendFileSync(LOG, `| ${n} | verified_fix | ${s.id} | ${r.blob_id} | yes |\n`);
    console.log(`#${n} ${s.id} ok ${((Date.now() - t0) / 1000).toFixed(1)}s blob=${r.blob_id}`);
  } catch (e: any) {
    console.error(`STOP at ${s.id}: status=${e?.status} ${String(e?.message).slice(0, 200)}`);
    if (e?.status === 429) console.error("Rate limited: wait and rerun; completed writes are kept.");
    process.exit(1);
  }
  await sleep(5000);
}
console.log("done; total recorded:", n);
