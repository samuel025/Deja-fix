# Benchmark results

10 scenarios x 3 reps, mock (in-memory), scripted deterministic policy, not an LLM.

| Arm | 2nd-occurrence first-fix rate | Avg attempts (2nd) | Avg attempts (1st) | Unsolved |
|---|---|---|---|---|
| amnesiac | 20% | 2.27 | 2.27 | 0 |
| dejafix | 100% | 1.00 | 2.27 | 0 |

Unverified writes: 0 (remember path requires a server-run passing simulation).
