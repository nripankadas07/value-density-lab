# Architecture

Value Density Lab separates collection, scoring, aggregation, and presentation so each layer can be audited.

1. An adapter emits one JSON object per intent-bearing session. The core never receives raw page content, prompts, or identity data.
2. Validation rejects missing fields, invalid timestamps, impossible probabilities, non-positive duration, and malformed JSON.
3. An archetype scorer implements the framework's distinct assumptions. Time is strongly anti-success in utility flows, contextual in entertainment, and meaningful only alongside mastery in education.
4. Aggregation groups the same scores by variant and archetype. A seeded non-parametric bootstrap gives a descriptive interval around the mean.
5. Reporters consume the versioned artifact. JSON is canonical evidence; Markdown and HTML are views.

The source ledger is SHA-256 hashed in the result. That detects accidental drift but is not a signature, proof of collection integrity, or identity guarantee.

## Trust boundary

JSONL is untrusted input. The engine bounds required signals, refuses non-finite numbers, attaches line numbers to parse failures, and escapes labels before HTML output. File paths remain explicit CLI arguments; the tool never scans a home directory or uploads a report.
