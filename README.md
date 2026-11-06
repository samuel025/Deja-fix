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

## Known limits

- **Same code, different causes.** One abort code in a function can have several causes. The signature narrows it, but a recalled fix may not apply; only simulation tells you.
- **Older packages.** Packages that predate clever errors expose only a numeric code, and several non-abort failure kinds (`FunctionNotFound`, `InvariantViolation`, `TypeArgumentError`) are keyed by kind alone, so matches are coarse.
- **Upgrades.** A package upgrade can make a stored fix stale. `recall_similar` tells the agent to re-check with `verify_fix`, but the server does not force it, and confidence decay is not built.
- **Networks.** Your own packages have different IDs on testnet and mainnet, so those count as different signatures. Framework packages (`0x1`, `0x2`) are identical across networks, and memories carry no network tag.
- **Recall.** Walrus semantic search cannot tell hashes apart, so recall pulls a window of 50 and filters on the exact hash. It would need a better key at hundreds of memories.

## Results and honesty notes

- 10 verified fixes written to Walrus Memory on mainnet; blob IDs in `results/mainnet-writes.md`.
- The benchmark agent is a **scripted policy, not an LLM**: it shows the record/recall/apply loop works, not that memory helps a real model.
- Simulation uses `checksEnabled: false` with a placeholder sender so no funds are needed. Real agent transactions go through normal checks.
- Non-abort failures have coarse signatures (kind only). No scenario returned a clever-error constant name.
- Memories are plaintext to the relayer and namespaces are public: store public IDs and summaries only. The server never holds signing keys.
