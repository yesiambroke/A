/**
 * Market Data Normalizer
 * Converts Axiom format to standardized format for frontend consumption
 */

class TokenRegistry {
  constructor() {
    this.tokens = new Map(); // tokenAddress -> tokenData
    this.categoryViews = new Map(); // category -> { tokens: [], sortKey, sortDir, filters }
    this.solPrice = null;
  }

  setSolPrice(price) {
    this.solPrice = price;
    // Recompute market caps for all tokens
    for (const [address, token] of this.tokens) {
      if (token.marketCapSol != null) {
        token.marketCapUSD = this.solPrice ? token.marketCapSol * this.solPrice : null;
      }
      if (token.volumeSol != null) {
        token.volumeUSD = this.solPrice ? token.volumeSol * this.solPrice : null;
      }
    }
  }

  addOrUpdate(token) {
    const existing = this.tokens.get(token.tokenAddress);
    if (existing) {
      // Merge updates
      Object.assign(existing, token);
    } else {
      this.tokens.set(token.tokenAddress, token);
    }
    this.invalidateCategoryViews();
  }

  get(tokenAddress) {
    return this.tokens.get(tokenAddress);
  }

  remove(tokenAddress) {
    this.tokens.delete(tokenAddress);
    this.invalidateCategoryViews();
  }

  /**
   * Sync registry with the latest snapshot pair addresses.
   * Removes tokens that have a screener-related status but are no longer in the snapshot.
   * @param {Set<string>} currentPairAddresses - Set of active pair addresses from the latest snapshot
   */
  syncPulseSnapshot(currentPairAddresses) {
    let removedCount = 0;
    for (const [address, token] of this.tokens) {
      // Only purge tokens that belong to the "Screener" categories
      const isScreenerToken = ['new', 'final_stretch', 'migrated'].includes(token.status);

      if (isScreenerToken && !currentPairAddresses.has(token.pairAddress)) {
        this.tokens.delete(address);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`🧹 Registry synchronized: removed ${removedCount} stale screener tokens`);
      this.invalidateCategoryViews();
    }
  }

  /**
   * Completely clear all tokens belonging to screener categories.
   * Used before applying a full snapshot to ensure a "fresh" list.
   */
  clearScreenerCategories() {
    let count = 0;
    const screenerStatuses = ['new', 'final_stretch', 'migrated'];
    for (const [address, token] of this.tokens) {
      if (screenerStatuses.includes(token.status)) {
        this.tokens.delete(address);
        count++;
      }
    }
    if (count > 0) {
      console.log(`🧹 Registry: cleared ${count} screener tokens for full refresh`);
      this.invalidateCategoryViews();
    }
  }

  getAll() {
    return Array.from(this.tokens.values());
  }

  invalidateCategoryViews() {
    // Mark views as stale - they'll be recomputed on next access
    for (const view of this.categoryViews.values()) {
      view.stale = true;
    }
  }

  getCategoryView(category, sortKey = 'recent', sortDir = 'desc', filters = {}) {
    const cacheKey = `${category}-${sortKey}-${sortDir}-${JSON.stringify(filters)}`;
    let view = this.categoryViews.get(cacheKey);

    if (!view || view.stale) {
      const tokens = this.getAll().filter(token => this.matchesCategory(token, category));
      const filtered = this.applyFilters(tokens, filters);
      const sorted = this.sortTokens(filtered, sortKey, sortDir);

      view = {
        tokens: sorted,
        sortKey,
        sortDir,
        filters,
        stale: false
      };
      this.categoryViews.set(cacheKey, view);
    }

    return view.tokens;
  }

  getTopCategoryTokens(category, limit = 50, sortKey = 'recent', sortDir = 'desc') {
    return this.getCategoryView(category, sortKey, sortDir).slice(0, limit);
  }

  matchesCategory(token, category) {
    switch (category) {
      case 'finalStretch':
        return token.status === 'final_stretch';
      case 'migrated':
        return token.status === 'migrated';
      case 'newMint':
        return token.status === 'new';
      default:
        return false;
    }
  }

  applyFilters(tokens, filters) {
    return tokens.filter(token => {
      if (filters.mc && token.marketCapUSD != null) {
        if (filters.mc.min != null && token.marketCapUSD < filters.mc.min) return false;
        if (filters.mc.max != null && token.marketCapUSD > filters.mc.max) return false;
      }
      if (filters.volume && token.volumeUSD != null) {
        if (filters.volume.min != null && token.volumeUSD < filters.volume.min) return false;
        if (filters.volume.max != null && token.volumeUSD > filters.volume.max) return false;
      }
      if (filters.holders && token.numHolders != null) {
        if (filters.holders.min != null && token.numHolders < filters.holders.min) return false;
        if (filters.holders.max != null && token.numHolders > filters.holders.max) return false;
      }
      return true;
    });
  }

  sortTokens(tokens, sortKey, sortDir) {
    const direction = sortDir === 'asc' ? 1 : -1;
    return [...tokens].sort((a, b) => {
      let aVal, bVal;
      switch (sortKey) {
        case 'recent':
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        case 'mc':
          aVal = a.marketCapUSD || 0;
          bVal = b.marketCapUSD || 0;
          break;
        case 'volume':
          aVal = a.volumeUSD || 0;
          bVal = b.volumeUSD || 0;
          break;
        case 'holders':
          aVal = a.numHolders || 0;
          bVal = b.numHolders || 0;
          break;
        default:
          return 0;
      }
      if (aVal === bVal) return 0;
      return aVal > bVal ? direction : -direction;
    });
  }
}

class MarketDataNormalizer {
  constructor() {
    this.solPrice = null;
    this.tokenRegistry = new TokenRegistry();
  }

  setSolPrice(price) {
    this.solPrice = price;
    this.tokenRegistry.setSolPrice(price);
  }

  /**
   * Normalize new token data from Axiom
   */
  normalizeNewToken(tokenData) {
    if (!tokenData) return null;

    const marketCapSol = tokenData.initial_liquidity_sol || 0;
    const marketCapUSD = this.solPrice ? marketCapSol * this.solPrice : null;

    // Calculate token age in minutes
    let ageMinutes = null;
    if (tokenData.created_at) {
      try {
        const createdAt = new Date(tokenData.created_at);
        const now = new Date();
        ageMinutes = (now - createdAt) / (1000 * 60);
      } catch (e) {
        // Invalid date
      }
    }

    return {
      // Basic info
      tokenAddress: tokenData.token_address,
      tokenName: tokenData.token_name,
      tokenTicker: tokenData.token_ticker,
      symbol: tokenData.token_ticker,
      name: tokenData.token_name,
      imageUrl: tokenData.image_url,
      pairAddress: tokenData.pump_swap_pool || tokenData.bonding_curve || tokenData.pair_address || null,
      protocol: tokenData.protocol,
      creator: tokenData.creator,
      twitter: tokenData.twitter,

      // Market data
      marketCapSol: marketCapSol,
      marketCapUSD: marketCapUSD,
      volumeSol: tokenData.initial_liquidity_sol || 0,
      volumeUSD: this.solPrice ? (tokenData.initial_liquidity_sol || 0) * this.solPrice : null,

      // Token metrics
      age: ageMinutes,
      ageFormatted: this.formatAge(ageMinutes),
      holders: tokenData.holders_count || null,
      numHolders: tokenData.holders_count || null,
      top10HoldersPercent: tokenData.top_10_holders || null,
      devHoldsPercent: tokenData.dev_holds_percent || null,
      snipersHoldPercent: tokenData.snipers_hold_percent || null,

      // Timestamps
      createdAt: tokenData.created_at,
      receivedAt: new Date().toISOString(),

      // Category (for coin screener)
      category: this.determineCategory(tokenData),

      // Migration info (new tokens don't have this yet)
      migratedFrom: null,
      migratedTo: null,

      // Status (determine based on protocol and bonding curve progress)
      status: this.determineStatus(null, tokenData.protocol, null, null) // new tokens don't have bonding curve progress yet
    };
  }

  /**
   * Normalize trending token data from Axiom REST API or WebSocket
   */
  normalizeTrendingTokens(trendingData) {
    if (!Array.isArray(trendingData)) return [];

    return trendingData.map(token => {
      // Handle both old REST API format and new WebSocket format
      const marketCapSol = token.marketCapSol || 0;
      const marketCapUSD = this.solPrice ? marketCapSol * this.solPrice : null;
      const volumeSol = token.volumeSol || 0;
      const volumeUSD = this.solPrice ? volumeSol * this.solPrice : null;

      // Calculate token age
      let ageMinutes = null;
      if (token.createdAt) {
        try {
          const createdAt = new Date(token.createdAt);
          const now = new Date();
          ageMinutes = (now - createdAt) / (1000 * 60);
        } catch (e) {
          // Invalid date
        }
      }

      return {
        // Basic info
        tokenAddress: token.tokenAddress,
        tokenName: token.tokenName,
        tokenTicker: token.tokenTicker,
        symbol: token.tokenTicker,
        name: token.tokenName,
        imageUrl: token.tokenImage,
        protocol: token.protocol,
        creator: token.protocolDetails?.creator || null,
        twitter: token.twitter,

        // Market data
        marketCapSol: marketCapSol,
        marketCapUSD: marketCapUSD,
        volumeSol: volumeSol,
        volumeUSD: volumeUSD,

        // Price data (rich API format)
        priceSol: token.priceSol || null,
        price1minChange: token.price1minChange || null,
        price5minChange: token.price5minChange || null,
        price30minChange: token.price30minChange || null,
        price1hrChange: token.price1hrChange || null,

        // Chart data (from WebSocket marketCapChartData or REST API pairRecentData) - limit to last 10 points for performance
        marketCapChartData: token.marketCapChartData ? token.marketCapChartData.slice(-10).map(point => ({
          time: point.time,
          value: point.value
        })) : token.pairRecentData ? token.pairRecentData.slice(-10).map(point => ({
          time: point.time,
          value: point.value
        })) : null,

        // Token metrics
        age: ageMinutes,
        ageFormatted: this.formatAge(ageMinutes),
        holders: token.numHolders || token.top10Holders || null,
        bondingCurveProgress: token.bondingCurvePercent || null,

        // Additional rich data from API
        numHolders: token.numHolders || null,
        transactionCount: (token.buyCount || 0) + (token.sellCount || 0),
        devHoldsPercent: token.devHoldsPercent || null,
        snipersHoldPercent: token.snipersHoldPercent || null,
        insidersHoldPercent: token.insidersHoldPercent || null,
        bundlersHoldPercent: token.bundlersHoldPercent || null,
        top10HoldersPercent: token.top10HoldersPercent || null,

        // Protocol details
        protocolDetails: token.protocolDetails || null,

        // Timestamps
        createdAt: token.createdAt,
        updatedAt: new Date().toISOString(),

        // Category
        category: this.determineCategory(token),

        // Migration info
        migratedFrom: token.extra?.migratedFrom || null,
        migratedTo: null,

        // Status (determine based on protocol and data)
        status: this.determineStatus(token.bondingCurvePercent, token.protocol, token.extra?.migratedFrom || null, null)
      };
    });
  }

  /**
   * Normalize token update data from Axiom
   */
  normalizeTokenUpdate(parsedUpdate) {
    if (!parsedUpdate) return null;

    const result = {
      // Basic info
      tokenAddress: parsedUpdate.tokenAddress,
      tokenName: parsedUpdate.tokenName,
      tokenTicker: parsedUpdate.tokenTicker,
      symbol: parsedUpdate.tokenTicker,
      name: parsedUpdate.tokenName,
      imageUrl: parsedUpdate.imageUrl,
      pairAddress: parsedUpdate.pairAddress || null,
      protocol: parsedUpdate.protocol,
      creator: parsedUpdate.creator,
      twitter: parsedUpdate.twitter,
      updatedAt: new Date().toISOString(),
      createdAt: parsedUpdate.createdAt,
      category: this.determineCategory(parsedUpdate),
      migratedFrom: parsedUpdate.migratedFrom || null,
      migratedTo: parsedUpdate.migratedTo || null
    };

    const existing = this.tokenRegistry.get(parsedUpdate.tokenAddress);
    const isNew = !existing;

    // Only include metrics if they are explicitly present OR if it's a new token
    if (parsedUpdate.marketCapSol !== undefined && parsedUpdate.marketCapSol !== null) {
      result.marketCapSol = parsedUpdate.marketCapSol;
      if (this.solPrice) result.marketCapUSD = parsedUpdate.marketCapSol * this.solPrice;
    } else if (isNew) {
      result.marketCapSol = 0; // Default for new tokens if not provided
    }

    if (parsedUpdate.volumeSol !== undefined && parsedUpdate.volumeSol !== null) {
      result.volumeSol = parsedUpdate.volumeSol;
      if (this.solPrice) result.volumeUSD = parsedUpdate.volumeSol * this.solPrice;
    } else if (isNew) {
      result.volumeSol = 0;
    }

    if (parsedUpdate.virtualSolReserve != null && parsedUpdate.virtualTokenReserve != null && parsedUpdate.virtualTokenReserve > 0) {
      const priceSol = parsedUpdate.virtualSolReserve / parsedUpdate.virtualTokenReserve;
      result.priceSol = priceSol;
      if (this.solPrice) result.priceUSD = priceSol * this.solPrice;
    }

    if (parsedUpdate.holdersCount !== undefined && parsedUpdate.holdersCount !== null) {
      result.holders = parsedUpdate.holdersCount;
      result.numHolders = parsedUpdate.holdersCount;
    }

    if (parsedUpdate.top10HoldersPercent !== undefined) result.top10HoldersPercent = parsedUpdate.top10HoldersPercent;
    if (parsedUpdate.devHoldsPercent !== undefined) result.devHoldsPercent = parsedUpdate.devHoldsPercent;
    if (parsedUpdate.snipersHoldPercent !== undefined) result.snipersHoldPercent = parsedUpdate.snipersHoldPercent;
    if (parsedUpdate.bondingCurveProgress !== undefined) result.bondingCurveProgress = parsedUpdate.bondingCurveProgress;

    // Calculate age
    if (parsedUpdate.createdAt) {
      const createdAtDate = new Date(parsedUpdate.createdAt);
      const ageMinutes = (Date.now() - createdAtDate) / (1000 * 60);
      result.age = ageMinutes;
      result.ageFormatted = this.formatAge(ageMinutes);
    }

    // Status
    result.status = this.determineStatus(
      result.bondingCurveProgress !== undefined ? result.bondingCurveProgress : null,
      result.protocol,
      result.migratedFrom,
      result.migratedTo
    );

    return result;
  }

  /**
   * Normalize Pulse v2 delta updates using base snapshot metadata.
   */
  normalizePulseV2Update(delta, base) {
    if (!delta || typeof delta !== 'object') return null;
    const { tokenKey, updates } = delta;
    if (!tokenKey || !updates) return null;

    const pairAddress = base?.pairAddress || tokenKey;
    const tokenAddress = base?.tokenAddress || pairAddress;
    const tokenName = base?.tokenName || '';
    const tokenTicker = base?.tokenTicker || '';
    const createdAt = base?.createdAt || null;

    const result = {
      tokenAddress,
      tokenName,
      tokenTicker,
      symbol: tokenTicker,
      name: tokenName,
      imageUrl: base?.imageUrl || null,
      protocol: base?.protocol || null,
      pairAddress,
      updatedAt: new Date().toISOString(),
      status: base?.status || 'new'
    };

    const existing = this.tokenRegistry.get(tokenAddress);
    const isNew = !existing;

    // Include metrics if present in delta, OR fallback to base for newly discovered tokens
    if (updates[19] !== undefined) {
      result.marketCapSol = updates[19];
      if (this.solPrice) result.marketCapUSD = updates[19] * this.solPrice;
    } else if (isNew && base?.marketCapSol !== undefined) {
      result.marketCapSol = base.marketCapSol;
      if (this.solPrice) result.marketCapUSD = base.marketCapSol * this.solPrice;
    } else if (isNew) {
      result.marketCapSol = 0;
    }

    if (updates[18] !== undefined) {
      result.volumeSol = updates[18];
      if (this.solPrice) result.volumeUSD = updates[18] * this.solPrice;
    } else if (isNew && base?.volumeSol !== undefined) {
      result.volumeSol = base.volumeSol;
      if (this.solPrice) result.volumeUSD = base.volumeSol * this.solPrice;
    } else if (isNew) {
      result.volumeSol = 0;
    }

    if (updates[26] !== undefined) {
      result.bondingCurveProgress = updates[26];
    } else if (isNew && base?.bondingCurveProgress !== undefined) {
      result.bondingCurveProgress = base.bondingCurveProgress;
    }

    if (updates[20] !== undefined) result.totalFeesSol = updates[20];
    if (updates[23] !== undefined) result.txCount = updates[23];
    if (updates[24] !== undefined) result.buyCount = updates[24];
    if (updates[25] !== undefined) result.sellCount = updates[25];

    if (updates[28] !== undefined) {
      result.holders = updates[28];
      result.numHolders = updates[28];
    } else if (isNew && (base?.holders !== undefined || base?.numHolders !== undefined)) {
      result.holders = base.holders || base.numHolders;
      result.numHolders = base.numHolders || base.holders;
    }

    // Include static metadata fallbacks
    if (base?.website) result.website = base.website;
    if (base?.twitter) result.twitter = base.twitter;
    if (base?.telegram) result.telegram = base.telegram;
    if (base?.protocolDetails) result.protocolDetails = base.protocolDetails;
    if (base?.migratedFrom) result.migratedFrom = base.migratedFrom;
    if (base?.migratedTo) result.migratedTo = base.migratedTo;

    if (createdAt) {
      result.createdAt = createdAt;
      result.age = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60);
      result.ageFormatted = this.formatAge(result.age);
    }

    return result;
  }

  /**
   * Determine token category based on data
   */
  determineCategory(tokenData) {
    // This can be enhanced with more sophisticated logic
    if (tokenData.protocol === 'Pump V1') {
      return 'pumpfun';
    }
    return 'unknown';
  }

  /**
   * Determine token status based on protocol, bonding curve progress, and migration info
   * Final Stretch: Still on pump_v1 (protocol === 'Pump V1' AND bondingCurveProgress < 100)
   * Migrated: 
   *   - Option 1: protocol === 'Pump AMM' AND migratedFrom === 'Pump V1' (already migrated)
   *   - Option 2: protocol === 'Pump V1' AND bondingCurveProgress === 100 AND migratedTo exists (just migrated)
   * 
   * IMPORTANT: Only show migrated coins that originated from Pump V1
   */
  determineStatus(bondingCurveProgress, protocol, migratedFrom, migratedTo) {
    // Normalize migratedFrom for comparison
    const normalizedMigratedFrom = migratedFrom && typeof migratedFrom === 'string'
      ? migratedFrom.trim()
      : null;

    // PRIMARY CASE: If migratedFrom === 'Pump V1', it's migrated (regardless of current protocol)
    // This is the main indicator - if a token has migratedFrom: "Pump V1", it means it originated from Pump V1
    if (normalizedMigratedFrom === 'Pump V1') {
      //console.log(`✅ Migrated token detected (has migratedFrom: Pump V1): protocol=${protocol}, migratedFrom=${normalizedMigratedFrom}, migratedTo=${migratedTo || 'null'}`);
      return 'migrated';
    }

    // SECONDARY CASE: Pump AMM protocol (should also have migratedFrom, but check anyway)
    if (protocol === 'Pump AMM') {
      if (normalizedMigratedFrom === 'Pump V1') {
        // Already handled above, but log for clarity
        //console.log(`✅ Migrated token (Pump AMM from Pump V1): protocol=${protocol}, migratedFrom=${normalizedMigratedFrom}`);
        return 'migrated';
      } else {
        //console.log(`⚠️  Pump AMM token but not migrated from Pump V1: migratedFrom=${normalizedMigratedFrom || 'null'}, protocol=${protocol}`);
      }
    }

    // TERTIARY CASE: Pump V1 with migratedTo (bonding curve completed and migrated)
    if (protocol === 'Pump V1' &&
      bondingCurveProgress !== null &&
      bondingCurveProgress >= 100 &&
      migratedTo) {
      //console.log(`✅ Migrated token detected (Pump V1 with migratedTo): protocol=${protocol}, bondingCurveProgress=${bondingCurveProgress}, migratedTo=${migratedTo}`);
      return 'migrated';
    }

    // If bonding curve progress is 100% or more AND still on Pump V1, check if it has migratedTo
    // If no migratedTo, it's still in final stretch (about to migrate)
    if (bondingCurveProgress !== null && bondingCurveProgress !== undefined && bondingCurveProgress >= 100) {
      if (protocol === 'Pump V1') {
        // If it has migratedTo, it's already migrated (handled by Option 2 above)
        // If no migratedTo, it's still in final stretch
        if (!migratedTo) {
          return 'final_stretch';
        }
      }
    }

    // If still on Pump V1 and bonding curve progress < 100, it's final stretch
    if (protocol === 'Pump V1' && bondingCurveProgress !== null && bondingCurveProgress !== undefined && bondingCurveProgress < 100) {
      return 'final_stretch';
    }

    // Default to new/trending (we'll filter these out)
    // This includes:
    // - Pump AMM tokens that didn't come from Pump V1 (e.g., from Virtual Curve, Meteora, etc.)
    // - Other protocols (Raydium, Meteora, etc.)
    return 'new';
  }

  /**
   * Format age with proper units (M/D/H/m)
   */
  formatAge(ageMinutes) {
    if (ageMinutes === null || ageMinutes === undefined) return 'N/A';

    const months = Math.floor(ageMinutes / (60 * 24 * 30));
    if (months > 0) return `${months}M`;

    const days = Math.floor(ageMinutes / (60 * 24));
    if (days > 0) return `${days}D`;

    const hours = Math.floor(ageMinutes / 60);
    if (hours > 0) return `${hours}H`;

    return `${Math.floor(ageMinutes)}m`;
  }

  /**
   * Format market cap for display with K/M/B
   */
  formatMarketCap(marketCapUSD) {
    if (!marketCapUSD) return 'N/A';

    if (marketCapUSD >= 1000000000) {
      return `$${(marketCapUSD / 1000000000).toFixed(2)}B`;
    } else if (marketCapUSD >= 1000000) {
      return `$${(marketCapUSD / 1000000).toFixed(1)}M`;
    } else if (marketCapUSD >= 1000) {
      return `$${(marketCapUSD / 1000).toFixed(0)}K`;
    } else {
      return `$${marketCapUSD.toFixed(0)}`;
    }
  }

  /**
   * Format volume for display
   */
  formatVolume(volumeSol) {
    if (!volumeSol) return '0 SOL';
    return `${volumeSol.toFixed(2)} SOL`;
  }
}

module.exports = MarketDataNormalizer;
