// Simulation only: no signing, no Walrus writes. Usage: npx tsx scenarios/run.mts
import { Transaction } from "@mysten/sui/transactions";
import { Chain } from "../src/chain.js";
import { canonicalSignature, signatureHash } from "../src/signature.js";
import { scenarios } from "./scenarios.js";

const chain = new Chain();
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mk = (f: (t: Transaction) => void) => { const t = new Transaction(); t.setSender(sender); f(t); return t; };

let ok = 0;
for (const s of scenarios) {
  await sleep(700);
  const b = await chain.simulate(mk(s.broken), { checksEnabled: false });
  await sleep(700);
  const f = await chain.simulate(mk(s.fixed), { checksEnabled: false });
  const good = !b.passed && f.passed && !!b.facts;
  if (good) ok++;
  console.log(`${good ? "OK  " : "FAIL"} ${s.id.padEnd(28)} broken=${b.passed ? "pass?!" : "fails"} fixed=${f.passed ? "passes" : "FAILS"} via=${b.via}`);
  if (b.facts) console.log(`      sig=${signatureHash(b.facts)} ${canonicalSignature(b.facts).replace(/0x0+/g, "0x")}`);
}
console.log(`${ok}/${scenarios.length} scenarios reproduce and have a passing fix`);
process.exit(ok === scenarios.length ? 0 : 1);
