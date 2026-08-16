# Changelog

## 0.1.1 — 2026-08-16

- Require plain objects and own required properties for session roots and nested outcome, cost, and guardrail records; inherited prototype data can no longer satisfy the event schema.
- Bind `sourceSha256` to a canonical JSONL representation of the exact sessions analyzed and reject a supplied source ledger that canonicalizes to different sessions.
- Reject sparse/extended arrays and unknown analysis options.
- Narrow npm package contents to runtime output, documentation, examples, README, and license; add installed-tarball import/CLI smoke coverage.
- Publish complete report sets through component-verified staging, directory/target identity rechecks, per-file atomic renames, and set-level backup/rollback. Output-path and target-file symlinks are rejected before any artifact is replaced.
- Serialize cooperative artifact writers with a bounded fail-closed filesystem lock and reconcile rename-then-error outcomes by inode identity, preventing mixed concurrent bundles and restoring the full prior set after ambiguous failures.

Direct API callers relying on inherited fields, non-plain records, unrelated `source` bytes, or unknown analysis options must update from `0.1.0`.

## 0.1.0 — 2026-08-16

- Added versioned value-session and analysis schemas.
- Added general, utility, entertainment, and education scoring.
- Added variant comparison, deterministic bootstrap intervals, and ORP.
- Added JSON, Markdown, and standalone HTML output.
- Added synthetic invoice-flow demo and security/measurement documentation.
- Added strict timestamp/weight validation, duplicate-id rejection, finite-math overflow guards, and Markdown/HTML output neutralization.
- Added locale-independent ordering, per-intent summaries, strict CLI options, terminal-control rejection, and serialization-safe own-property weights.
