// ============================================================
// NationX — Shared Types & Enums
// ============================================================

// ─── Resource ───────────────────────────────────────────────
// Core types. Add new resource types here to expand the system.
export type ResourceType =
  | 'metal'
  | 'energy'
  | 'food'
  // Expansion slots:
  | 'oil'
  | 'water'
  | 'rare_earth';

export interface ResourceAmount {
  type: ResourceType;
  amount: number;
}

/** Per-type static config — drives production/consumption/exploration */
export interface ResourceConfig {
  label: string;
  description: string;
  /** Default storage capacity */
  defaultCapacity: number;
  /** Base units produced per tick (before modifiers) */
  baseProduction: number;
  /** Base units consumed per tick (before modifiers) */
  baseConsumption: number;
  /** Which knowledge type boosts this resource's production */
  knowledgeBoost?: string;
  /** Exploration base yield as fraction of investment money */
  exploreBaseYieldPct: number;
  /** Happiness penalty per tick when in deficit */
  deficitHappinessPenalty: number;
}

/** Returned by produceResource / consumeResource / exploreResource */
export interface ProduceResult {
  type: ResourceType;
  produced: number;
  amountBefore: number;
  amountAfter: number;
  infrastructureBonus: number;
}

export interface ConsumeResult {
  type: ResourceType;
  requested: number;
  consumed: number;          // actually deducted (may be < requested if in deficit)
  deficit: number;           // shortage amount
  inDeficit: boolean;
  happinessPenalty: number;
}

export type ExploreOutcome = 'jackpot' | 'success' | 'partial' | 'failure' | 'dry';

export interface ExploreResult {
  type: ResourceType;
  outcome: ExploreOutcome;
  investment: number;
  discovered: number;
  amountAfter: number;
  riskRoll: number;          // 0-100, for transparency
  message: string;
}


// ─── Knowledge ──────────────────────────────────────────────
// Core types (Phase 2). Add new types here to expand the system.
export type KnowledgeType =
  | 'technology'
  | 'military'
  | 'engineering'
  | 'science'
  // Expansion slots — add more types below:
  | 'economics'
  | 'medicine';

export interface KnowledgeRequirement {
  type: KnowledgeType;
  minLevel: number;
}

/** Snapshot of one knowledge domain for a country */
export interface KnowledgeLevel {
  type: KnowledgeType;
  level: number;
  xp: number;
  xpToNextLevel: number;
  maxLevel: number;
  progressPct: number; // 0–100
}

/** Result returned by addKnowledge */
export interface AddKnowledgeResult {
  type: KnowledgeType;
  amountAdded: number;
  levelBefore: number;
  levelAfter: number;
  levelsGained: number;
  xpNow: number;
  xpToNextLevel: number;
}

// ─── Policy ─────────────────────────────────────────────────
export type PolicySector = 'education' | 'military' | 'technology' | 'economy' | 'healthcare' | 'infrastructure';

export type PolicyEffect = {
  sector: PolicySector;
  multiplier: number;
};

// ─── Market ─────────────────────────────────────────────────
export type ListingStatus = 'active' | 'sold' | 'cancelled' | 'expired';

// ─── Events ─────────────────────────────────────────────────
export type EventType = 'flood' | 'war' | 'recession' | 'pandemic' | 'revolution' | 'trade_boom' | 'technological_breakthrough';
export type EventSeverity = 'low' | 'medium' | 'high' | 'catastrophic';
export type EventStatus = 'active' | 'resolved' | 'expired';

// ─── Production ─────────────────────────────────────────────
export type ProductionStatus = 'idle' | 'producing' | 'paused' | 'completed';

// ─── Economy ────────────────────────────────────────────────
export interface EconomyStats {
  gdp: number;
  taxRevenue: number;
  totalExpenditure: number;
  balance: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  happinessIndex: number;
}

// ─── API ────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  [key: string]: unknown; // allow extra fields like total, page, limit
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// ─── Auth ───────────────────────────────────────────────────
export interface JwtPayload {
  userId: string;
  countryId: string;
  iat?: number;
  exp?: number;
}
