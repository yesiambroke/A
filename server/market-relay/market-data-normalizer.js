/**
 * Market Data Normalizer
 * Converts Axiom format to standardized format for frontend consumption
 */

class MarketDataNormalizer {
  constructor() {
    this.solPrice = null;
  }

  setSolPrice(price) {
    this.solPrice = price;
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

    const marketCapSol = parsedUpdate.marketCapSol || 0;
    const marketCapUSD = this.solPrice ? marketCapSol * this.solPrice : null;
    
    // Calculate token age
    let ageMinutes = null;
    if (parsedUpdate.createdAt) {
      try {
        const createdAt = new Date(parsedUpdate.createdAt);
        const now = new Date();
        ageMinutes = (now - createdAt) / (1000 * 60);
      } catch (e) {
        // Invalid date
      }
    }

    // Calculate price from virtual reserves
    let priceSol = null;
    let priceUSD = null;
    if (parsedUpdate.virtualSolReserve != null && parsedUpdate.virtualTokenReserve != null && parsedUpdate.virtualTokenReserve > 0) {
      priceSol = parsedUpdate.virtualSolReserve / parsedUpdate.virtualTokenReserve;
      priceUSD = this.solPrice ? priceSol * this.solPrice : null;
    }

    return {
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

      // Market data
      marketCapSol: marketCapSol,
      marketCapUSD: marketCapUSD,
      volumeSol: parsedUpdate.volumeSol || 0,
      volumeUSD: this.solPrice ? (parsedUpdate.volumeSol || 0) * this.solPrice : null,
      priceSol: priceSol,
      priceUSD: priceUSD,
      
      // Token metrics
      age: ageMinutes,
      ageFormatted: this.formatAge(ageMinutes),
      holders: parsedUpdate.holdersCount || null,
      numHolders: parsedUpdate.holdersCount || null,
      top10HoldersPercent: parsedUpdate.top10HoldersPercent || null,
      devHoldsPercent: parsedUpdate.devHoldsPercent || null,
      snipersHoldPercent: parsedUpdate.snipersHoldPercent || null,
      bondingCurveProgress: parsedUpdate.bondingCurveProgress || null,
      
      // Timestamps
      createdAt: parsedUpdate.createdAt,
      updatedAt: new Date().toISOString(),
      
      // Category
      category: this.determineCategory(parsedUpdate),
      
      // Migration info - ensure we get it from parsedUpdate
      migratedFrom: parsedUpdate.migratedFrom || null,
      migratedTo: parsedUpdate.migratedTo || null, // Address where token migrated to
      
      // Debug: log if we have Pump AMM protocol or migration info
      // Status (determine based on protocol, bonding curve progress, and migration info)
      status: (() => {
        const status = this.determineStatus(
          parsedUpdate.bondingCurveProgress, 
          parsedUpdate.protocol, 
          parsedUpdate.migratedFrom,
          parsedUpdate.migratedTo
        );
        if (parsedUpdate.protocol === 'Pump AMM' || (parsedUpdate.protocol === 'Pump V1' && parsedUpdate.migratedTo)) {
          console.log(`🔍 determineStatus - protocol: ${parsedUpdate.protocol}, migratedFrom: ${parsedUpdate.migratedFrom || 'null'}, migratedTo: ${parsedUpdate.migratedTo || 'null'}, status: ${status}`);
        }
        return status;
      })()
    };
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
