import { describe, it, expect } from "vitest";
import { VerificationGate } from "../src/gate.js";
import { signatureHash, factsFromError } from "../src/signature.js";

describe("verification gate", () => {
  it("rejects unknown, failed and mismatched verifications", () => {
    const g = new VerificationGate();
    expect(() => g.require("nope", "h")).toThrow(/did not run/);
    const bad = g.record({ signatureHash: "h", passed: false, txBytesHash: "x" });
    expect(() => g.require(bad.id, "h")).toThrow(/failed/);
    const ok = g.record({ signatureHash: "h", passed: true, txBytesHash: "x" });
    expect(() => g.require(ok.id, "other")).toThrow(/different/);
    expect(g.require(ok.id, "h").passed).toBe(true);
  });
});

describe("signature", () => {
  it("is stable and prefers clever constant name", () => {
    const e = { message: "abort", command: 0, $kind: "MoveAbort",
      MoveAbort: { abortCode: "2", location: { package: "0x2", module: "coin", functionName: "split" }, cleverError: { constantName: "ENotEnough" } } };
    const a = signatureHash(factsFromError(e as any));
    const b = signatureHash(factsFromError({ ...e, command: 5 } as any));
    expect(a).toBe(b); // command index is not part of the cross-project key
    expect(a).toHaveLength(32);
  });
});
