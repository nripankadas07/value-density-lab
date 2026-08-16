# Value Density analysis

- Sessions: **16**
- Mean Value Density: **0.501** (90% bootstrap interval 0.354–0.665)
- Outcome success: **87.5%**
- Guardrail pass: **87.5%**
- Regret rate: **12.5%**

## Variants

| Variant | Sessions | Mean VD | Success | Guardrail pass |
|---|---:|---:|---:|---:|
| intent-first-ui | 8 | 0.877 | 100.0% | 100.0% |
| navigation-ui | 8 | 0.125 | 75.0% | 75.0% |

## Intents

| Intent | Sessions | Mean VD | Success | Guardrail pass |
|---|---:|---:|---:|---:|
| approve supplier invoice | 16 | 0.501 | 87.5% | 87.5% |

## Comparisons

- **intent-first-ui vs navigation-ui:** 0.752 absolute VD lift (601.4% relative).

## Interpretation warnings

- Small sample: treat intervals and lifts as directional, not causal evidence.
- Single-intent sample: do not generalize the score across product jobs.
