import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Transaction } from "@mysten/sui/transactions";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";
import { factsFromError, type FailureFacts, type RawExecutionError } from "./signature.js";

/** Min-interval pacer: Tatum free plan allows 3 req/s. */
class Pacer {
  private next = 0;
  constructor(private intervalMs: number) {}
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.intervalMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  }
}

function makeClient(rawHost: string, network: any, apiKey?: string) {
  let host = rawHost.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host.includes(":")) host += ":443";
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: apiKey ? { "x-api-key": apiKey } : {},
  });
  return new SuiGrpcClient({ network, transport });
}

export interface SimResult {
  passed: boolean;
  facts?: FailureFacts;
  via: "tatum" | "fullnode";
}

export class Chain {
  private tatum?: SuiGrpcClient;
  private fullnode: SuiGrpcClient;
  private pacer = new Pacer(340);
  private cache = new Map<string, any>();

  constructor(env = process.env) {
    const network = (env.SUI_NETWORK ?? "mainnet") as any;
    if (env.TATUM_GRPC_HOST) this.tatum = makeClient(env.TATUM_GRPC_HOST, network, env.TATUM_API_KEY);
    this.fullnode = makeClient(env.SUI_FALLBACK_GRPC_HOST ?? "fullnode.mainnet.sui.io:443", network);
  }

  /** Read a past transaction's failure via Tatum (cached, paced). */
  async diagnoseDigest(digest: string): Promise<FailureFacts | null> {
    if (this.cache.has(digest)) return this.cache.get(digest);
    await this.pacer.wait();
    const client = this.tatum ?? this.fullnode;
    const res: any = await client.core.getTransaction({ digest });
    const tx = res.Transaction ?? res.FailedTransaction;
    const err = (tx?.status?.error ?? tx?.effects?.status?.error) as RawExecutionError | undefined;
    const facts = err ? factsFromError(err) : null;
    this.cache.set(digest, facts);
    return facts;
  }

  /** Simulate unsigned tx bytes. Tries Tatum first, falls back to the public fullnode. */
  async simulate(txBytes: Uint8Array | Transaction, opts: { checksEnabled?: boolean } = {}): Promise<SimResult> {
    const attempts: Array<["tatum" | "fullnode", SuiGrpcClient | undefined]> = [
      ["tatum", this.tatum],
      ["fullnode", this.fullnode],
    ];
    let lastErr: unknown;
    for (const [via, client] of attempts) {
      if (!client) continue;
      try {
        if (via === "tatum") await this.pacer.wait();
        const res: any = await client.core.simulateTransaction({ transaction: txBytes as any, ...opts });
        const tx = res.Transaction ?? res.FailedTransaction;
        const err = (tx?.status?.error ?? tx?.effects?.status?.error) as RawExecutionError | undefined;
        const ok = res.$kind === "Transaction" && !err;
        return { passed: ok, facts: err ? factsFromError(err) : undefined, via };
      } catch (e: any) {
        // Pre-execution rejections (bad gas budget, missing package/object) arrive as thrown errors.
        const msg = String(e?.message ?? e);
        if (/gas budget|not found/i.test(msg)) {
          return { passed: false, facts: factsFromError({ message: msg }), via };
        }
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("No chain client available");
  }
}
