#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { analyzeSessions, createDemoSessions, parseJsonLines, validateSession } from "./engine.js";
import { renderHtml, renderMarkdown } from "./report.js";
import type { AnalysisArtifact, ValueSession } from "./types.js";

const HELP = `Value Density Lab — outcomes achieved per unit of user cost

Usage:
  value-density validate <sessions.jsonl>
  value-density analyze <sessions.jsonl> --out <directory>
  value-density compare <sessions.jsonl> --control <name> --treatment <name> --out <directory>
  value-density demo [--out <directory>]

Inputs are local JSONL sessions using value-density.session.v1. Reports are JSON,
Markdown, and self-contained HTML. No telemetry, account, model, or API key is used.`;

function option(args: string[], name: string, fallback?: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function validateCommandArgs(args: string[], command: string, allowed: string[], positional: number): void {
  const seen = new Set<string>();
  for (const arg of args) {
    if (/[\p{Cc}\p{Cf}]/u.test(arg)) throw new Error("arguments must not contain control characters");
  }
  for (let index = 1 + positional; index < args.length; index += 1) {
    const name = args[index]!;
    if (!name.startsWith("--")) throw new Error(`unexpected argument '${name}'`);
    if (!allowed.includes(name)) throw new Error(`unknown option '${name}' for ${command}`);
    if (seen.has(name)) throw new Error(`duplicate option '${name}'`);
    seen.add(name);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    index += 1;
  }
}

function serializeJsonl(sessions: ValueSession[]): string {
  return `${sessions.map((session) => JSON.stringify(session)).join("\n")}\n`;
}

async function writeReports(directory: string, artifact: AnalysisArtifact): Promise<void> {
  const output = resolve(directory);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(join(output, "analysis.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8"),
    writeFile(join(output, "report.md"), renderMarkdown(artifact), "utf8"),
    writeFile(join(output, "index.html"), renderHtml(artifact), "utf8"),
  ]);
  process.stdout.write(`wrote ${join(output, "analysis.json")}\n`);
  process.stdout.write(`wrote ${join(output, "report.md")}\n`);
  process.stdout.write(`wrote ${join(output, "index.html")}\n`);
}

async function load(path: string): Promise<{ text: string; sessions: ValueSession[] }> {
  const text = await readFile(resolve(path), "utf8");
  return { text, sessions: parseJsonLines(text) };
}

async function run(args: string[]): Promise<void> {
  const [command, input] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (command === "demo") {
    validateCommandArgs(args, command, ["--out"], 0);
    const out = option(args, "--out", ".demo") ?? ".demo";
    const sessions = createDemoSessions();
    const text = serializeJsonl(sessions);
    await mkdir(resolve(out), { recursive: true });
    await writeFile(join(resolve(out), "sessions.jsonl"), text, "utf8");
    await writeReports(out, analyzeSessions(sessions, {
      source: text,
      generatedAt: "2026-01-06T09:30:00.000Z",
      comparisons: [["navigation-ui", "intent-first-ui"]],
    }));
    return;
  }
  if (!["validate", "analyze", "compare"].includes(command)) {
    throw new Error(`unknown command '${command}'\n\n${HELP}`);
  }
  if (!input || input.startsWith("--")) throw new Error(`${command} requires an input JSONL file`);
  const allowed = command === "validate" ? [] : command === "analyze" ? ["--out"] : ["--out", "--control", "--treatment"];
  validateCommandArgs(args, command, allowed, 1);
  const loaded = await load(input);
  if (command === "validate") {
    for (const session of loaded.sessions) {
      const errors = validateSession(session);
      if (errors.length) throw new Error(`${session.id}: ${errors.join("; ")}`);
    }
    process.stdout.write(`valid ${loaded.sessions.length} session(s)\n`);
    return;
  }
  const out = option(args, "--out", dirname(resolve(input))) ?? ".";
  if (command === "analyze") {
    await writeReports(out, analyzeSessions(loaded.sessions, { source: loaded.text }));
    return;
  }
  if (command === "compare") {
    const control = option(args, "--control");
    const treatment = option(args, "--treatment");
    if (!control || !treatment) throw new Error("compare requires --control and --treatment");
    await writeReports(out, analyzeSessions(loaded.sessions, {
      source: loaded.text,
      comparisons: [[control, treatment]],
    }));
    return;
  }
}

run(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`value-density: ${(error as Error).message}\n`);
  process.exitCode = 1;
});
