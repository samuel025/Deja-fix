// End-to-end over real MCP stdio. MOCK memory forced (no Walrus writes) unless E2E_REAL=1.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transaction } from "@mysten/sui/transactions";
import { scenarios } from "./scenarios.js";
import { Chain } from "../src/chain.js";
const builder: any = (new Chain() as any).fullnode;

const sender = "0xa4c9649934561037cccff4a0c3fe7b8f396d392f2b5f3741f1e64441b2cf3477"; // public address, read-only: only used as the simulated sender, never signs
const coinRes: any = await builder.core.listCoins({ owner: sender, coinType: "0x2::sui::SUI", limit: 1 });
const coin = coinRes.objects[0];
if (!coin) throw new Error("sender has no SUI coin to use as the simulated gas payment");
async function bytes(f: (t: Transaction) => void) {
  const t = new Transaction(); t.setSender(sender); t.setGasPrice(1000); t.setGasBudget(5_000_000);
  t.setGasPayment([{ objectId: coin.objectId, version: coin.version, digest: coin.digest }]); f(t);
  return Buffer.from(await t.build({ client: builder })).toString("base64");
}
const env: Record<string, string> = { ...(process.env as any) };
if (process.env.E2E_REAL !== "1") delete env.MEMWAL_PRIVATE_KEY;
const c = new Client({ name: "e2e", version: "0" });
await c.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/server.ts"], env }));
const call = async (name: string, args: any) => {
  const r: any = await c.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  if (r.isError) return { error: text };
  return JSON.parse(text);
};
const s = scenarios[1];
const broken = await bytes(s.broken), fixed = await bytes(s.fixed);
const d = await call("diagnose_tx", { txBytesBase64: broken });
console.log("1 diagnose_tx   ->", d.failed, d.signature ?? d.error);
const r0 = await call("recall_similar", { signatureHash: d.signatureHash });
console.log("2 recall (first)->", r0.fixes?.length, "fixes, mock:", r0.mockMemory);
const bad = await call("verify_fix", { signatureHash: d.signatureHash, txBytesBase64: broken });
console.log("3 verify bad    ->", bad.passed);
const refused = await call("remember_fix", { signatureHash: d.signatureHash, summary: "x", verificationId: bad.verificationId });
console.log("4 remember(bad) ->", refused.error ? "REFUSED: " + refused.error : "STORED?!");
const fake = await call("remember_fix", { signatureHash: d.signatureHash, summary: "x", verificationId: "made-up" });
console.log("5 remember(fake)->", fake.error ? "REFUSED: " + fake.error : "STORED?!");
const good = await call("verify_fix", { signatureHash: d.signatureHash, txBytesBase64: fixed });
console.log("6 verify fix    ->", good.passed, "via", good.simulatedVia);
const st = await call("remember_fix", { signatureHash: d.signatureHash, summary: s.fixHint, verificationId: good.verificationId });
console.log("7 remember(good)->", st.stored);
const r1 = await call("recall_similar", { signatureHash: d.signatureHash });
console.log("8 recall (after)->", r1.fixes?.length, "fix:", r1.fixes?.[0]?.summary);
await c.close();
