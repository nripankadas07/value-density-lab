export const SESSION_SCHEMA = "value-density.session.v1" as const;
export const ANALYSIS_SCHEMA = "value-density.analysis.v1" as const;

export type Archetype = "general" | "utility" | "entertainment" | "education";

export interface OutcomeSignals {
  achieved: boolean;
  quality: number;
  weight: number;
  value?: number;
  knowledgeDelta?: number;
}

export interface CostSignals {
  seconds: number;
  friction: number;
  cognitiveLoad: number;
  errors: number;
  opportunityCost?: number;
}

export interface GuardrailSignals {
  satisfaction: number;
  regret: number;
  harm: number;
  fatigue?: number;
  drift?: number;
  retention?: number;
  flowSeconds?: number;
  meaningfulInteractions?: number;
  attentionQuality?: number;
  outcomeLift?: number;
}

export interface ValueSession {
  schemaVersion: typeof SESSION_SCHEMA;
  id: string;
  timestamp: string;
  intent: string;
  archetype: Archetype;
  outcome: OutcomeSignals;
  cost: CostSignals;
  guardrails: GuardrailSignals;
  variant?: string;
  userHash?: string;
  tags?: string[];
}

export interface ScoreWeights {
  satisfaction: number;
  friction: number;
  regret: number;
  harm: number;
  cognitiveLoad: number;
  error: number;
}

export interface SessionScore {
  id: string;
  intent: string;
  archetype: Archetype;
  variant: string;
  achieved: boolean;
  valueDensity: number;
  numerator: number;
  denominator: number;
  guardrailPass: boolean;
  components: Record<string, number>;
}

export interface SummaryStats {
  sessions: number;
  successRate: number;
  guardrailPassRate: number;
  mean: number;
  median: number;
  p10: number;
  p90: number;
  ci90: [number, number];
  totalUserHours: number;
  regretRate: number;
  outcomeRatingPoints: number;
}

export interface VariantComparison {
  control: string;
  treatment: string;
  controlMean: number;
  treatmentMean: number;
  absoluteLift: number;
  relativeLift: number | null;
  successRateLift: number;
  guardrailPassRateLift: number;
}

export interface AnalysisArtifact {
  schemaVersion: typeof ANALYSIS_SCHEMA;
  generatedAt: string;
  sourceSha256: string;
  formula: string;
  weights: ScoreWeights;
  summary: SummaryStats;
  byIntent: Record<string, SummaryStats>;
  byArchetype: Record<string, SummaryStats>;
  byVariant: Record<string, SummaryStats>;
  scores: SessionScore[];
  comparisons: VariantComparison[];
  warnings: string[];
}
