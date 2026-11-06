// Read-only: recall each scenario's verified fix from Walrus. No writes.
import { Chain } from "../src/chain.js";
import { Memory } from "../src/memory.js";
import { Transaction } from "@mysten/sui/transactions";
import { signatureHash } from "../src/signature.js";
import { scenarios } from "./scenarios.js";
const chain = new Chain(), mem = new Memory();
if (mem.mock) { console.error("memory is mock"); process.exit(1); }
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
let ok = 0;
for (const s of scenarios) {
  const t = new Transaction(); t.setSender(sender); s.broken(t);
  const b = await chain.simulate(t, { checksEnabled: false });
  const hash = signatureHash(b.facts!);
  const got = await mem.recallFixes(hash);
  const hit = got.some((g) => g.summary === s.fixHint);
  if (hit) ok++;
  console.log(`${hit ? "OK  " : "MISS"} ${s.id.padEnd(28)} recalled=${got.length}`);
}
console.log(`${ok}/${scenarios.length} recalled`);
process.exit(ok === scenarios.length ? 0 : 1);
