// Writes outcome memories: a stored fix was recalled, re-verified by simulation, and still passes.
// Requires CONFIRM_REAL_WRITE=1. Idempotent, stops on first error. COUNT env limits writes (default 5).
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
const COUNT = Number(process.env.COUNT ?? 5);
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const mk = (f: (t: Transaction) => void) => { const t = new Transaction(); t.setSender(sender); f(t); return t; };
const chain = new Chain(), mem = new Memory();
if (mem.mock) { console.error("Refusing: memory is mock"); process.exit(1); }
let n = (done.match(/^\| \d+ /gm) ?? []).length, written = 0;

for (const s of scenarios) {
  if (written >= COUNT) break;
  if (done.includes(`| outcome | ${s.id} |`)) { console.log("skip:", s.id); continue; }
  const b = await chain.simulate(mk(s.broken), { checksEnabled: false });
  const hash = signatureHash(b.facts!);
  const recalled = await mem.recallFixes(hash);
  const fix = recalled.find((r) => r.summary === s.fixHint);
  if (!fix) { console.error("no stored fix to reuse for", s.id, "- stopping"); process.exit(1); }
  const re = await chain.simulate(mk(s.fixed), { checksEnabled: false });
  const gate = new VerificationGate();
  const v = gate.record({ signatureHash: hash, passed: re.passed, txBytesHash: s.id });
  gate.require(v.id, hash); // only record an outcome backed by a server-run passing simulation
  try {
    const t0 = Date.now();
    const r: any = await mem.write({ type: "outcome", signatureHash: hash, summary: `reused fix worked: ${s.fixHint}`, worked: true, verificationId: v.id, simulation: "pass" });
    n++; written++;
    appendFileSync(LOG, `| ${n} | outcome | ${s.id} | ${r.blob_id} | yes |\n`);
    console.log(`#${n} outcome ${s.id} ok ${((Date.now() - t0) / 1000).toFixed(1)}s blob=${r.blob_id}`);
  } catch (e: any) {
    console.error(`STOP at ${s.id}: status=${e?.status} ${String(e?.message).slice(0, 200)}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log("done; total recorded:", n);
