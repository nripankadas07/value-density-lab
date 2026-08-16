# Measurement model

The general framework is:

```text
Value Density = Net weighted outcomes / User cost
```

The reference engine models net value as achieved outcome quality plus satisfaction, minus friction, regret, and harm. The denominator combines elapsed minutes, cognitive load, and error cost. Utility, entertainment, and education use the domain-specific forms described in the source article.

## Collection rules

- Define an intent taxonomy before instrumenting.
- Measure outcome quality independently from elapsed time.
- Use rotating pseudonyms if reach is needed; never place email or a stable personal identifier in `userHash`.
- Calibrate friction, cognitive load, regret, and harm with mixed qualitative and behavioral evidence.
- Version weights and compare only like-for-like windows.
- Pre-register experiment decisions; observational reports are descriptive.

## Anti-gaming

A team cannot raise Value Density safely by shrinking time alone. Failed outcomes lower the numerator, while regret and harm fail guardrails. Report the component metrics with the composite so a local improvement cannot hide a safety regression.
