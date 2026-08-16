import { createHash } from "node:crypto";
import {
  ANALYSIS_SCHEMA,
  SESSION_SCHEMA,
  type AnalysisArtifact,
  type Archetype,
  type ScoreWeights,
  type SessionScore,
  type SummaryStats,
  type ValueSession,
  type VariantComparison,
} from "./types.js";

export const DEFAULT_WEIGHTS: ScoreWeights = Object.freeze({
  satisfaction: 0.25,
  friction: 0.2,
  regret: 0.35,
  harm: 1.0,
  cognitiveLoad: 0.35,
  error: 0.25,
});

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const inUnitInterval = (value: unknown): value is number =>
  finite(value) && value >= 0 && value <= 1;
const hasUnsafeControl = (value: string): boolean => /[\p{Cc}\p{Cf}]/u.test(value);
const safeForMessage = (value: string): string => value.replace(
  /[\p{Cc}\p{Cf}]/gu,
  (character) => `\\u{${character.codePointAt(0)!.toString(16).padStart(4, "0")}}`,
);

const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1]!;
}

function rejectUnknownFields(
  value: object,
  allowed: readonly string[],
  prefix: string,
  errors: string[],
): void {
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) errors.push(`${prefix}${safeForMessage(field)} is not supported`);
  }
}

export function validateSession(value: unknown): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["session must be an object"];
  }
  const session = value as Partial<ValueSession>;
  rejectUnknownFields(session, [
    "schemaVersion", "id", "timestamp", "intent", "archetype", "outcome", "cost", "guardrails",
    "variant", "userHash", "tags",
  ], "", errors);
  if (session.schemaVersion !== SESSION_SCHEMA) errors.push(`schemaVersion must be ${SESSION_SCHEMA}`);
  if (typeof session.id !== "string" || session.id.trim() === "" || hasUnsafeControl(session.id)) {
    errors.push("id must be a non-empty string without control characters");
  }
  if (typeof session.intent !== "string" || session.intent.trim() === "" || hasUnsafeControl(session.intent)) {
    errors.push("intent must be a non-empty string without control characters");
  }
  if (!(["general", "utility", "entertainment", "education"] as unknown[]).includes(session.archetype)) {
    errors.push("archetype must be general, utility, entertainment, or education");
  }
  if (!isIsoDateTime(session.timestamp)) {
    errors.push("timestamp must be an ISO-8601 date-time");
  }
  if (typeof session.outcome !== "object" || session.outcome === null) {
    errors.push("outcome is required");
  } else {
    rejectUnknownFields(session.outcome, ["achieved", "quality", "weight", "value", "knowledgeDelta"], "outcome.", errors);
    if (typeof session.outcome.achieved !== "boolean") errors.push("outcome.achieved must be boolean");
    for (const field of ["quality", "weight"] as const) {
      if (!inUnitInterval(session.outcome[field])) errors.push(`outcome.${field} must be between 0 and 1`);
    }
    if (session.outcome.knowledgeDelta !== undefined && !inUnitInterval(session.outcome.knowledgeDelta)) {
      errors.push("outcome.knowledgeDelta must be between 0 and 1");
    }
    if (session.outcome.value !== undefined &&
        (!finite(session.outcome.value) || session.outcome.value < 0)) {
      errors.push("outcome.value must be a non-negative finite number");
    }
  }
  if (typeof session.cost !== "object" || session.cost === null) {
    errors.push("cost is required");
  } else {
    rejectUnknownFields(session.cost, ["seconds", "friction", "cognitiveLoad", "errors", "opportunityCost"], "cost.", errors);
    if (!finite(session.cost.seconds) || session.cost.seconds <= 0) errors.push("cost.seconds must be > 0");
    if (!Number.isInteger(session.cost.errors) || session.cost.errors < 0) errors.push("cost.errors must be a non-negative integer");
    for (const field of ["friction", "cognitiveLoad"] as const) {
      if (!inUnitInterval(session.cost[field])) errors.push(`cost.${field} must be between 0 and 1`);
    }
    if (session.cost.opportunityCost !== undefined &&
        (!finite(session.cost.opportunityCost) || session.cost.opportunityCost < 0)) {
      errors.push("cost.opportunityCost must be a non-negative finite number");
    }
  }
  if (typeof session.guardrails !== "object" || session.guardrails === null) {
    errors.push("guardrails is required");
  } else {
    rejectUnknownFields(session.guardrails, [
      "satisfaction", "regret", "harm", "fatigue", "drift", "retention", "flowSeconds",
      "meaningfulInteractions", "attentionQuality", "outcomeLift",
    ], "guardrails.", errors);
    for (const field of ["satisfaction", "regret", "harm"] as const) {
      if (!inUnitInterval(session.guardrails[field])) errors.push(`guardrails.${field} must be between 0 and 1`);
    }
    for (const field of ["fatigue", "drift", "retention", "meaningfulInteractions", "attentionQuality", "outcomeLift"] as const) {
      const candidate = session.guardrails[field];
      if (candidate !== undefined && !inUnitInterval(candidate)) errors.push(`guardrails.${field} must be between 0 and 1`);
    }
    if (session.guardrails.flowSeconds !== undefined &&
        (!finite(session.guardrails.flowSeconds) || session.guardrails.flowSeconds < 0)) {
      errors.push("guardrails.flowSeconds must be non-negative");
    }
    if (finite(session.guardrails.flowSeconds) && finite(session.cost?.seconds) &&
        session.guardrails.flowSeconds > session.cost.seconds) {
      errors.push("guardrails.flowSeconds cannot exceed cost.seconds");
    }
  }
  if (session.variant !== undefined &&
      (typeof session.variant !== "string" || session.variant.trim() === "" || hasUnsafeControl(session.variant))) {
    errors.push("variant must be a non-empty string without control characters when provided");
  }
  if (session.userHash !== undefined &&
      (typeof session.userHash !== "string" || session.userHash.trim() === "" || hasUnsafeControl(session.userHash))) {
    errors.push("userHash must be a non-empty string without control characters when provided");
  }
  if (session.tags !== undefined &&
      (!Array.isArray(session.tags) || session.tags.some((tag) =>
        typeof tag !== "string" || tag.trim() === "" || hasUnsafeControl(tag)))) {
    errors.push("tags must contain only non-empty strings without control characters");
  }
  return errors;
}

function validateWeights(weights: ScoreWeights): void {
  if (typeof weights !== "object" || weights === null || Array.isArray(weights)) {
    throw new Error("weights must be an object");
  }
  const names: Array<keyof ScoreWeights> = ["satisfaction", "friction", "regret", "harm", "cognitiveLoad", "error"];
  const extras = Object.keys(weights).filter((name) => !names.includes(name as keyof ScoreWeights));
  if (extras.length > 0) throw new Error(`unknown weight '${safeForMessage(extras[0]!)}'`);
  for (const name of names) {
    if (!Object.prototype.hasOwnProperty.call(weights, name) ||
        !Object.prototype.propertyIsEnumerable.call(weights, name)) {
      throw new Error(`weight '${name}' must be an own enumerable property`);
    }
    const value = weights[name];
    if (!finite(value) || value < 0) {
      throw new Error(`weight '${name}' must be a non-negative finite number`);
    }
  }
}

function round(value: number, digits = 6): number {
  if (!finite(value)) throw new Error("calculation produced a non-finite number");
  const factor = 10 ** digits;
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER / factor) return value;
  return Math.round(value * factor) / factor;
}

function scoreGeneral(session: ValueSession, w: ScoreWeights): SessionScore {
  const value = session.outcome.value ?? 1;
  const outcome = Number(session.outcome.achieved) * session.outcome.quality * session.outcome.weight * value;
  const positive = outcome + w.satisfaction * session.guardrails.satisfaction;
  const penalty = w.friction * session.cost.friction + w.regret * session.guardrails.regret + w.harm * session.guardrails.harm;
  const numerator = Math.max(0, positive - penalty);
  const denominator = Math.max(1 / 60, session.cost.seconds / 60 + w.cognitiveLoad * session.cost.cognitiveLoad + w.error * session.cost.errors);
  return makeScore(session, numerator, denominator, { outcome, positive, penalty });
}

function scoreUtility(session: ValueSession, w: ScoreWeights): SessionScore {
  const taskValue = session.outcome.value ?? session.outcome.weight;
  const numerator = Number(session.outcome.achieved) * taskValue * session.outcome.quality;
  const denominator = Math.max(
    1 / 60,
    session.cost.seconds / 60 + w.friction * session.cost.friction + w.error * session.cost.errors + w.cognitiveLoad * session.cost.cognitiveLoad,
  );
  const harmMultiplier = 1 - session.guardrails.harm;
  return makeScore(session, numerator * harmMultiplier, denominator, { taskValue, harmMultiplier });
}

function scoreEntertainment(session: ValueSession, w: ScoreWeights): SessionScore {
  const minutes = Math.max(1 / 60, session.cost.seconds / 60);
  const flowShare = Math.min(1, (session.guardrails.flowSeconds ?? 0) / session.cost.seconds);
  const meaningful = session.guardrails.meaningfulInteractions ?? session.outcome.quality;
  const drift = session.guardrails.drift ?? 0;
  const fatigue = session.guardrails.fatigue ?? 0;
  const penalty = drift + fatigue + session.guardrails.regret + w.harm * session.guardrails.harm;
  const numerator = Math.max(0, session.outcome.quality * flowShare + meaningful - penalty);
  return makeScore(session, numerator, minutes, { flowShare, meaningful, penalty });
}

function scoreEducation(session: ValueSession, w: ScoreWeights): SessionScore {
  const knowledgeDelta = session.outcome.knowledgeDelta ?? session.outcome.quality;
  const retention = session.guardrails.retention ?? 0;
  const effectiveMinutes = Math.max(1 / 60, session.cost.seconds / 60);
  const load = Math.max(0.1, session.cost.cognitiveLoad);
  const numerator = Number(session.outcome.achieved) * knowledgeDelta * (1 + retention);
  const denominator = effectiveMinutes * load + w.friction * session.cost.friction + w.harm * session.guardrails.harm;
  return makeScore(session, numerator, Math.max(1 / 60, denominator), { knowledgeDelta, retention, load });
}

function makeScore(
  session: ValueSession,
  numerator: number,
  denominator: number,
  components: Record<string, number>,
): SessionScore {
  if (!finite(numerator) || numerator < 0) throw new Error(`session '${session.id}' produced an invalid numerator`);
  if (!finite(denominator) || denominator <= 0) throw new Error(`session '${session.id}' produced an invalid denominator`);
  for (const [name, value] of Object.entries(components)) {
    if (!finite(value)) throw new Error(`session '${session.id}' produced an invalid '${name}' component`);
  }
  const valueDensity = numerator / denominator;
  if (!finite(valueDensity)) throw new Error(`session '${session.id}' score overflowed`);
  return {
    id: session.id,
    intent: session.intent,
    archetype: session.archetype,
    variant: session.variant ?? "unassigned",
    achieved: session.outcome.achieved,
    valueDensity: round(valueDensity),
    numerator: round(numerator),
    denominator: round(denominator),
    guardrailPass: session.guardrails.harm === 0 && session.guardrails.regret < 0.5,
    components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value)])),
  };
}

export function scoreSession(session: ValueSession, weights: ScoreWeights = DEFAULT_WEIGHTS): SessionScore {
  const errors = validateSession(session);
  if (errors.length > 0) throw new Error(`invalid session ${session.id || "<unknown>"}: ${errors.join("; ")}`);
  validateWeights(weights);
  const scorers: Record<Archetype, (s: ValueSession, w: ScoreWeights) => SessionScore> = {
    general: scoreGeneral,
    utility: scoreUtility,
    entertainment: scoreEntertainment,
    education: scoreEducation,
  };
  return scorers[session.archetype](session, weights);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const a = sorted[low] ?? 0;
  const b = sorted[high] ?? a;
  return round(a + (b - a) * (index - low));
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapMeanCI(values: number[], seed = 7331, iterations = 800): [number, number] {
  if (values.length === 0) return [0, 0];
  if (values.length === 1) return [round(values[0] ?? 0), round(values[0] ?? 0)];
  const random = rng(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    let mean = 0;
    for (let j = 0; j < values.length; j += 1) {
      const value = values[Math.floor(random() * values.length)] ?? 0;
      mean += (value - mean) / (j + 1);
    }
    if (!finite(mean)) throw new Error("bootstrap calculation overflowed");
    means.push(mean);
  }
  return [percentile(means, 0.05), percentile(means, 0.95)];
}

function summarize(sessions: ValueSession[], scores: SessionScore[]): SummaryStats {
  const density = scores.map((score) => score.valueDensity);
  let mean = 0;
  for (const [index, value] of density.entries()) mean += (value - mean) / (index + 1);
  const users = new Set(sessions.map((session) => session.userHash ?? session.id)).size;
  const attention = sessions.length
    ? sessions.reduce((sum, session) => sum + (session.guardrails.attentionQuality ?? 0), 0) / sessions.length
    : 0;
  const outcomeLift = sessions.length
    ? sessions.reduce((sum, session) => sum + (session.guardrails.outcomeLift ?? 0), 0) / sessions.length
    : 0;
  const totalSeconds = sessions.reduce((sum, session) => sum + session.cost.seconds, 0);
  if (!finite(mean) || !finite(totalSeconds)) throw new Error("summary calculation overflowed");
  return {
    sessions: sessions.length,
    successRate: round(scores.filter((score) => score.achieved).length / Math.max(1, scores.length)),
    guardrailPassRate: round(scores.filter((score) => score.guardrailPass).length / Math.max(1, scores.length)),
    mean: round(mean),
    median: percentile(density, 0.5),
    p10: percentile(density, 0.1),
    p90: percentile(density, 0.9),
    ci90: bootstrapMeanCI(density),
    totalUserHours: round(totalSeconds / 3600),
    regretRate: round(sessions.filter((session) => session.guardrails.regret >= 0.5).length / Math.max(1, sessions.length)),
    outcomeRatingPoints: round(users * attention * outcomeLift),
  };
}

function groupSummary(
  sessions: ValueSession[],
  scores: SessionScore[],
  key: (session: ValueSession) => string,
): Record<string, SummaryStats> {
  const groups = new Map<string, { sessions: ValueSession[]; scores: SessionScore[] }>();
  for (const [index, session] of sessions.entries()) {
    const group = key(session);
    const members = groups.get(group) ?? { sessions: [], scores: [] };
    members.sessions.push(session);
    members.scores.push(scores[index]!);
    groups.set(group, members);
  }
  return Object.fromEntries(
    [...groups.entries()].sort(([a], [b]) => a === b ? 0 : a < b ? -1 : 1).map(([group, members]) =>
      [group, summarize(members.sessions, members.scores)]),
  );
}

export function compareVariants(
  byVariant: Record<string, SummaryStats>,
  control: string,
  treatment: string,
): VariantComparison {
  const base = byVariant[control];
  const next = byVariant[treatment];
  if (!base || !next) throw new Error(`comparison requires variants '${control}' and '${treatment}'`);
  const absoluteLift = next.mean - base.mean;
  return {
    control,
    treatment,
    controlMean: base.mean,
    treatmentMean: next.mean,
    absoluteLift: round(absoluteLift),
    relativeLift: base.mean === 0 ? null : round(absoluteLift / Math.abs(base.mean)),
    successRateLift: round(next.successRate - base.successRate),
    guardrailPassRateLift: round(next.guardrailPassRate - base.guardrailPassRate),
  };
}

export function analyzeSessions(
  sessions: ValueSession[],
  options: { weights?: ScoreWeights; source?: string; generatedAt?: string; comparisons?: Array<[string, string]> } = {},
): AnalysisArtifact {
  if (sessions.length === 0) throw new Error("at least one session is required");
  const suppliedWeights = Object.prototype.hasOwnProperty.call(options, "weights");
  const weights = suppliedWeights ? options.weights as ScoreWeights : DEFAULT_WEIGHTS;
  validateWeights(weights);
  if (options.source !== undefined && typeof options.source !== "string") throw new Error("source must be a string");
  if (options.generatedAt !== undefined && !isIsoDateTime(options.generatedAt)) {
    throw new Error("generatedAt must be an ISO-8601 date-time");
  }
  if (options.comparisons !== undefined && (!Array.isArray(options.comparisons) || options.comparisons.some((item) =>
    !Array.isArray(item) || item.length !== 2 || item.some((name) =>
      typeof name !== "string" || name.trim() === "" || hasUnsafeControl(name))))) {
    throw new Error("comparisons must contain pairs of non-empty labels without control characters");
  }
  const seenIds = new Set<string>();
  for (const session of sessions) {
    if (seenIds.has(session.id)) throw new Error(`duplicate session id '${session.id}'`);
    seenIds.add(session.id);
  }
  const scores = sessions.map((session) => scoreSession(session, weights));
  const byIntent = groupSummary(sessions, scores, (session) => session.intent);
  const byArchetype = groupSummary(sessions, scores, (session) => session.archetype);
  const byVariant = groupSummary(sessions, scores, (session) => session.variant ?? "unassigned");
  const comparisons = (options.comparisons ?? []).map(([control, treatment]) =>
    compareVariants(byVariant, control, treatment),
  );
  const warnings: string[] = [];
  if (sessions.length < 30) warnings.push("Small sample: treat intervals and lifts as directional, not causal evidence.");
  if (new Set(sessions.map((session) => session.intent)).size === 1) {
    warnings.push("Single-intent sample: do not generalize the score across product jobs.");
  }
  if (sessions.some((session) => session.userHash === undefined)) {
    warnings.push("Some sessions lack userHash; Outcome Rating Points use session ids as a reach proxy.");
  }
  const source = options.source ?? JSON.stringify(sessions);
  return {
    schemaVersion: ANALYSIS_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    formula: "net weighted outcomes / (time + friction + cognitive load + error cost), with archetype-specific models",
    weights: { ...weights },
    summary: summarize(sessions, scores),
    byIntent,
    byArchetype,
    byVariant,
    scores,
    comparisons,
    warnings,
  };
}

export function parseJsonLines(text: string): ValueSession[] {
  const sessions: ValueSession[] = [];
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      throw new Error(`line ${index + 1}: invalid JSON (${(error as Error).message})`);
    }
    const errors = validateSession(value);
    if (errors.length) throw new Error(`line ${index + 1}: ${errors.join("; ")}`);
    sessions.push(value as ValueSession);
  }
  if (sessions.length === 0) throw new Error("input contains no sessions");
  const seenIds = new Set<string>();
  for (const session of sessions) {
    if (seenIds.has(session.id)) throw new Error(`duplicate session id '${session.id}'`);
    seenIds.add(session.id);
  }
  return sessions;
}

export function createDemoSessions(): ValueSession[] {
  const sessions: ValueSession[] = [];
  const baseTime = Date.parse("2026-01-06T09:00:00Z");
  for (let index = 0; index < 16; index += 1) {
    const treatment = index >= 8;
    const slow = index % 4 === 0;
    sessions.push({
      schemaVersion: SESSION_SCHEMA,
      id: `transfer-${index + 1}`,
      timestamp: new Date(baseTime + index * 60_000).toISOString(),
      intent: "approve supplier invoice",
      archetype: "utility",
      variant: treatment ? "intent-first-ui" : "navigation-ui",
      userHash: `demo-user-${index % 6}`,
      outcome: {
        achieved: treatment || !slow,
        quality: treatment ? 0.96 : slow ? 0.45 : 0.78,
        weight: 0.9,
        value: 1,
      },
      cost: {
        seconds: treatment ? 54 + (index % 3) * 7 : 180 + (index % 4) * 35,
        friction: treatment ? 0.12 : slow ? 0.82 : 0.55,
        cognitiveLoad: treatment ? 0.18 : 0.57,
        errors: treatment ? 0 : slow ? 2 : 1,
      },
      guardrails: {
        satisfaction: treatment ? 0.9 : 0.55,
        regret: treatment ? 0.04 : slow ? 0.62 : 0.25,
        harm: 0,
        attentionQuality: treatment ? 0.88 : 0.66,
        outcomeLift: treatment ? 0.35 : 0.08,
      },
      tags: ["synthetic", "invoice-demo"],
    });
  }
  return sessions;
}
