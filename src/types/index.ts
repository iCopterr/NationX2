// ============================================================
// NationX — Shared Types & Enums
// ============================================================

// ─── Resource ───────────────────────────────────────────────
export type ResourceType = 'metal' | 'energy' | 'food' | 'oil' | 'water' | 'rare_earth';

export interface ResourceAmount {
  type: ResourceType;
  amount: number;
}

// ─── Knowledge ──────────────────────────────────────────────
export type KnowledgeType = 'technology' | 'military' | 'engineering' | 'science' | 'economics' | 'medicine';

export interface KnowledgeRequirement {
  type: KnowledgeType;
  minLevel: number;
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
