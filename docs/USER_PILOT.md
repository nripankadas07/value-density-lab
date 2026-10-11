# Try Value Density Lab and tell us what breaks

For product managers, UX researchers, and product analysts. Pick the browser route or a local task below; stopping at a
blocker is useful feedback. The times are estimates, not a completion requirement.

[Give first-use feedback](https://github.com/nripankadas07/value-density-lab/issues/new?template=user_feedback.yml) ·
[See known limitations](limitations.md)

## Try it in your browser (about 5 minutes)

Open the [synthetic invoice-flow report](https://nripankadas07.github.io/value-density-lab/).
Compare completion, user time, friction, and guardrails for the two flows. Pick
one scoring assumption you would challenge before using the result in a product
decision. Could you find the raw component behind it? No installation is needed.

## Make your first report (about 15 minutes)

Requires Git and Node.js 22 or newer:

```bash
git clone https://github.com/nripankadas07/value-density-lab.git
cd value-density-lab
npm ci
npm run build
node dist/src/cli.js validate examples/sessions.jsonl
node dist/src/cli.js compare examples/sessions.jsonl --control navigation-ui --treatment intent-first-ui --out pilot/baseline
```

Open `pilot/baseline/index.html`. State which flow you would investigate next
and why. Separate completion, guardrail failures, and the score. All bundled
events are synthetic; their comparison is not evidence of improvement in a
real product or a causal treatment effect.

## Test a question from your own work

Pick one workflow you know well. Define its intent, what counts as completion,
how quality is assessed, and which harms must prevent a success claim. Create a
small **synthetic** ledger following the [event contract](../README.md#event-contract)
to test whether those definitions fit. Keep it local:

```bash
node dist/src/cli.js validate pilot-sessions.jsonl
node dist/src/cli.js analyze pilot-sessions.jsonl --out pilot/own-workflow
```

Report a field you could not measure credibly, an adapter you needed, or a
counterexample where the score conflicts with a reasonable judgment. If you later
use actual observations, obtain consent and authorization, remove identifiers,
and keep raw session records private. Public feedback should contain only a
sanitized description or synthetic reproduction. Read
[measurement notes](measurement.md) and [limitations](limitations.md).

## Share a specific observation

Use the [feedback form](https://github.com/nripankadas07/value-density-lab/issues/new?template=user_feedback.yml). It asks for your task, route, outcome,
version, and one specific result or blocker. Browser reviews and bundled-fixture
runs help test usability; applying a relevant question from your own work gives
stronger evidence of usefulness. A claim that you would return is different from
actually returning: if you try it again, add a dated comment to the same issue
with the new task and result.

**Feedback is public.** Do not post secrets, personal records, private customer
or employer data, or raw private event ledgers. Quotes need your separate approval.
Security concerns belong in the repository's security-reporting path, not this
public form. No reward, star, or endorsement is required.
