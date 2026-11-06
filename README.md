# Déjà Fix

An MCP server that lets coding agents diagnose failed Sui transactions and remember **only fixes the chain confirmed**. Built for the Tatum × Walrus "Total Recall" hackathon.

Reads and simulations go through Tatum's Sui gRPC. Memory is Walrus Memory. A fix is stored only if the server itself simulated it and saw it pass.

## Tools

| Tool | What it does | Writes memory |
|---|---|---|
| `diagnose_tx` | Reads a failed digest (or simulates tx bytes); returns failure facts and a signature hash | no |
| `recall_similar` | Returns verified fixes for a signature hash | no |
| `verify_fix` | Simulates fixed tx bytes; returns pass/fail and a verification ID | no |
| `remember_fix` | Writes a fix, only for a passing verification ID the server ran itself | yes |

## Setup

```bash
npm install
cp .env.example .env   # fill in Tatum + Walrus Memory values
```

`MEMWAL_ACCOUNT_ID` must be the Walrus Memory **account ID** from the dashboard, not your wallet address. With no `MEMWAL_PRIVATE_KEY`, the in-memory mock is used.

Run the server (stdio): `set -a; source .env; set +a; npm start`

Add to Claude Code (no secrets in config; the launcher loads `.env`): `claude mcp add -s project deja-fix -- "$PWD/bin/deja-fix-mcp.sh"`, then run `claude` and approve the project server.

## Do X, see Y

| Do | See |
|---|---|
| `npm run scenarios` | 10/10 failures reproduce by simulation, each with a passing fix. No gas spent. |
| `npm test` | Gate and signature unit tests pass |
| `npm run bench` | Memory vs no-memory table in `results/benchmark.md` (mock memory, no Walrus writes) |
| `npm run recall-check` | Read-only: 10/10 stored fixes recalled from Walrus |
| `npm run e2e` | Full flow over real MCP stdio with mock memory: diagnose, verify, refuse bad/fake IDs, remember, recall |
| `npm run site` | Rebuilds `site/index.html`, a static one-page site (replay, gate, ledger, benchmarks) from live simulations and the results files |
| `npm run ledger` | Rebuilds `ledger/index.html` from results |

Real Walrus writes: `CONFIRM_REAL_WRITE=1 npm run write-all` (idempotent, stops on first error).

## Where memory matters

A good model fixes textbook errors from the message alone, and our own test shows it. Memory matters when the message says *what* failed but not *what your project needs*. Each case is labeled by how much evidence we have: **Measured** (in our results, small sample), **Demonstrated** (run end to end once), **Expected** (reasoning, not yet tested).

| Case | Why it matters | Status |
|---|---|---|
| The message doesn't reveal the fix | "Package not found" or "gas budget too low" says what broke, not which network, address or budget your project should use. Once a fix is confirmed, the next agent skips the hunt. | **Measured**: the gain sits mostly on gas-budget and bad-package failures (3 reps) |
| Rules only your project knows | A custom contract's abort codes and package IDs are in no model's training data, and the signature is keyed to the package. | **Expected**: scenarios use framework code, not custom contracts |
| Across sessions, agents and teammates | An agent starts every session blank. Walrus memory outlives the session, and one account can share memory across up to 20 delegate keys. | **Demonstrated** across sessions; sharing between agents untested |
| The expensive failures | A verified fix turns a multi-attempt search into one call. | **Measured**: avg attempts 1.70 -> 1.53, unsolved runs 9 -> 5 (of 30) |
| Compounds without rotting | The gate keeps wrong lessons out, so memory grows without filling with bad advice. | **Expected** long-run; the gate holds today (0 unverified writes) |

## Results

- **15 memories written to Walrus Memory on mainnet** (10 chain-verified fixes, 5 outcomes), with blob IDs in `results/mainnet-writes.md`. **0 unverified writes.**
- **Recall works end to end:** all 10 stored fixes come back from Walrus, and a fresh Claude Code session recalled a verified fix on its first call.
- **With a real model** (`gemini-3.1-flash-lite`, 10 failures x 3 reps): fixed on the first try 60% -> 67%, unsolved runs 9 -> 5. Easy errors are solved either way; the gain shows up where the error message alone doesn't reveal the fix (bad package, gas budget). Details: `results/benchmark-llm.md`.
- **Scripted agent** (a fixed policy, not an LLM) confirms the record -> recall -> apply loop: 20% -> 100% first-try on repeats. `results/benchmark.md`.

## Known limits

- One abort code can have several causes; simulation tells you whether a recalled fix applies.
- Packages that predate clever errors give only a numeric code, and some failure kinds (`FunctionNotFound`, `InvariantViolation`, `TypeArgumentError`) are keyed by kind alone.
- `recall_similar` advises re-checking with `verify_fix`; the server does not force it, and package upgrades can make a fix stale.
- Your own packages have different IDs on testnet and mainnet; framework packages (`0x1`, `0x2`) match, and memories carry no network tag.
- Scenarios simulate with `checksEnabled: false` and a placeholder sender so no funds are needed.
- Memories are plaintext to the relayer and namespaces are public: store public IDs and summaries only. The server never holds signing keys.
- Walrus semantic search can't tell hashes apart, so recall pulls a window of 50 and filters on the exact hash.
