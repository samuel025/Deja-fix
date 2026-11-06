import { Transaction } from "@mysten/sui/transactions";

export interface Scenario {
  id: string;
  family: string;
  /** Builds the failing transaction. */
  broken: (tx: Transaction) => void;
  /** Builds a transaction that passes simulation. */
  fixed: (tx: Transaction) => void;
  fixHint: string;
}

const SUI = "0x2::sui::SUI";
const zeroCoin = (tx: Transaction) => tx.moveCall({ target: "0x2::coin::zero", typeArguments: [SUI] });
const ghost = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

export const scenarios: Scenario[] = [
  {
    id: "abort-option-destroy-none", family: "MoveAbort",
    broken: (tx) => { tx.moveCall({ target: "0x1::option::destroy_some", typeArguments: ["u64"], arguments: [tx.moveCall({ target: "0x1::option::none", typeArguments: ["u64"] })] }); },
    fixed: (tx) => { tx.moveCall({ target: "0x1::option::destroy_some", typeArguments: ["u64"], arguments: [tx.moveCall({ target: "0x1::option::some", typeArguments: ["u64"], arguments: [tx.pure.u64(1)] })] }); },
    fixHint: "destroy_some aborts on none; pass option::some(value)",
  },
  {
    id: "abort-vector-borrow-oob", family: "MoveAbort",
    broken: (tx) => { tx.moveCall({ target: "0x1::vector::borrow", typeArguments: ["u64"], arguments: [tx.moveCall({ target: "0x1::vector::empty", typeArguments: ["u64"] }), tx.pure.u64(0)] }); },
    fixed: (tx) => { tx.moveCall({ target: "0x1::vector::length", typeArguments: ["u64"], arguments: [tx.moveCall({ target: "0x1::vector::empty", typeArguments: ["u64"] })] }); },
    fixHint: "index out of bounds; check vector::length before borrow",
  },
  {
    id: "abort-balance-split", family: "MoveAbort",
    broken: (tx) => { tx.moveCall({ target: "0x2::coin::split", typeArguments: [SUI], arguments: [zeroCoin(tx), tx.pure.u64(1)] }); },
    fixed: (tx) => { tx.moveCall({ target: "0x2::coin::split", typeArguments: [SUI], arguments: [zeroCoin(tx), tx.pure.u64(0)] }); },
    fixHint: "split amount exceeds balance (ENotEnough); split no more than the balance",
  },
  {
    id: "abort-utf8-invalid", family: "MoveAbort",
    broken: (tx) => { tx.moveCall({ target: "0x1::string::utf8", arguments: [tx.pure.vector("u8", [255, 255])] }); },
    fixed: (tx) => { tx.moveCall({ target: "0x1::string::utf8", arguments: [tx.pure.vector("u8", [104, 105])] }); },
    fixHint: "bytes are not valid UTF-8 (EInvalidUTF8)",
  },
  {
    id: "type-argument-not-found", family: "TypeArgumentError",
    broken: (tx) => { tx.moveCall({ target: "0x1::option::none", typeArguments: ["0x2::coin::Nope"] }); },
    fixed: (tx) => { tx.moveCall({ target: "0x1::option::none", typeArguments: ["0x2::coin::Coin<0x2::sui::SUI>"] }); },
    fixHint: "type argument names a type that does not exist; use a real type",
  },
  {
    id: "insufficient-coin-balance", family: "InsufficientCoinBalance",
    broken: (tx) => { const [c] = tx.splitCoins(zeroCoin(tx), [5]); tx.transferObjects([c], "0xabc"); },
    fixed: (tx) => { const [c] = tx.splitCoins(zeroCoin(tx), [0]); tx.transferObjects([c], "0xabc"); },
    fixHint: "splitCoins amount exceeds the coin's balance",
  },
  {
    id: "function-not-found", family: "FunctionNotFound",
    broken: (tx) => { tx.moveCall({ target: "0x2::coin::does_not_exist" }); },
    fixed: (tx) => { zeroCoin(tx); },
    fixHint: "the function name is wrong for that module; check the package ABI",
  },
  {
    id: "wrong-argument-type", family: "InvariantViolation",
    broken: (tx) => { tx.moveCall({ target: "0x1::vector::borrow", typeArguments: ["u64"], arguments: [tx.pure.u64(1), tx.pure.u64(0)] }); },
    fixed: (tx) => { tx.moveCall({ target: "0x1::vector::length", typeArguments: ["u64"], arguments: [tx.moveCall({ target: "0x1::vector::empty", typeArguments: ["u64"] })] }); },
    fixHint: "argument 0 is a u64 but a vector<u64> is required",
  },
  {
    id: "gas-budget-too-low", family: "InsufficientGas",
    broken: (tx) => { tx.setGasBudget(1); zeroCoin(tx); },
    fixed: (tx) => { tx.setGasBudget(5_000_000); zeroCoin(tx); },
    fixHint: "gas budget is below the 100000 minimum; raise the budget",
  },
  {
    id: "package-not-found", family: "PackageOrObjectNotFound",
    broken: (tx) => { tx.moveCall({ target: `${ghost}::m::f` }); },
    fixed: (tx) => { zeroCoin(tx); },
    fixHint: "the package ID is not on this network; check network and dependency address",
  },
];
