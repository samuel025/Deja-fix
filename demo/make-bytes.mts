// Writes demo/broken.b64 and demo/fixed.b64 (unsigned tx bytes, base64). Read-only; nothing is signed or sent.
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { Chain } from "../src/chain.js";
import { scenarios } from "../scenarios/scenarios.js";
const sender = "0xa4c9649934561037cccff4a0c3fe7b8f396d392f2b5f3741f1e64441b2cf3477";
const client: any = (new Chain() as any).fullnode;
const coin = ((await client.core.listCoins({ owner: sender, coinType: "0x2::sui::SUI", limit: 1 })) as any).objects[0];
const s = scenarios.find((x) => x.id === (process.argv[2] ?? "abort-vector-borrow-oob"))!;
for (const [name, f] of [["broken", s.broken], ["fixed", s.fixed]] as const) {
  const t = new Transaction(); t.setSender(sender); t.setGasPrice(1000); t.setGasBudget(5_000_000);
  t.setGasPayment([{ objectId: coin.objectId, version: coin.version, digest: coin.digest }]); f(t);
  writeFileSync(`demo/${name}.b64`, Buffer.from(await t.build({ client })).toString("base64"));
}
console.log("wrote demo/broken.b64 and demo/fixed.b64 for", s.id);
