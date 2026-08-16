import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmdirSync, symlinkSync, writeFileSync } from "node:fs";
import { rename as fsRename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { analyzeSessions, canonicalSessionSource, createDemoSessions, DEFAULT_WEIGHTS, parseJsonLines, scoreSession, validateSession } from "../src/engine.js";
import { renderHtml, renderMarkdown } from "../src/report.js";
import { writeArtifactSet } from "../src/safe-output.js";

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

test("schema validation rejects inherited roots and nested signal fields", () => {
  const session = createDemoSessions()[0]!;
  assert.deepEqual(validateSession(Object.create(session)), ["session must be a plain object"]);

  const inherited = structuredClone(session);
  inherited.outcome = Object.create(session.outcome) as typeof inherited.outcome;
  inherited.cost = Object.create(session.cost) as typeof inherited.cost;
  inherited.guardrails = Object.create(session.guardrails) as typeof inherited.guardrails;
  const errors = validateSession(inherited);
  assert.ok(errors.includes("outcome is required"));
  assert.ok(errors.includes("cost is required"));
  assert.ok(errors.includes("guardrails is required"));
  assert.throws(() => scoreSession(inherited), /invalid session/u);
});

test("malformed direct API sessions fail with controlled validation errors", () => {
  for (const value of [null, [], new Date("2026-01-01T00:00:00.000Z")]) {
    assert.throws(() => scoreSession(value as never), /invalid session <unknown>: session must be a plain object/u);
    assert.throws(() => analyzeSessions([value] as never), /invalid session <unknown>: session must be a plain object/u);
  }
  const sparse: unknown[] = [];
  sparse.length = 1;
  assert.throws(() => analyzeSessions(sparse as never), /dense array/u);
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

test("source hashes bind to the exact canonical sessions analyzed", () => {
  const sessions = createDemoSessions().slice(0, 2);
  const canonical = canonicalSessionSource(sessions);
  const withComments = `# accepted source comment\n${sessions.map((session) => JSON.stringify(session, null, 0)).join("\n")}\n`;
  const first = analyzeSessions(sessions, { source: canonical, generatedAt: "2026-01-01T00:00:00Z" });
  const second = analyzeSessions(sessions, { source: withComments, generatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(first.sourceSha256, second.sourceSha256);
  assert.throws(
    () => analyzeSessions(sessions, { source: JSON.stringify(createDemoSessions()[2]), generatedAt: "2026-01-01T00:00:00Z" }),
    /source ledger does not match/u,
  );
  assert.throws(
    () => analyzeSessions(sessions, { generatedAt: "2026-01-01T00:00:00Z", typo: true } as never),
    /unknown analysis option/u,
  );
});

test("CLI rejects unknown options before creating reports", () => {
  const output = join(mkdtempSync(join(tmpdir(), "value-density-cli-")), "wanted");
  const result = spawnSync(process.execPath, [
    "dist/src/cli.js", "analyze", "examples/sessions.jsonl", "--ouut", output,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown option '--ouut'/u);
  assert.equal(existsSync(output), false);

  for (const args of [["--help", "extra"], ["validate", "-input.jsonl"], ["demo", "--out", "-directory"]]) {
    const rejected = spawnSync(process.execPath, ["dist/src/cli.js", ...args], { cwd: process.cwd(), encoding: "utf8" });
    assert.equal(rejected.status, 1);
  }
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

test("CLI artifact publication rejects symlink and non-directory targets before writing", async () => {
  const root = mkdtempSync(join(tmpdir(), "value-density-safe-output-"));
  const victim = join(root, "victim.txt");
  writeFileSync(victim, "unchanged\n");

  const fileTarget = join(root, "file-target");
  mkdirSync(fileTarget);
  symlinkSync(victim, join(fileTarget, "analysis.json"));
  const fileResult = spawnSync(process.execPath, ["dist/src/cli.js", "demo", "--out", fileTarget], { encoding: "utf8" });
  assert.equal(fileResult.status, 1);
  assert.match(fileResult.stderr, /regular file/u);
  assert.equal(readFileSync(victim, "utf8"), "unchanged\n");
  assert.deepEqual(readdirSync(fileTarget), ["analysis.json"]);

  const directoryVictim = join(root, "directory-victim");
  mkdirSync(directoryVictim);
  const linkedOutput = join(root, "linked-output");
  symlinkSync(directoryVictim, linkedOutput);
  const directoryResult = spawnSync(process.execPath, ["dist/src/cli.js", "demo", "--out", linkedOutput], { encoding: "utf8" });
  assert.equal(directoryResult.status, 1);
  assert.match(directoryResult.stderr, /symbolic-link component/u);
  const nestedResult = spawnSync(process.execPath, ["dist/src/cli.js", "demo", "--out", join(linkedOutput, "nested")], { encoding: "utf8" });
  assert.equal(nestedResult.status, 1);
  assert.match(nestedResult.stderr, /symbolic-link component/u);
  assert.deepEqual(readdirSync(directoryVictim), []);

  const parentFile = join(root, "not-a-directory");
  writeFileSync(parentFile, "x");
  const parentResult = spawnSync(process.execPath, ["dist/src/cli.js", "demo", "--out", join(parentFile, "child")], { encoding: "utf8" });
  assert.equal(parentResult.status, 1);

  const transactional = join(root, "transactional");
  mkdirSync(transactional);
  writeFileSync(join(transactional, "one.txt"), "original\n");
  let publishes = 0;
  await assert.rejects(writeArtifactSet(transactional, { "one.txt": "replacement\n", "two.txt": "new\n" }, {
    publishRename: async (source, destination) => {
      publishes += 1;
      if (publishes === 2) throw new Error("injected second publish failure");
      await fsRename(source, destination);
    },
  }), /injected second publish failure/u);
  assert.equal(publishes, 2);
  assert.equal(readFileSync(join(transactional, "one.txt"), "utf8"), "original\n");
  assert.deepEqual(readdirSync(transactional), ["one.txt"]);

  const ambiguous = join(root, "ambiguous-rename");
  mkdirSync(ambiguous);
  writeFileSync(join(ambiguous, "one.txt"), "original-one\n");
  writeFileSync(join(ambiguous, "two.txt"), "original-two\n");
  let completedRenames = 0;
  await assert.rejects(writeArtifactSet(ambiguous, { "one.txt": "replacement-one\n", "two.txt": "replacement-two\n" }, {
    publishRename: async (source, destination) => {
      await fsRename(source, destination);
      completedRenames += 1;
      if (completedRenames === 2) throw new Error("injected post-rename failure");
    },
  }), /injected post-rename failure/u);
  assert.equal(readFileSync(join(ambiguous, "one.txt"), "utf8"), "original-one\n");
  assert.equal(readFileSync(join(ambiguous, "two.txt"), "utf8"), "original-two\n");
  assert.deepEqual(readdirSync(ambiguous), ["one.txt", "two.txt"]);

  const concurrent = join(root, "concurrent-writers");
  mkdirSync(concurrent);
  const pause = async (): Promise<void> => new Promise((resolvePause) => { setTimeout(resolvePause, 20); });
  const writer = async (label: "A" | "B"): Promise<void> => {
    let writerRenames = 0;
    await writeArtifactSet(concurrent, { "one.txt": `${label}\n`, "two.txt": `${label}\n` }, {
      publishRename: async (source, destination) => {
        writerRenames += 1;
        if (label === "A" && writerRenames === 1) await pause();
        await fsRename(source, destination);
        if (label === "B" && writerRenames === 1) await pause();
      },
    });
  };
  await Promise.all([writer("A"), writer("B")]);
  const concurrentContents = ["one.txt", "two.txt"].map((name) => readFileSync(join(concurrent, name), "utf8"));
  assert.equal(concurrentContents[0], concurrentContents[1]);
  assert.ok(concurrentContents[0] === "A\n" || concurrentContents[0] === "B\n");
  assert.deepEqual(readdirSync(concurrent), ["one.txt", "two.txt"]);

  const stale = join(root, "stale-lock");
  mkdirSync(stale);
  const staleLock = join(stale, ".artifact-write.lock");
  mkdirSync(staleLock);
  await assert.rejects(writeArtifactSet(stale, { "one.txt": "unpublished\n" }, { lockTimeoutMs: 0 }), /lock is held or stale/u);
  assert.deepEqual(readdirSync(stale), [".artifact-write.lock"]);
  rmdirSync(staleLock);
});
