import { createHash } from "node:crypto";

export interface FailureFacts {
  kind: string; // MoveAbort | InsufficientGas | ObjectVersion | TypeArgument | CommandArgument | Other
  command?: number;
  package?: string;
  module?: string;
  function?: string;
  abortCode?: string;
  constantName?: string;
  message: string;
}

/** Shape of a Sui ExecutionError as returned by @mysten/sui clients. */
export interface RawExecutionError {
  message: string;
  command?: number;
  $kind?: string;
  MoveAbort?: {
    abortCode?: string | bigint;
    location?: { package?: string; module?: string; function?: number; functionName?: string };
    cleverError?: { constantName?: string; lineNumber?: number } | null;
  };
}

export function factsFromError(err: RawExecutionError): FailureFacts {
  const m = err.MoveAbort;
  const msg = err.message ?? "";
  let kind = err.$kind ?? "Other";
  if (!err.$kind || kind === "Unknown") {
    if (/gas/i.test(msg)) kind = "InsufficientGas";
    else if (/version/i.test(msg)) kind = "ObjectVersion";
  }
  return {
    kind,
    command: err.command,
    package: m?.location?.package,
    module: m?.location?.module,
    function: m?.location?.functionName,
    abortCode: m?.abortCode !== undefined ? String(m.abortCode) : undefined,
    constantName: m?.cleverError?.constantName,
    message: msg,
  };
}

/** Canonical, project-independent string; constant name preferred over raw code. */
export function canonicalSignature(f: FailureFacts): string {
  return [
    f.kind,
    f.package ?? "",
    f.module ?? "",
    f.function ?? "",
    f.constantName ?? `code:${f.abortCode ?? ""}`,
  ].join("|");
}

/** Hashed so the public Walrus namespace/lookup key leaks nothing about the project. */
export function signatureHash(f: FailureFacts): string {
  return createHash("sha256").update(canonicalSignature(f)).digest("hex").slice(0, 32);
}
