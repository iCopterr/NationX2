// ============================================================
// Market Service
// ============================================================
import { MarketModel, CreateListingDto } from '../models/Market';
import { CountryModel } from '../models/Country';
import { ResourceModel } from '../models/Resource';
import { ResourceType } from '../types';

export const MarketService = {
  async getListings(limit = 50, offset = 0) {
    return MarketModel.findActiveListings(limit, offset);
  },

  async getMyListings(countryId: string) {
    return MarketModel.findByCountry(countryId);
  },

  async getTransactionHistory(countryId: string) {
    return MarketModel.getTransactionsByCountry(countryId);
  },

  /**
   * List a resource for sale.
   * Deducts from seller's resources immediately (escrow model).
   */
  async listItem(countryId: string, dto: Omit<CreateListingDto, 'sellerId'>) {
    if (dto.pricePerUnit <= 0) throw new Error('Price must be positive');
    if (dto.quantity <= 0) throw new Error('Quantity must be positive');

    if (dto.resourceType) {
      // Deduct from inventory (escrow)
      const has = await ResourceModel.hasSufficient(countryId, dto.resourceType, dto.quantity);
      if (!has) throw new Error(`Insufficient ${dto.resourceType}`);
      await ResourceModel.adjust(countryId, dto.resourceType, -dto.quantity, 'trade');
    }

    return MarketModel.createListing({ ...dto, sellerId: countryId });
  },

  /**
   * Buy a listing.
   * Transfers money and resources atomically.
   */
  async buyItem(buyerCountryId: string, listingId: string) {
    const listing = await MarketModel.findById(listingId);
    if (!listing) throw new Error('Listing not found');
    if (listing.status !== 'active') throw new Error('Listing is no longer available');
    if (listing.seller_id === buyerCountryId) throw new Error('Cannot buy your own listing');

    const totalCost = Number(listing.total_price);
    const buyer = await CountryModel.findById(buyerCountryId);
    if (!buyer) throw new Error('Buyer not found');
    if (buyer.money < totalCost) throw new Error(`Insufficient funds (need ${totalCost}, have ${buyer.money})`);

    // 1. Deduct buyer money
    await CountryModel.updateMoney(buyerCountryId, -totalCost);

    // 2. Credit seller money (10% market tax retained by "government")
    const marketTax = totalCost * 0.1;
    await CountryModel.updateMoney(listing.seller_id, totalCost - marketTax);

    // 3. Transfer resource to buyer
    if (listing.resource_type) {
      await ResourceModel.ensureExists(buyerCountryId, listing.resource_type as ResourceType);
      await ResourceModel.adjust(buyerCountryId, listing.resource_type as ResourceType, Number(listing.quantity), 'trade');
    }

    // 4. Mark listing sold
    await MarketModel.updateStatus(listingId, 'sold');

    // 5. Record transaction
    const transaction = await MarketModel.recordTransaction({
      listing_id: listingId,
      buyer_id: buyerCountryId,
      seller_id: listing.seller_id,
      quantity: Number(listing.quantity),
      price_per_unit: Number(listing.price_per_unit),
      total_cost: totalCost,
    });

    return { listing, transaction, marketTax };
  },

  /** Cancel a listing — return resources to seller */
  async cancelListing(countryId: string, listingId: string) {
    const listing = await MarketModel.findById(listingId);
    if (!listing) throw new Error('Listing not found');
    if (listing.seller_id !== countryId) throw new Error('Not your listing');
    if (listing.status !== 'active') throw new Error('Listing already closed');

    await MarketModel.updateStatus(listingId, 'cancelled');

    // Refund resource
    if (listing.resource_type) {
      await ResourceModel.ensureExists(countryId, listing.resource_type as ResourceType);
      await ResourceModel.adjust(countryId, listing.resource_type as ResourceType, Number(listing.quantity), 'trade');
    }

    return listing;
  },

  async getDynamicPrice(resourceType: ResourceType, basePrice: number) {
    return MarketModel.getDynamicPrice(resourceType, basePrice);
  },

  /** Cleanup task — expire stale listings */
  async cleanupExpired() {
    return MarketModel.expireStaleListings();
  },
};
