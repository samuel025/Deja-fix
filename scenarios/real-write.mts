// ONE real Walrus write through the full gated flow. Requires CONFIRM_REAL_WRITE=1.
import { Transaction } from "@mysten/sui/transactions";
import { Chain } from "../src/chain.js";
import { Memory } from "../src/memory.js";
import { VerificationGate } from "../src/gate.js";
import { signatureHash } from "../src/signature.js";
import { scenarios } from "./scenarios.js";

if (process.env.CONFIRM_REAL_WRITE !== "1") { console.error("Set CONFIRM_REAL_WRITE=1"); process.exit(1); }
const s = scenarios[0];
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const mk = (f: (t: Transaction) => void) => { const t = new Transaction(); t.setSender(sender); f(t); return t; };
const chain = new Chain(), gate = new VerificationGate(), mem = new Memory();
if (mem.mock) { console.error("Refusing: memory is mock (no MEMWAL key loaded)"); process.exit(1); }

const b = await chain.simulate(mk(s.broken), { checksEnabled: false });
const hash = signatureHash(b.facts!);
const f = await chain.simulate(mk(s.fixed), { checksEnabled: false });
const v = gate.record({ signatureHash: hash, passed: f.passed, txBytesHash: s.id });
gate.require(v.id, hash);
console.log("broken fails:", !b.passed, "| fix passes:", f.passed, "| sig:", hash);

const t0 = Date.now();
const res = await mem.write({ type: "verified_fix", signatureHash: hash, summary: s.fixHint, facts: b.facts, verificationId: v.id, simulation: "pass" });
console.log(`WRITE ok in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(res));

const got = await mem.recallFixes(hash);
console.log("recall returned", got.length, "verified fix(es):", got.map((g) => g.summary));
