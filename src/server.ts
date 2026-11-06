import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Chain } from "./chain.js";
import { Memory } from "./memory.js";
import { VerificationGate } from "./gate.js";
import { canonicalSignature, signatureHash, type FailureFacts } from "./signature.js";

const chain = new Chain();
const memory = new Memory();
const gate = new VerificationGate();
const sigs = new Map<string, FailureFacts>(); // hash -> facts seen this session

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o, null, 2) }] });
const server = new McpServer({ name: "deja-fix", version: "0.1.0" });

server.tool(
  "diagnose_tx",
  "Diagnose a failed Sui transaction (digest) or simulate unsigned tx bytes (base64). Returns structured failure facts and a signature hash. Does not write memory.",
  { digest: z.string().optional(), txBytesBase64: z.string().optional() },
  async ({ digest, txBytesBase64 }) => {
    let facts: FailureFacts | null | undefined;
    if (digest) facts = await chain.diagnoseDigest(digest);
    else if (txBytesBase64) facts = (await chain.simulate(Buffer.from(txBytesBase64, "base64"))).facts;
    else throw new Error("Provide digest or txBytesBase64");
    if (!facts) return text({ failed: false });
    const hash = signatureHash(facts);
    sigs.set(hash, facts);
    return text({ failed: true, signatureHash: hash, signature: canonicalSignature(facts), facts });
  },
);

server.tool(
  "recall_similar",
  "Recall chain-verified fixes for a failure signature hash from Walrus Memory.",
  { signatureHash: z.string() },
  async ({ signatureHash: h }) => text({
    fixes: await memory.recallFixes(h),
    mockMemory: memory.mock,
    note: "Re-check any recalled fix with verify_fix before applying it: package upgrades can make a stored fix stale, and one abort code can have several causes.",
  }),
);

server.tool(
  "verify_fix",
  "Simulate fixed unsigned tx bytes (base64). Returns pass/fail and a verificationId usable by remember_fix.",
  { signatureHash: z.string(), txBytesBase64: z.string() },
  async ({ signatureHash: h, txBytesBase64 }) => {
    const bytes = Buffer.from(txBytesBase64, "base64");
    const sim = await chain.simulate(bytes);
    const v = gate.record({
      signatureHash: h,
      passed: sim.passed,
      txBytesHash: createHash("sha256").update(bytes).digest("hex"),
    });
    return text({ passed: sim.passed, verificationId: v.id, simulatedVia: sim.via, remainingFailure: sim.facts });
  },
);

server.tool(
  "remember_fix",
  "Store a fix, only if verificationId refers to a passing simulation this server ran.",
  { signatureHash: z.string(), summary: z.string().max(1000), verificationId: z.string() },
  async ({ signatureHash: h, summary, verificationId }) => {
    const v = gate.require(verificationId, h); // throws if not server-verified
    const res = await memory.write({
      type: "verified_fix",
      signatureHash: h,
      summary,
      facts: sigs.get(h),
      verificationId: v.id,
      simulation: "pass",
    });
    return text({ stored: true, result: res, mockMemory: memory.mock });
  },
);

await server.connect(new StdioServerTransport());
