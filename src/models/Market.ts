// ============================================================
// Market Model
// ============================================================
import { query, queryOne } from '../database/pool';
import { ResourceType, ListingStatus } from '../types';

export interface MarketListing {
  id: string;
  seller_id: string;
  item_name: string;
  resource_type: ResourceType | null;
  quantity: number;
  price_per_unit: number;
  total_price: number;
  status: ListingStatus;
  expires_at: Date;
  listed_at: Date;
}

export interface MarketTransaction {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  quantity: number;
  price_per_unit: number;
  total_cost: number;
  transacted_at: Date;
}

export interface CreateListingDto {
  sellerId: string;
  itemName: string;
  resourceType?: ResourceType;
  quantity: number;
  pricePerUnit: number;
}

export const MarketModel = {
  async findActiveListings(limit = 50, offset = 0): Promise<MarketListing[]> {
    return query<MarketListing>(
      `SELECT * FROM market_listings
       WHERE status = 'active' AND expires_at > NOW()
       ORDER BY listed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  },

  async findById(id: string): Promise<MarketListing | null> {
    return queryOne<MarketListing>(
      'SELECT * FROM market_listings WHERE id = $1',
      [id]
    );
  },

  async findByCountry(countryId: string): Promise<MarketListing[]> {
    return query<MarketListing>(
      `SELECT * FROM market_listings WHERE seller_id = $1 ORDER BY listed_at DESC`,
      [countryId]
    );
  },

  async createListing(dto: CreateListingDto): Promise<MarketListing> {
    const row = await queryOne<MarketListing>(
      `INSERT INTO market_listings (seller_id, item_name, resource_type, quantity, price_per_unit)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [dto.sellerId, dto.itemName, dto.resourceType ?? null, dto.quantity, dto.pricePerUnit]
    );
    if (!row) throw new Error('Failed to create listing');
    return row;
  },

  async updateStatus(id: string, status: ListingStatus): Promise<MarketListing | null> {
    return queryOne<MarketListing>(
      `UPDATE market_listings SET status = $2 WHERE id = $1 RETURNING *`,
      [id, status]
    );
  },

  async recordTransaction(data: Omit<MarketTransaction, 'id' | 'transacted_at'>): Promise<MarketTransaction> {
    const row = await queryOne<MarketTransaction>(
      `INSERT INTO market_transactions (listing_id, buyer_id, seller_id, quantity, price_per_unit, total_cost)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.listing_id, data.buyer_id, data.seller_id, data.quantity, data.price_per_unit, data.total_cost]
    );
    if (!row) throw new Error('Failed to record transaction');
    return row;
  },

  async getTransactionsByCountry(countryId: string): Promise<MarketTransaction[]> {
    return query<MarketTransaction>(
      `SELECT * FROM market_transactions WHERE buyer_id = $1 OR seller_id = $1 ORDER BY transacted_at DESC LIMIT 100`,
      [countryId]
    );
  },

  /** Dynamic price: base * (1 + scarcity_factor) */
  async getDynamicPrice(resourceType: ResourceType, basePrice: number): Promise<number> {
    const row = await queryOne<{ total_qty: string; listing_count: string }>(
      `SELECT COALESCE(SUM(quantity), 0) as total_qty, COUNT(*) as listing_count
       FROM market_listings
       WHERE resource_type = $1 AND status = 'active' AND expires_at > NOW()`,
      [resourceType]
    );
    const supply = parseFloat(row?.total_qty ?? '0');
    const listings = parseInt(row?.listing_count ?? '0', 10);
    // Less supply → higher multiplier (scarcity)
    const scarcityMultiplier = supply < 100 ? 1.5 : supply < 1000 ? 1.2 : 1.0;
    return Math.round(basePrice * scarcityMultiplier * 100) / 100;
  },

  async expireStaleListings(): Promise<number> {
    const rows = await query<{ id: string }>(
      `UPDATE market_listings SET status = 'expired'
       WHERE status = 'active' AND expires_at <= NOW()
       RETURNING id`
    );
    return rows.length;
  },
};
