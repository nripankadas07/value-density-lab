import type { AnalysisArtifact, SummaryStats } from "./types.js";

const fmt = (value: number): string => Number.isFinite(value) ? value.toFixed(3) : "n/a";
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const neutralizeControls = (value: string): string => value.replace(/[\p{Cc}\p{Cf}]/gu, "�");
const escapeHtml = (value: string): string => neutralizeControls(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const escapeMarkdownInline = (value: string): string => neutralizeControls(value)
  .replace(/\s+/gu, " ")
  .trim()
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("|", "&#124;")
  .replaceAll("*", "&#42;")
  .replaceAll("_", "&#95;")
  .replaceAll("`", "&#96;")
  .replaceAll("[", "&#91;")
  .replaceAll("]", "&#93;");

function statRows(stats: SummaryStats): string {
  return [
    ["Sessions", String(stats.sessions)],
    ["Success", pct(stats.successRate)],
    ["Guardrail pass", pct(stats.guardrailPassRate)],
    ["Mean VD", fmt(stats.mean)],
    ["Median VD", fmt(stats.median)],
    ["P10 / P90", `${fmt(stats.p10)} / ${fmt(stats.p90)}`],
    ["90% bootstrap interval", `${fmt(stats.ci90[0])} – ${fmt(stats.ci90[1])}`],
    ["User hours", fmt(stats.totalUserHours)],
    ["Regret rate", pct(stats.regretRate)],
    ["Outcome Rating Points", fmt(stats.outcomeRatingPoints)],
  ].map(([key, value]) => `<tr><th>${key}</th><td>${value}</td></tr>`).join("");
}

export function renderMarkdown(artifact: AnalysisArtifact): string {
  const lines = [
    "# Value Density analysis",
    "",
    `- Sessions: **${artifact.summary.sessions}**`,
    `- Mean Value Density: **${fmt(artifact.summary.mean)}** (90% bootstrap interval ${fmt(artifact.summary.ci90[0])}–${fmt(artifact.summary.ci90[1])})`,
    `- Outcome success: **${pct(artifact.summary.successRate)}**`,
    `- Guardrail pass: **${pct(artifact.summary.guardrailPassRate)}**`,
    `- Regret rate: **${pct(artifact.summary.regretRate)}**`,
    "",
    "## Variants",
    "",
    "| Variant | Sessions | Mean VD | Success | Guardrail pass |",
    "|---|---:|---:|---:|---:|",
    ...Object.entries(artifact.byVariant).map(([name, stats]) =>
      `| ${escapeMarkdownInline(name)} | ${stats.sessions} | ${fmt(stats.mean)} | ${pct(stats.successRate)} | ${pct(stats.guardrailPassRate)} |`),
    "",
    "## Intents",
    "",
    "| Intent | Sessions | Mean VD | Success | Guardrail pass |",
    "|---|---:|---:|---:|---:|",
    ...Object.entries(artifact.byIntent).map(([name, stats]) =>
      `| ${escapeMarkdownInline(name)} | ${stats.sessions} | ${fmt(stats.mean)} | ${pct(stats.successRate)} | ${pct(stats.guardrailPassRate)} |`),
    "",
    "## Comparisons",
    "",
  ];
  if (artifact.comparisons.length === 0) lines.push("No control/treatment comparison requested.");
  for (const item of artifact.comparisons) {
    lines.push(`- **${escapeMarkdownInline(item.treatment)} vs ${escapeMarkdownInline(item.control)}:** ${fmt(item.absoluteLift)} absolute VD lift (${item.relativeLift === null ? "n/a" : pct(item.relativeLift)} relative).`);
  }
  lines.push("", "## Interpretation warnings", "", ...artifact.warnings.map((warning) => `- ${warning}`), "");
  return lines.join("\n");
}

export function renderHtml(artifact: AnalysisArtifact): string {
  const variants = Object.entries(artifact.byVariant).map(([name, stats]) => {
    const width = Math.min(100, Math.max(2, stats.mean / Math.max(artifact.summary.p90, 0.001) * 100));
    return `<section class="variant"><div class="variant-head"><strong>${escapeHtml(name)}</strong><span>${fmt(stats.mean)}</span></div><div class="bar"><i style="width:${width.toFixed(1)}%"></i></div><small>${stats.sessions} sessions · ${pct(stats.successRate)} success · ${pct(stats.guardrailPassRate)} guardrail pass</small></section>`;
  }).join("");
  const intents = Object.entries(artifact.byIntent).map(([name, stats]) =>
    `<tr><th>${escapeHtml(name)}</th><td>${stats.sessions}</td><td>${fmt(stats.mean)}</td><td>${pct(stats.successRate)}</td></tr>`).join("");
  const comparisons = artifact.comparisons.map((item) =>
    `<li><strong>${escapeHtml(item.treatment)}</strong> vs ${escapeHtml(item.control)}: ${fmt(item.absoluteLift)} absolute lift (${item.relativeLift === null ? "n/a" : pct(item.relativeLift)} relative)</li>`).join("");
  const warnings = artifact.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Value Density analysis</title><style>
:root{color-scheme:dark;--bg:#07111f;--panel:#0e1d30;--line:#203651;--text:#e8f0f8;--muted:#9fb0c4;--a:#58d6b9;--b:#ffcb6b}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 80% 0,#173155 0,transparent 42%),var(--bg);font:15px/1.55 ui-sans-serif,system-ui;color:var(--text)}main{max-width:980px;margin:auto;padding:56px 24px}h1{font-size:clamp(34px,7vw,68px);line-height:1;margin:0 0 12px;letter-spacing:-.04em}.eyebrow{color:var(--a);text-transform:uppercase;letter-spacing:.18em;font-weight:700}.lede{max-width:720px;color:var(--muted);font-size:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin:34px 0}.card{background:linear-gradient(145deg,#10243a,#0b1828);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 14px 40px #0004}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--line);padding:9px 0}td{text-align:right;color:var(--a);font-variant-numeric:tabular-nums}.variant{margin:20px 0}.variant-head{display:flex;justify-content:space-between}.bar{height:10px;background:#07111f;border-radius:20px;overflow:hidden;margin:8px 0}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--a),var(--b));border-radius:inherit}.warning{border-left:3px solid var(--b)}small,.meta{color:var(--muted)}code{color:var(--a)}footer{color:var(--muted);margin-top:40px;font-size:13px}</style></head>
<body><main><p class="eyebrow">Outcome analytics · local-first</p><h1>Value Density</h1><p class="lede">Outcomes achieved per unit of user cost. Time, friction, cognitive load, error, regret, and harm belong in the denominator or guardrails—not in a vanity engagement chart.</p>
<div class="grid"><section class="card"><h2>Portfolio signal</h2><table>${statRows(artifact.summary)}</table></section><section class="card"><h2>Variants</h2>${variants}</section></div>
<section class="card"><h2>Intent summaries</h2><table><thead><tr><th>Intent</th><th>Sessions</th><th>Mean VD</th><th>Success</th></tr></thead><tbody>${intents}</tbody></table></section>
<div class="grid"><section class="card"><h2>Comparisons</h2><ul>${comparisons || "<li>No control/treatment comparison requested.</li>"}</ul></section><section class="card warning"><h2>Read before deciding</h2><ul>${warnings || "<li>No automatic warnings.</li>"}</ul></section></div>
<footer>Schema <code>${artifact.schemaVersion}</code> · source SHA-256 <code>${artifact.sourceSha256.slice(0, 16)}…</code> · generated ${escapeHtml(artifact.generatedAt)}</footer></main></body></html>`;
}
