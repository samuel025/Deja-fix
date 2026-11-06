# LLM benchmark results

Model gemini-3.1-flash-lite; 10 scenarios x 3 reps; up to 3 attempts; 156 model calls; mock (in-memory).

| Arm (repeat occurrence) | Fixed on first try | Avg attempts | Unsolved |
|---|---|---|---|
| amnesiac | 60% | 1.70 | 9 |
| dejafix | 67% | 1.53 | 5 |

Results are reported whether or not memory helps. Stored fixes are written only after a passing simulation.
