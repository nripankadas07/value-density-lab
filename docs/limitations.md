# Limitations

- Intent, quality, friction, cognitive load, and regret are constructs, not facts automatically present in telemetry. Poor operational definitions create precise-looking nonsense.
- The four scoring models are not on a universal common scale. Compare cohorts only when the archetype, schema, weights, and collection process match.
- Bootstrap intervals quantify sampling variability in the supplied ledger. They do not correct selection bias, interference, novelty effects, or confounding.
- `userHash` supports an approximate reach calculation. It must be privacy-reviewed and rotated; this project provides no consent or identity system.
- SHA-256 proves that a report refers to specific bytes. It does not prove the events were observed, complete, or untampered before collection.
- The demo is synthetic and designed to exercise code paths. It is not evidence that intent-first UI has a particular real-world effect.
