import { MemWal, MemWalMock } from "@mysten-incubation/memwal";
import type { FailureFacts } from "./signature.js";

export type MemoryType = "episode" | "verified_fix" | "gotcha" | "outcome";

export interface StoredMemory {
  type: MemoryType;
  signatureHash: string;
  summary?: string;
  facts?: FailureFacts;
  digest?: string;
  verificationId?: string;
  simulation?: "pass";
  worked?: boolean; // outcome memories: did a reused fix pass re-verification
  reusedBlobHint?: string;
  at: string;
}

export class Memory {
  private m: any;
  readonly mock: boolean;
  constructor(env = process.env, forceMock = false) {
    this.mock = forceMock || !env.MEMWAL_PRIVATE_KEY;
    this.m = this.mock
      ? MemWalMock.create({ namespace: "deja-fix" })
      : MemWal.create({
          key: env.MEMWAL_PRIVATE_KEY!,
          accountId: env.MEMWAL_ACCOUNT_ID!,
          serverUrl: env.MEMWAL_SERVER_URL ?? "https://relayer.memory.walrus.xyz",
          namespace: "deja-fix",
        });
  }

  async write(mem: Omit<StoredMemory, "at">) {
    const body: StoredMemory = { ...mem, at: new Date().toISOString() };
    // Prefix makes semantic recall key on the hashed signature.
    const text = `dejafix:${mem.type}:${mem.signatureHash} ${JSON.stringify(body)}`;
    return this.m.rememberAndWait(text, undefined, { timeoutMs: 60_000 });
  }

  /** Verified fixes only; gotchas/episodes are never returned as fixes. */
  async recallFixes(signatureHash: string): Promise<StoredMemory[]> {
    const res = await this.m.recall({
      query: `dejafix:verified_fix:${signatureHash}`,
      topK: 50,
      maxDistance: 0.8,
    });
    const items: any[] = res?.results ?? res?.memories ?? res ?? [];
    const out: StoredMemory[] = [];
    for (const it of items) {
      const text: string = it.text ?? it.content ?? "";
      const i = text.indexOf("{");
      if (i < 0) continue;
      try {
        const p = JSON.parse(text.slice(i)) as StoredMemory;
        if (p.type === "verified_fix" && p.signatureHash === signatureHash && p.simulation === "pass")
          out.push(p);
      } catch {}
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }
}
