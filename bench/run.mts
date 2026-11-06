// Benchmark: memory vs no memory. Scripted deterministic agent, NOT an LLM.
// Simulation only. Memory is the in-memory mock unless BENCH_REAL_WALRUS=1 (never default).
import { writeFileSync } from "node:fs";
import { Transaction } from "@mysten/sui/transactions";
import { Chain } from "../src/chain.js";
import { Memory } from "../src/memory.js";
import { VerificationGate } from "../src/gate.js";
import { signatureHash, type FailureFacts } from "../src/signature.js";
import { scenarios, type Scenario } from "../scenarios/scenarios.js";

const REPS = Number(process.env.BENCH_REPS ?? 3);
const forceMock = process.env.BENCH_REAL_WALRUS !== "1";
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const chain = new Chain();
const mk = (f: (t: Transaction) => void) => { const t = new Transaction(); t.setSender(sender); f(t); return t; };
const sim = (f: (t: Transaction) => void) => chain.simulate(mk(f), { checksEnabled: false });

// seeded PRNG so both arms see the same candidate ordering
function rng(seed: number) { let a = (seed + 1) * 2654435761; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface Candidate { hint: string; build: (t: Transaction) => void }
function candidates(s: Scenario, i: number, rand: () => number): Candidate[] {
  // two plausible-but-wrong guesses (other scenarios' broken txs) and the real fix, in seeded order
  const wrong = [1, 2].map((k) => ({ hint: `wrong-${k}`, build: scenarios[(i + k * 3) % scenarios.length].broken }));
  const list: Candidate[] = [...wrong];
  list.splice(Math.floor(rand() * 3), 0, { hint: s.fixHint, build: s.fixed });
  return list;
}

interface Session { attempts: number; firstTry: boolean; passed: boolean; usedMemory: boolean }

async function session(s: Scenario, cands: Candidate[], mem: Memory | null, gate: VerificationGate): Promise<Session> {
  const b = await sim(s.broken);
  const facts = b.facts as FailureFacts;
  const hash = signatureHash(facts);
  let order = cands;
  let usedMemory = false;
  if (mem) {
    const recalled = await mem.recallFixes(hash);
    const hit = recalled[0] && cands.find((c) => c.hint === recalled[0].summary);
    if (hit) { order = [hit, ...cands.filter((c) => c !== hit)]; usedMemory = true; }
  }
  let attempts = 0;
  for (const c of order) {
    attempts++;
    const r = await sim(c.build);
    gate.record({ signatureHash: hash, passed: r.passed, txBytesHash: c.hint });
    if (r.passed) {
      if (mem && !usedMemory) {
        const v = [...(gate as any).store.values()].pop();
        gate.require(v.id, hash);
        await mem.write({ type: "verified_fix", signatureHash: hash, summary: c.hint, facts, verificationId: v.id, simulation: "pass" });
      }
      return { attempts, firstTry: attempts === 1, passed: true, usedMemory };
    }
  }
  return { attempts, firstTry: false, passed: false, usedMemory };
}

const rows: any[] = [];
for (let rep = 0; rep < REPS; rep++) {
  const memory = new Memory(process.env, forceMock);
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const row: any = { rep, scenario: s.id };
    for (const arm of ["amnesiac", "dejafix"] as const) {
      const mem = arm === "dejafix" ? memory : null;
      const gate = new VerificationGate();
      const r1 = await session(s, candidates(s, i, rng(rep * 100 + i)), mem, gate); // first occurrence
      const r2 = await session(s, candidates(s, i, rng(rep * 100 + i)), mem, new VerificationGate()); // repeat, new session
      row[arm] = { first: r1, second: r2 };
    }
    rows.push(row);
    console.log(`rep${rep} ${s.id.padEnd(28)} amnesiac 2nd=${row.amnesiac.second.attempts} dejafix 2nd=${row.dejafix.second.attempts}${row.dejafix.second.usedMemory ? " (recalled)" : ""}`);
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const arms = ["amnesiac", "dejafix"] as const;
const summary = Object.fromEntries(arms.map((a) => [a, {
  secondFirstTryRate: avg(rows.map((r) => (r[a].second.firstTry ? 1 : 0))),
  secondAvgAttempts: avg(rows.map((r) => r[a].second.attempts)),
  firstAvgAttempts: avg(rows.map((r) => r[a].first.attempts)),
  unsolved: rows.filter((r) => !r[a].second.passed).length,
}]));
const meta = { when: new Date().toISOString(), reps: REPS, scenarios: scenarios.length, memory: forceMock ? "mock (in-memory)" : "walrus", agent: "scripted deterministic policy, not an LLM", unverifiedWrites: 0 };
writeFileSync("results/benchmark.json", JSON.stringify({ meta, summary, rows }, null, 2));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const md = `# Benchmark results\n\n${meta.scenarios} scenarios x ${REPS} reps, ${meta.memory}, ${meta.agent}.\n\n| Arm | 2nd-occurrence first-fix rate | Avg attempts (2nd) | Avg attempts (1st) | Unsolved |\n|---|---|---|---|---|\n` +
  arms.map((a) => `| ${a} | ${pct(summary[a].secondFirstTryRate)} | ${summary[a].secondAvgAttempts.toFixed(2)} | ${summary[a].firstAvgAttempts.toFixed(2)} | ${summary[a].unsolved} |`).join("\n") +
  `\n\nUnverified writes: 0 (remember path requires a server-run passing simulation).\n`;
writeFileSync("results/benchmark.md", md);
console.log("\n" + md);
