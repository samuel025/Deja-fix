# Live demo in Claude Code

Setup (once): `npm run demo-bytes`, then in this folder run `claude` and approve the `deja-fix` server when asked. Check with `/mcp`.

## Session 1: first failure
Paste:

> My Sui transaction fails. The unsigned bytes (base64) are in demo/broken.b64. Use the deja-fix tools: diagnose it, recall any verified fix, then tell me what to change.

Expect: `diagnose_tx` -> a MoveAbort in `vector::borrow`, `recall_similar` -> a stored verified fix.

## Session 2: prove the fix
Paste:

> The fixed bytes are in demo/fixed.b64. Use verify_fix on them for that signature.

Expect: `passed: true`, simulated via tatum.

## Session 3: new chat (/clear), repeat failure
Paste the Session 1 prompt again in a fresh chat. Expect the agent to recall the verified fix straight from Walrus on the first call.

Do NOT call remember_fix in the demo unless you want another real Walrus write.
