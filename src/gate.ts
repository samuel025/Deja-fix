import { randomUUID } from "node:crypto";

export interface Verification {
  id: string;
  signatureHash: string;
  passed: boolean;
  txBytesHash: string;
  at: string;
}

/** Records simulations the server ran itself. remember_fix may only cite a passing entry. */
export class VerificationGate {
  private store = new Map<string, Verification>();

  record(v: Omit<Verification, "id" | "at">): Verification {
    const full = { ...v, id: randomUUID(), at: new Date().toISOString() };
    this.store.set(full.id, full);
    return full;
  }

  /** Throws unless id is a server-run passing simulation for this signature. */
  require(id: string, signatureHash: string): Verification {
    const v = this.store.get(id);
    if (!v) throw new Error("Unknown verification ID: the server did not run this simulation.");
    if (!v.passed) throw new Error("Refusing to remember: that simulation failed.");
    if (v.signatureHash !== signatureHash)
      throw new Error("Verification belongs to a different failure signature.");
    return v;
  }
}
