// Offline-safe check: each scenario's DSL program must reproduce the same failure signature as its builder.
import { Chain } from "../src/chain.js";
import { signatureHash } from "../src/signature.js";
import { Transaction } from "@mysten/sui/transactions";
import { compile } from "./dsl.js";
import { scenarios } from "./scenarios.js";
const chain = new Chain(); const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
let ok = 0;
for (const s of scenarios) {
  const t = new Transaction(); t.setSender(sender); s.broken(t);
  const a = await chain.simulate(t, { checksEnabled: false });
  const b = await chain.simulate(compile(s.program, sender), { checksEnabled: false });
  const same = !!a.facts && !!b.facts && signatureHash(a.facts) === signatureHash(b.facts);
  if (same) ok++; console.log(same ? "OK  " : "DIFF", s.id);
}
console.log(`${ok}/${scenarios.length} DSL programs match`); process.exit(ok === scenarios.length ? 0 : 1);
