// LLM benchmark: Gemini rewrites a failing transaction program; the chain (simulation) judges it.
// Arms for the repeat occurrence: no memory vs Déjà Fix recall. Memory is the in-memory mock; no Walrus writes.
import { writeFileSync } from "node:fs";
import { Chain } from "../src/chain.js";
import { Memory } from "../src/memory.js";
import { VerificationGate } from "../src/gate.js";
import { signatureHash, type FailureFacts } from "../src/signature.js";
import { compile, type Program } from "../scenarios/dsl.js";
import { scenarios, type Scenario } from "../scenarios/scenarios.js";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error("GEMINI_API_KEY is not set"); process.exit(1); }
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
const REPS = Number(process.env.BENCH_REPS ?? 3);
const MAX_ATTEMPTS = 3;
const LIMIT = Number(process.env.BENCH_SCENARIOS ?? scenarios.length);
const sender = "0x0000000000000000000000000000000000000000000000000000000000000abc";
const chain = new Chain();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let llmCalls = 0;
const MIN_GAP = Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 7000);
let lastCall = 0;

async function gemini(prompt: string): Promise<{ program: Program; summary: string }> {
  for (let i = 0; i < 8; i++) {
    const wait = lastCall + MIN_GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    llmCalls++;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY! },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json" } }),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(15000 * (i + 1)); continue; }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j: any = await res.json();
    const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
    try { const o = JSON.parse(text); if (o.program?.commands) return { program: o.program, summary: String(o.summary ?? "") }; } catch {}
    return { program: { commands: [] }, summary: "" }; // unparseable counts as a failed attempt
  }
  throw new Error("Gemini kept rate-limiting");
}

const SPEC = `A Sui transaction is written as JSON: {"gasBudget"?: number, "commands": [...]}. Commands:
{"cmd":"moveCall","target":"0xPKG::module::function","typeArguments"?:[...],"arguments"?:[Arg...]}
{"cmd":"splitCoins","coin":Arg,"amounts":[numbers]}
{"cmd":"transferObjects","objects":[Arg...],"to":"0xaddr"}
Arg is one of {"u64":n} {"bytes":[n,...]} {"result":commandIndex} {"gas":true}. Return ONLY JSON: {"program": <fixed program>, "summary": "<one sentence: what was wrong and what you changed>"}.`;

async function session(s: Scenario, mem: Memory | null, gate: VerificationGate, store: boolean) {
  const b = await chain.simulate(compile(s.program, sender), { checksEnabled: false });
  const facts = b.facts as FailureFacts;
  const hash = signatureHash(facts);
  let recalled = "";
  if (mem) { const r = await mem.recallFixes(hash); if (r[0]?.summary) recalled = r[0].summary; }
  const history: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const prompt = `${SPEC}\n\nThis transaction fails in simulation:\n${JSON.stringify(s.program)}\n\nDiagnosis from the chain: ${facts.message}\nKind: ${facts.kind}${recalled ? `\n\nA previously verified fix for this exact failure signature (confirmed by simulation): "${recalled}"` : ""}${history.length ? `\n\nYour earlier attempts failed:\n${history.join("\n")}` : ""}`;
    const out = await gemini(prompt);
    let passed = false, why = "invalid program";
    try {
      const r = await chain.simulate(compile(out.program, sender), { checksEnabled: false });
      passed = r.passed; why = r.facts?.message ?? "unknown";
    } catch (e: any) { why = String(e.message).slice(0, 120); }
    const v = gate.record({ signatureHash: hash, passed, txBytesHash: JSON.stringify(out.program).slice(0, 40) });
    if (passed) {
      if (store && mem && out.summary) {
        gate.require(v.id, hash);
        await mem.write({ type: "verified_fix", signatureHash: hash, summary: out.summary, facts, verificationId: v.id, simulation: "pass" });
      }
      return { attempts: attempt, firstTry: attempt === 1, passed: true, recalled: !!recalled };
    }
    history.push(`attempt ${attempt}: ${JSON.stringify(out.program)} -> ${why}`);
  }
  return { attempts: MAX_ATTEMPTS, firstTry: false, passed: false, recalled: !!recalled };
}

const rows: any[] = [];
let aborted = "";
outer: for (let rep = 0; rep < REPS; rep++) {
  const memory = new Memory(process.env, true); // mock, always
  for (const s of scenarios.slice(0, LIMIT)) {
    let first, amnesiac, dejafix;
    try {
      first = await session(s, memory, new VerificationGate(), true); // first occurrence; stores only if verified
      amnesiac = await session(s, null, new VerificationGate(), false);
      dejafix = await session(s, memory, new VerificationGate(), false);
    } catch (e: any) { aborted = `stopped at rep${rep} ${s.id}: ${String(e.message).slice(0, 120)}`; console.error(aborted); break outer; }
    rows.push({ rep, scenario: s.id, first, amnesiac, dejafix });
    console.log(`rep${rep} ${s.id.padEnd(28)} first=${first.attempts}${first.passed ? "" : "!"} amnesiac=${amnesiac.attempts}${amnesiac.passed ? "" : "!"} dejafix=${dejafix.attempts}${dejafix.passed ? "" : "!"}${dejafix.recalled ? " (recalled)" : ""}`);
  }
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const arms = ["amnesiac", "dejafix"] as const;
const summary = Object.fromEntries(arms.map((a) => [a, {
  firstTryRate: avg(rows.map((r) => (r[a].firstTry ? 1 : 0))),
  avgAttempts: avg(rows.map((r) => r[a].attempts)),
  unsolved: rows.filter((r) => !r[a].passed).length,
}]));
const meta = { aborted: aborted || undefined, completedRuns: rows.length, when: new Date().toISOString(), model: MODEL, reps: REPS, scenarios: Math.min(LIMIT, scenarios.length), maxAttempts: MAX_ATTEMPTS, llmCalls, memory: "mock (in-memory)", note: "first occurrence is shared; both arms then see the repeat in a fresh session" };
writeFileSync("results/benchmark-llm.json", JSON.stringify({ meta, summary, rows }, null, 2));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const md = `# LLM benchmark results\n\nModel ${MODEL}; ${meta.scenarios} scenarios x ${REPS} reps; up to ${MAX_ATTEMPTS} attempts; ${llmCalls} model calls; ${meta.memory}.\n\n| Arm (repeat occurrence) | Fixed on first try | Avg attempts | Unsolved |\n|---|---|---|---|\n` +
  arms.map((a) => `| ${a} | ${pct(summary[a].firstTryRate)} | ${summary[a].avgAttempts.toFixed(2)} | ${summary[a].unsolved} |`).join("\n") + `\n\n${aborted ? `**Incomplete: ${aborted}** (${rows.length} scenario runs completed).\n\n` : ""}Results are reported whether or not memory helps. Stored fixes are written only after a passing simulation.\n`;
writeFileSync("results/benchmark-llm.md", md);
console.log("\n" + md);
