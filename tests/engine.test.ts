import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { analyzeSessions, createDemoSessions, DEFAULT_WEIGHTS, parseJsonLines, scoreSession, validateSession } from "../src/engine.js";
import { renderHtml, renderMarkdown } from "../src/report.js";

test("demo sessions validate", () => {
  for (const session of createDemoSessions()) assert.deepEqual(validateSession(session), []);
});

test("utility density rewards faster, lower-friction completion", () => {
  const sessions = createDemoSessions();
  const control = scoreSession(sessions.find((item) => item.variant === "navigation-ui" && item.outcome.achieved) ?? sessions[1]!);
  const treatment = scoreSession(sessions.find((item) => item.variant === "intent-first-ui")!);
  assert.ok(treatment.valueDensity > control.valueDensity);
});

test("analysis is deterministic with fixed generatedAt", () => {
  const sessions = createDemoSessions();
  const first = analyzeSessions(sessions, { generatedAt: "2026-01-01T00:00:00Z", comparisons: [["navigation-ui", "intent-first-ui"]] });
  const second = analyzeSessions(sessions, { generatedAt: "2026-01-01T00:00:00Z", comparisons: [["navigation-ui", "intent-first-ui"]] });
  assert.deepEqual(first, second);
});

test("demo treatment produces positive measured lift", () => {
  const artifact = analyzeSessions(createDemoSessions(), { comparisons: [["navigation-ui", "intent-first-ui"]] });
  assert.equal(artifact.comparisons.length, 1);
  assert.ok(artifact.comparisons[0]!.absoluteLift > 0);
  assert.ok(artifact.byVariant["intent-first-ui"]!.successRate >= artifact.byVariant["navigation-ui"]!.successRate);
});

test("parser accepts comments and blank lines", () => {
  const session = createDemoSessions()[0]!;
  const parsed = parseJsonLines(`# fixture\n\n${JSON.stringify(session)}\n`);
  assert.equal(parsed.length, 1);
});

test("parser reports line number for malformed JSON", () => {
  assert.throws(() => parseJsonLines("# fixture\n{broken}"), /line 2: invalid JSON/u);
});

test("validation rejects impossible probabilities and zero time", () => {
  const invalid = structuredClone(createDemoSessions()[0]!);
  invalid.cost.seconds = 0;
  invalid.guardrails.regret = 1.2;
  const errors = validateSession(invalid);
  assert.ok(errors.some((error) => error.includes("seconds")));
  assert.ok(errors.some((error) => error.includes("regret")));
});

test("schema validation rejects unknown root and nested fields", () => {
  const invalid = structuredClone(createDemoSessions()[0]!) as unknown as Record<string, unknown>;
  invalid.unexpected = true;
  (invalid.outcome as Record<string, unknown>).valueTypo = 1;
  (invalid.cost as Record<string, unknown>).secondsTypo = 30;
  (invalid.guardrails as Record<string, unknown>).harmTypo = 0;
  const errors = validateSession(invalid);
  assert.ok(errors.includes("unexpected is not supported"));
  assert.ok(errors.includes("outcome.valueTypo is not supported"));
  assert.ok(errors.includes("cost.secondsTypo is not supported"));
  assert.ok(errors.includes("guardrails.harmTypo is not supported"));
});

test("validation rejects non-finite and non-numeric optional score inputs", () => {
  const invalidValue = structuredClone(createDemoSessions()[0]!);
  (invalidValue.outcome as unknown as Record<string, unknown>).value = "not-a-number";
  assert.ok(validateSession(invalidValue).some((error) => error.includes("outcome.value")));

  const invalidMeaning = structuredClone(createDemoSessions()[0]!);
  (invalidMeaning.guardrails as unknown as Record<string, unknown>).meaningfulInteractions = Number.NaN;
  assert.ok(validateSession(invalidMeaning).some((error) => error.includes("meaningfulInteractions")));

  const invalidFlow = structuredClone(createDemoSessions()[0]!);
  invalidFlow.guardrails.flowSeconds = invalidFlow.cost.seconds + 1;
  assert.ok(validateSession(invalidFlow).some((error) => error.includes("flowSeconds")));
});

test("duplicate session ids are rejected before grouping", () => {
  const sessions = createDemoSessions().slice(0, 2);
  sessions[1]!.id = sessions[0]!.id;
  assert.throws(() => analyzeSessions(sessions), /duplicate session id/u);
  const jsonl = sessions.map((session) => JSON.stringify(session)).join("\n");
  assert.throws(() => parseJsonLines(jsonl), /duplicate session id/u);
});

test("invalid analysis weights are rejected", () => {
  assert.throws(
    () => analyzeSessions(createDemoSessions(), {
      weights: { satisfaction: 0.25, friction: Number.NaN, regret: 0.35, harm: 1, cognitiveLoad: 0.35, error: 0.25 },
    }),
    /weight 'friction'/u,
  );
  assert.throws(
    () => scoreSession(createDemoSessions()[0]!, { ...DEFAULT_WEIGHTS, friction: Number.NaN }),
    /weight 'friction'/u,
  );
  const partial = { satisfaction: 0.25, regret: 0.35, harm: 1, cognitiveLoad: 0.35, error: 0.25 };
  assert.throws(() => analyzeSessions(createDemoSessions(), { weights: partial as typeof DEFAULT_WEIGHTS }), /weight 'friction'/u);
  assert.throws(() => analyzeSessions(createDemoSessions(), { weights: null as unknown as typeof DEFAULT_WEIGHTS }), /weights must be an object/u);
  assert.throws(
    () => analyzeSessions(createDemoSessions(), { weights: Object.create(DEFAULT_WEIGHTS) as typeof DEFAULT_WEIGHTS }),
    /own enumerable/u,
  );
});

test("score overflow fails instead of serializing non-finite metrics", () => {
  const session = structuredClone(createDemoSessions().find((item) => item.archetype === "utility")!);
  session.outcome.achieved = true;
  session.outcome.value = Number.MAX_VALUE;
  session.outcome.quality = 1;
  session.outcome.weight = 1;
  session.cost.seconds = 0.001;
  session.cost.friction = 0;
  session.cost.cognitiveLoad = 0;
  session.cost.errors = 0;
  assert.throws(() => scoreSession(session), /score overflowed/u);
  assert.throws(() => analyzeSessions([session]), /score overflowed/u);
});

test("timestamps require a real ISO-8601 date-time", () => {
  const session = createDemoSessions()[0]!;
  for (const timestamp of ["January 6, 2026 09:00 UTC", "2026-01-06", "2026-02-30T09:00:00.000Z"]) {
    const invalid = structuredClone(session);
    invalid.timestamp = timestamp;
    assert.ok(validateSession(invalid).some((error) => error.includes("timestamp")));
  }
  const offset = structuredClone(session);
  offset.timestamp = "2026-01-06T13:00:00+04:00";
  assert.deepEqual(validateSession(offset), []);
});

test("labels reject terminal control and format characters", () => {
  const session = structuredClone(createDemoSessions()[0]!);
  session.variant = "unsafe\u001b[2J";
  assert.ok(validateSession(session).some((error) => error.includes("control characters")));
  session.variant = "unsafe\u202e";
  assert.ok(validateSession(session).some((error) => error.includes("control characters")));
});

test("analysis includes deterministic per-intent summaries", () => {
  const sessions = createDemoSessions().slice(0, 2);
  sessions[0]!.intent = "Z intent";
  sessions[1]!.intent = "A intent";
  const artifact = analyzeSessions(sessions, { generatedAt: "2026-01-01T00:00:00Z" });
  assert.deepEqual(Object.keys(artifact.byIntent), ["A intent", "Z intent"]);
  assert.equal(artifact.byIntent["A intent"]!.sessions, 1);
  assert.ok(renderMarkdown(artifact).includes("## Intents"));
  assert.ok(renderHtml(artifact).includes("Intent summaries"));
});

test("CLI rejects unknown options before creating reports", () => {
  const output = join(mkdtempSync(join(tmpdir(), "value-density-cli-")), "wanted");
  const result = spawnSync(process.execPath, [
    "dist/src/cli.js", "analyze", "examples/sessions.jsonl", "--ouut", output,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option '--ouut'/u);
  assert.equal(existsSync(output), false);
});

test("HTML report escapes untrusted variant names", () => {
  const sessions = createDemoSessions();
  sessions[0]!.variant = "<img src=x onerror=alert(1)>";
  const html = renderHtml(analyzeSessions(sessions));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
});

test("renderers defensively neutralize terminal control bytes", () => {
  const artifact = analyzeSessions(createDemoSessions());
  artifact.byVariant = { ["unsafe\u001b[2J"]: artifact.summary };
  assert.equal(renderMarkdown(artifact).includes("\u001b"), false);
  assert.equal(renderHtml(artifact).includes("\u001b"), false);
});

test("Markdown report neutralizes table, heading, and raw HTML injection", () => {
  const sessions = createDemoSessions();
  sessions[0]!.variant = "evil | 999 | 999 | ## Forged section <img src=x onerror=alert(1)>";
  const markdown = renderMarkdown(analyzeSessions(sessions));
  assert.ok(!markdown.includes("| evil | 999"));
  assert.ok(!markdown.includes("<img src=x"));
  assert.ok(markdown.includes("&#124;"));
  assert.ok(markdown.includes("&lt;img"));
});

test("small samples are labeled as directional", () => {
  const artifact = analyzeSessions(createDemoSessions());
  assert.ok(artifact.warnings.some((warning) => warning.startsWith("Small sample")));
});

test("checked-in demo artifacts match the deterministic engine", () => {
  const sessions = createDemoSessions();
  const source = `${sessions.map((session) => JSON.stringify(session)).join("\n")}\n`;
  const artifact = analyzeSessions(sessions, {
    source,
    generatedAt: "2026-01-06T09:30:00.000Z",
    comparisons: [["navigation-ui", "intent-first-ui"]],
  });
  assert.equal(readFileSync("artifacts/demo/sessions.jsonl", "utf8"), source);
  assert.equal(readFileSync("artifacts/demo/analysis.json", "utf8"), `${JSON.stringify(artifact, null, 2)}\n`);
  assert.equal(readFileSync("artifacts/demo/report.md", "utf8"), renderMarkdown(artifact));
  assert.equal(readFileSync("artifacts/demo/index.html", "utf8"), renderHtml(artifact));
});
