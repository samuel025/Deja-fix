// A tiny JSON program format so an LLM can read and rewrite a failing transaction.
import { Transaction } from "@mysten/sui/transactions";

export type Arg = { u64: number } | { bytes: number[] } | { result: number } | { gas: true };
export type Cmd =
  | { cmd: "moveCall"; target: string; typeArguments?: string[]; arguments?: Arg[] }
  | { cmd: "splitCoins"; coin: Arg; amounts: number[] }
  | { cmd: "transferObjects"; objects: Arg[]; to: string };
export interface Program { gasBudget?: number; commands: Cmd[] }

export function compile(p: Program, sender: string): Transaction {
  const tx = new Transaction();
  tx.setSender(sender);
  if (p.gasBudget !== undefined) tx.setGasBudget(p.gasBudget);
  const results: any[] = [];
  const arg = (a: Arg): any => {
    if ("u64" in a) return tx.pure.u64(a.u64);
    if ("bytes" in a) return tx.pure.vector("u8", a.bytes);
    if ("gas" in a) return tx.gas;
    const r = results[a.result];
    if (r === undefined) throw new Error(`result ${a.result} does not exist`);
    return r;
  };
  for (const c of p.commands) {
    if (c.cmd === "moveCall") results.push(tx.moveCall({ target: c.target, typeArguments: c.typeArguments, arguments: (c.arguments ?? []).map(arg) }));
    else if (c.cmd === "splitCoins") results.push(tx.splitCoins(arg(c.coin), c.amounts)[0]);
    else if (c.cmd === "transferObjects") results.push(tx.transferObjects(c.objects.map(arg), c.to));
    else throw new Error("unknown command");
  }
  return tx;
}
