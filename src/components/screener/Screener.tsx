'use client';

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { useMarketData } from '@/hooks/useMarketData';
import { FavoritesWidget, type FavoriteWidgetCoin } from '@/components/shared/favorites-widget';

// Custom Icons Component
const CustomIcons = {
  // Coin icons for trending section
  coinIcons: [
    <svg key="1" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    <svg key="2" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>,
    <svg key="3" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M9 9h6M9 12h6M9 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    <svg key="4" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>,
    <svg key="5" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    <svg key="6" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
      <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2"/>
    </svg>,
    <svg key="7" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
      <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="2"/>
      <line x1="2" y1="8.5" x2="22" y2="15.5" stroke="currentColor" strokeWidth="2"/>
    </svg>,
    <svg key="8" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
      <rect x="8" y="8" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2"/>
    </svg>,
    <svg key="9" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>,
    <svg key="10" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>,
    <svg key="11" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" fill="currentColor"/>
    </svg>,
    <svg key="12" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M4 12h16M4 12l4-4M4 12l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 12l-4-4M20 12l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>,
    <svg key="13" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 6V4M12 20v-2M6 12H4M20 12h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M18.364 5.636l-1.414 1.414M7.05 16.95l-1.414 1.414M18.364 18.364l-1.414-1.414M7.05 7.05l-1.414-1.414" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    <svg key="14" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M12 2v6l4 2-4 2v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="14" r="2" stroke="currentColor" strokeWidth="2"/>
    </svg>,
    <svg key="15" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>,
    <svg key="16" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
    </svg>,
    <svg key="17" viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M2 12h20M12 2v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ],

  // Section header icons
  trending: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M4 16l5-5 4 4 7-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 6h4v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  newMint: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 7v10M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 8l2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),

  finalStretch: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M6 4v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 5h9l-3 3 3 3H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),

  migrated: (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <rect x="3" y="6" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
      <rect x="14" y="13" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="2"/>
      <path d="M10 8h6l-2-2m2 6-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 16H8l2 2m-2-6 2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  // Metric icons
  liquidity: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  buy: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M7 13l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  sell: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M17 11l-3-3-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  burn: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  mayhem: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  paid: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
      <line x1="6" y1="9" x2="6" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="9" x2="10" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <line x1="14" y1="9" x2="14" y2="9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),

  dev: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M14.7 6.3a1 1 0 0 0-1.4 1.4l1.6 1.6a1 1 0 0 0 1.4-1.4l-1.6-1.6zM9.3 17.7a1 1 0 0 0 1.4-1.4l-1.6-1.6a1 1 0 0 0-1.4 1.4l1.6 1.6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 2v6l4 2-4 2v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  sniper: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),

  insider: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),

  bundler: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
      <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),

  top10: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <circle cx="12" cy="8" r="7" stroke="currentColor" strokeWidth="2"/>
      <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  holders: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="2"/>
      <circle cx="16" cy="10" r="3" stroke="currentColor" strokeWidth="2"/>
      <path d="M3 18c0-2.5 2.5-4 5-4h4.5c2.5 0 5 1.5 5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),

  check: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  transactions: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M4 4v16l16-8L4 4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  star: (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.1L12 17.8 6.5 20l1-6.1-4.5-4.4 6.2-.9L12 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),

  starFilled: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 2.5l2.9 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.9l-5.8 3.2 1.1-6.4-4.6-4.5 6.4-.9L12 2.5z"/>
    </svg>
  )
};

type OperatorProps = {
  userId: number;
  tier: string;
  is2faEnabled: boolean;
};

type ScreenerProps = {
  operator: OperatorProps | null;
};

type NormalizedToken = {
  tokenAddress: string;
  tokenName: string;
  tokenTicker: string;
  protocol?: string;
  protocolDetails?: { isMayhem?: boolean } | null;
  migratedFrom?: string | null;
  migratedTo?: string | null;
  tokenImage?: string;
  imageUrl?: string;
  createdAt?: string;
  top10Holders?: number;
  marketCapPercentChange?: number;
  liquiditySol?: number;
  buyCount?: number;
  sellCount?: number;
  lpBurned?: number;
  dexPaid?: boolean;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  // Rich data from Axiom
  price1minChange?: number | null;
  price5minChange?: number | null;
  price30minChange?: number | null;
  price1hrChange?: number | null;
  marketCapChartData?: Array<{ time: number; value: number }> | null;
  // Additional rich data
  numHolders?: number;
  transactionCount?: number;
  devHoldsPercent?: number;
  snipersHoldPercent?: number;
  insidersHoldPercent?: number;
  bundlersHoldPercent?: number;
  top10HoldersPercent?: number;
};

type Coin = {
  id: string;
  name: string;
  symbol: string;
  protocolDetails?: { isMayhem?: boolean } | null;
  age: string;
  createdAtTs?: number | null;
  mc: string;
  marketCapValue?: number | null;
  vol?: string;
  volumeValue?: number | null;
  icon?: React.ReactElement | string;
  imageUrl?: string;
  contractAddress: string;
  holders?: number | null;
  holdersValue?: number | null;
  bondingCurveProgress?: number | null;
  volume24h?: string;
  marketCapPercentChange?: number;
  liquiditySol?: number;
  buyCount?: number;
  sellCount?: number;
  lpBurned?: number;
  dexPaid?: boolean;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  // Rich data from Axiom
  price1minChange?: number | null;
  price5minChange?: number | null;
  price30minChange?: number | null;
  price1hrChange?: number | null;
  marketCapChartData?: Array<{ time: number; value: number }> | null;
  // Additional rich data
  numHolders?: number;
  transactionCount?: number;
  devHoldsPercent?: number;
  snipersHoldPercent?: number;
  insidersHoldPercent?: number;
  bundlersHoldPercent?: number;
  top10HoldersPercent?: number;
  holdersType?: 'total' | 'top10';
  // Section-specific properties
  isMigrated?: boolean;
};

type FilterKey = 'mc' | 'volume' | 'holders';
type FilterRange = { label: string; min?: number; max?: number; custom?: boolean };
type FilterState = Record<FilterKey, FilterRange>;

const RANGE_OPTIONS: Record<FilterKey, readonly FilterRange[]> = {
  mc: [{ label: 'Any' }, { label: 'Custom', custom: true }],
  volume: [{ label: 'Any' }, { label: 'Custom', custom: true }],
  holders: [{ label: 'Any' }, { label: 'Custom', custom: true }]
};

const makeDefaultFilter = (): FilterState => ({
  mc: { label: 'Custom', custom: true },
  volume: { label: 'Custom', custom: true },
  holders: { label: 'Custom', custom: true }
});

const formatVolume = (value: number | null): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
};

const formatHolders = (value: number | null): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  } else {
    return value.toString();
  }
};

const formatAge = (ageMinutes: number | null): string => {
  if (ageMinutes === null || ageMinutes === undefined) return 'N/A';

  const months = Math.floor(ageMinutes / (60 * 24 * 30));
  if (months > 0) return `${months}M ago`;

  const days = Math.floor(ageMinutes / (60 * 24));
  if (days > 0) return `${days}D ago`;

  const hours = Math.floor(ageMinutes / 60);
  if (hours > 0) return `${hours}h ago`;

  const minutes = Math.floor(ageMinutes);
  if (minutes > 0) return `${minutes}m ago`;

  const seconds = Math.floor(ageMinutes * 60);
  return `${seconds}s ago`;
};

const formatMarketCap = (value: number | null, solPrice: number | null = null): string => {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  } else if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
};

function normalizeTokenToCoin(token: NormalizedToken, index: number, solPrice: number | null, section?: string): Coin {
  const mc = (token as any).marketCapSol && solPrice
    ? formatMarketCap((token as any).marketCapSol * solPrice)
    : 'N/A';

  const marketCapValue = (token as any).marketCapSol && solPrice
    ? (token as any).marketCapSol * solPrice
    : null;

  const volume24h = (token as any).volumeSol && solPrice
    ? formatVolume((token as any).volumeSol * solPrice)
    : undefined;

  const volumeValue = (token as any).volumeSol && solPrice
    ? (token as any).volumeSol * solPrice
    : null;

  const iconIndex = (token.tokenAddress.charCodeAt(0) + index) % CustomIcons.coinIcons.length;
  const icon = React.cloneElement(CustomIcons.coinIcons[iconIndex], { className: 'w-6 h-6' });

  const age = token.createdAt
    ? formatAge(Math.floor((Date.now() - new Date(token.createdAt).getTime()) / (1000 * 60)))
    : 'N/A';

  const protocolDetails = token.protocolDetails || (token as any).protocol_details || undefined;
  const totalHolders = (token as any).numHolders ?? null;
  const top10Holders = token.top10Holders ?? null;
  const isMigrated =
    section === 'migrated' ||
    token.protocol === 'Pump AMM' ||
    (token as any).migratedFrom === 'Pump V1' ||
    Boolean((token as any).migratedTo);

  return {
    id: token.tokenAddress,
    name: token.tokenName || 'Unknown',
    symbol: token.tokenTicker || 'UNK',
    age,
    createdAtTs: token.createdAt ? new Date(token.createdAt).getTime() : null,
    mc,
    marketCapValue,
    vol: volume24h,
    volumeValue,
    icon,
    imageUrl: token.tokenImage || token.imageUrl,
    contractAddress: token.tokenAddress,
    holders: totalHolders ?? top10Holders,
    holdersValue: totalHolders ?? top10Holders,
    holdersType: totalHolders != null ? 'total' : top10Holders != null ? 'top10' : undefined,
    bondingCurveProgress: null,
    volume24h,
    marketCapPercentChange: token.marketCapPercentChange,
    liquiditySol: (token as any).liquiditySol,
    buyCount: token.buyCount,
    sellCount: token.sellCount,
    lpBurned: token.lpBurned,
    dexPaid: token.dexPaid,
    website: token.website,
    twitter: token.twitter,
    telegram: token.telegram,
    discord: token.discord,
    // Rich data from Axiom
    price1minChange: token.price1minChange || null,
    price5minChange: token.price5minChange || null,
    price30minChange: token.price30minChange || null,
    price1hrChange: token.price1hrChange || null,
    marketCapChartData: token.marketCapChartData || null,
    protocolDetails,
    // Additional rich data
    numHolders: totalHolders,
    transactionCount: (token as any).transactionCount || null,
    devHoldsPercent: (token as any).devHoldsPercent || null,
    snipersHoldPercent: (token as any).snipersHoldPercent || null,
    insidersHoldPercent: (token as any).insidersHoldPercent || null,
    bundlersHoldPercent: (token as any).bundlersHoldPercent || null,
    top10HoldersPercent: (token as any).top10HoldersPercent || null,
    // Section-specific properties
    isMigrated
  };
}

const Screener = ({ operator }: ScreenerProps) => {
  const { connectionState, marketData, lastError, refreshTrending } = useMarketData();

  // Transform market data to Coin format
  const trendingCoins: Coin[] = React.useMemo(() => {
    return marketData.trending.slice(0, 50).map((token, index) =>
      normalizeTokenToCoin(token, index, marketData.solPrice, 'trending')
    );
  }, [marketData.trending, marketData.solPrice, normalizeTokenToCoin]);

  const finalStretchCoins: Coin[] = React.useMemo(() => {
    return marketData.finalStretch.slice(0, 50).map((token, index) =>
      normalizeTokenToCoin(token, index, marketData.solPrice, 'finalStretch')
    );
  }, [marketData.finalStretch, marketData.solPrice, normalizeTokenToCoin]);

  const migratedCoins: Coin[] = React.useMemo(() => {
    return marketData.migrated.slice(0, 50).map((token, index) =>
      normalizeTokenToCoin(token, index, marketData.solPrice, 'migrated')
    );
  }, [marketData.migrated, marketData.solPrice, normalizeTokenToCoin]);

  const newMintCoins: Coin[] = React.useMemo(() => {
    return marketData.newMint.slice(0, 50).map((token, index) =>
      normalizeTokenToCoin(token, index, marketData.solPrice, 'newMint')
    );
  }, [marketData.newMint, marketData.solPrice, normalizeTokenToCoin]);

  const handleRefreshTrending = async () => {
    try {
      await refreshTrending();
    } catch (error) {
      console.error('Failed to refresh trending:', error);
    }
  };

  type SortKey = 'recent' | 'mc' | 'volume' | 'holders';
  type SortDir = 'asc' | 'desc';

  const [sortConfig, setSortConfig] = React.useState<{
    newMint: { key: SortKey; dir: SortDir };
    finalStretch: { key: SortKey; dir: SortDir };
    migrated: { key: SortKey; dir: SortDir };
  }>({
    newMint: { key: 'recent', dir: 'desc' },
    finalStretch: { key: 'recent', dir: 'desc' },
    migrated: { key: 'recent', dir: 'desc' }
  });

  type FilterKey = 'mc' | 'volume' | 'holders';
  type FilterRange = { label: string; min?: number; max?: number; custom?: boolean };

  const rangeOptions: Record<FilterKey, readonly FilterRange[]> = {
    mc: [
      { label: 'Any' },
      { label: 'Custom', custom: true }
    ],
    volume: [
      { label: 'Any' },
      { label: 'Custom', custom: true }
    ],
    holders: [
      { label: 'Any' },
      { label: 'Custom', custom: true }
    ]
  } as const;

  type FilterState = Record<FilterKey, FilterRange>;
  const defaultCustom: FilterRange = { label: 'Custom', custom: true };
  const defaultFilter: FilterState = {
    mc: defaultCustom,
    volume: defaultCustom,
    holders: defaultCustom
  };

  const [filterConfig, setFilterConfig] = React.useState<{
    newMint: FilterState;
    finalStretch: FilterState;
    migrated: FilterState;
  }>({
    newMint: makeDefaultFilter(),
    finalStretch: makeDefaultFilter(),
    migrated: makeDefaultFilter()
  });

  const [favorites, setFavorites] = React.useState<Set<string>>(new Set());
  const [favoriteCache, setFavoriteCache] = React.useState<Record<string, FavoriteWidgetCoin>>({});

  React.useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('screener_favorites') : null;
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setFavorites(new Set(parsed));
        }
      }
      const cached = typeof window !== 'undefined' ? localStorage.getItem('screener_fav_cache') : null;
      if (cached) {
        const parsedCache = JSON.parse(cached);
        if (parsedCache && typeof parsedCache === 'object') {
          setFavoriteCache(parsedCache);
        }
      }
    } catch (e) {
      console.error('Failed to load favorites', e);
    }
  }, []);

  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('screener_favorites', JSON.stringify(Array.from(favorites)));
      }
    } catch (e) {
      console.error('Failed to save favorites', e);
    }
  }, [favorites]);

  const coinToFavorite = React.useCallback((coin: Coin): FavoriteWidgetCoin => ({
    id: coin.contractAddress,
    name: coin.name,
    symbol: coin.symbol,
    contractAddress: coin.contractAddress,
    mc: coin.mc,
    volume24h: coin.volume24h,
    imageUrl: coin.imageUrl
  }), []);

  const coinMap = React.useMemo(() => {
    const map = new Map<string, Coin>();
    [...trendingCoins, ...newMintCoins, ...finalStretchCoins, ...migratedCoins].forEach((c) => {
      map.set(c.contractAddress, c);
    });
    return map;
  }, [trendingCoins, newMintCoins, finalStretchCoins, migratedCoins]);

  React.useEffect(() => {
    setFavoriteCache((prev) => {
      let changed = false;
      const next = { ...prev };
      favorites.forEach((id) => {
        const live = coinMap.get(id);
        if (live) {
          const snapshot = coinToFavorite(live);
          const current = next[id];
          if (!current ||
            current.mc !== snapshot.mc ||
            current.volume24h !== snapshot.volume24h ||
            current.name !== snapshot.name ||
            current.symbol !== snapshot.symbol) {
            next[id] = snapshot;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [favorites, coinMap, coinToFavorite]);

  React.useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // Strip any non-serializable fields before persisting
        const serializable = Object.fromEntries(
          Object.entries(favoriteCache).map(([k, v]) => [
            k,
            {
              id: v.id,
              name: v.name,
              symbol: v.symbol,
              contractAddress: v.contractAddress,
              mc: v.mc,
              volume24h: v.volume24h,
              imageUrl: v.imageUrl
            }
          ])
        );
        localStorage.setItem('screener_fav_cache', JSON.stringify(serializable));
      }
    } catch (e) {
      console.error('Failed to persist favorite cache', e);
    }
  }, [favoriteCache]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sortCoins = (coins: Coin[], key: SortKey, dir: SortDir) => {
    const direction = dir === 'asc' ? 1 : -1;
    return [...coins].sort((a, b) => {
      const getVal = (c: Coin) => {
        switch (key) {
          case 'recent':
            return c.createdAtTs ?? 0;
          case 'mc':
            return c.marketCapValue ?? 0;
          case 'volume':
            return c.volumeValue ?? 0;
          case 'holders':
            return c.holdersValue ?? 0;
          default:
            return 0;
        }
      };
      const aVal = getVal(a);
      const bVal = getVal(b);
      if (aVal === bVal) return 0;
      return aVal > bVal ? direction : -direction;
    });
  };

  const isLoading = connectionState === 'connecting' &&
    trendingCoins.length === 0 &&
    finalStretchCoins.length === 0 &&
    migratedCoins.length === 0 &&
    newMintCoins.length === 0;

  const applyFilters = (coins: Coin[], filters: FilterState) => {
    const inRange = (val: number | null | undefined, range: FilterRange) => {
      if (range.min != null && (val == null || val < range.min)) return false;
      if (range.max != null && (val == null || val > range.max)) return false;
      return true;
    };
    return coins.filter((c) =>
      inRange(c.marketCapValue ?? null, filters.mc) &&
      inRange(c.volumeValue ?? null, filters.volume) &&
      inRange(c.holdersValue ?? null, filters.holders)
    );
  };

  const sortedNewMint = React.useMemo(() => {
    const filtered = applyFilters(newMintCoins, filterConfig.newMint);
    return sortCoins(filtered, sortConfig.newMint.key, sortConfig.newMint.dir);
  }, [newMintCoins, sortConfig.newMint, filterConfig.newMint]);

  const sortedFinalStretch = React.useMemo(() => {
    const filtered = applyFilters(finalStretchCoins, filterConfig.finalStretch);
    return sortCoins(filtered, sortConfig.finalStretch.key, sortConfig.finalStretch.dir);
  }, [finalStretchCoins, sortConfig.finalStretch, filterConfig.finalStretch]);

  const sortedMigrated = React.useMemo(() => {
    const filtered = applyFilters(migratedCoins, filterConfig.migrated);
    return sortCoins(filtered, sortConfig.migrated.key, sortConfig.migrated.dir);
  }, [migratedCoins, sortConfig.migrated, filterConfig.migrated]);

  const favoriteCoins: FavoriteWidgetCoin[] = React.useMemo(() => {
    const list: FavoriteWidgetCoin[] = [];
    favorites.forEach((id) => {
      const live = coinMap.get(id);
      if (live) {
        list.push(coinToFavorite(live));
      } else if (favoriteCache[id]) {
        list.push(favoriteCache[id]);
      }
    });
    return list;
  }, [favorites, coinMap, coinToFavorite, favoriteCache]);

  const trendingScrollRef = React.useRef<HTMLDivElement | null>(null);
  const trendingHoverRef = React.useRef(false);

  React.useEffect(() => {
    const el = trendingScrollRef.current;
    if (!el) return;
    let dir: 1 | -1 = 1;
    const step = 1.2;
    const id = window.setInterval(() => {
      if (!el || trendingHoverRef.current) return;
      const max = el.scrollWidth - el.clientWidth;
      el.scrollLeft += step * dir;
      if (el.scrollLeft <= 0) dir = 1;
      else if (el.scrollLeft >= max) dir = -1;
    }, 20);
    return () => window.clearInterval(id);
  }, [trendingCoins.length]);

  return (
    <div className="h-full p-3 bg-black/30 relative text-green-100">
      <FavoritesWidget
        favorites={favorites}
        favoriteCoins={favoriteCoins}
        onToggleFavorite={toggleFavorite}
      />
      {/* Trending Section */}
      <div className="mb-3">
        <div className="border border-green-400/40 bg-black/70">
          <div className="border-b border-green-400/30 p-2.5">
            <div className="flex items-center space-x-2">
              <span className="text-green-400">{CustomIcons.trending || '📈'}</span>
              <h3 className="text-green-300 font-bold font-mono text-sm">TRENDING</h3>
            </div>
          </div>
          <div className="p-2.5">
            <div
              className="overflow-x-auto scrollbar-thin scrollbar-thumb-transparent"
              ref={trendingScrollRef}
              onMouseEnter={() => { trendingHoverRef.current = true; }}
              onMouseLeave={() => { trendingHoverRef.current = false; }}
            >
              <div className="flex gap-2.5 pb-2">
                {isLoading ? (
                  <div className="flex-1 text-center py-8">
                    <div className="text-green-500/60 font-mono text-sm">Loading market data...</div>
                  </div>
                ) : trendingCoins.length === 0 ? (
                  <div className="flex-1 text-center py-8">
                    <div className="text-green-500/60 font-mono text-sm">No trending coins available</div>
                  </div>
                ) : (
                  trendingCoins.map((coin) => (
                  <div
                    key={coin.id}
                    className="relative min-w-[290px] max-w-[310px] border border-green-400/40 bg-black/60 p-3 hover:bg-green-500/5 hover:border-green-400/60 transition-all duration-200 cursor-pointer rounded"
                    onClick={() => window.open(`/terminal?coin=${coin.contractAddress}`, '_blank')}
                  >
                     {/* Header Row */}
                     <div className="flex items-start justify-between mb-3">
                       <div className="flex items-center space-x-3">
                         <div className="w-10 h-10 bg-green-500/10 border border-green-400/40 flex items-center justify-center flex-shrink-0 rounded">
                           {coin.imageUrl ? (
                             <img
                               src={coin.imageUrl}
                               alt={`${coin.name} logo`}
                               className="w-8 h-8 object-cover rounded"
                               onError={(e) => {
                                 e.currentTarget.style.display = 'none';
                                 e.currentTarget.parentElement!.innerHTML = `<div class="text-sm">${coin.icon ? ReactDOMServer.renderToString(coin.icon) : '🔹'}</div>`;
                               }}
                             />
                           ) : (
                             <span className="text-sm">{coin.icon || '🔹'}</span>
                           )}
                         </div>
                         <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-green-300 font-bold font-mono text-sm">
                            <span>${coin.symbol}</span>
                            <a
                              href={`https://pump.fun/coin/${coin.contractAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 hover:opacity-80 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                              title="View on Pump.fun"
                            >
                              <img
                                src={
                                  coin.protocolDetails?.isMayhem
                                    ? '/logos/mayhem.svg'
                                    : coin.isMigrated
                                      ? '/logos/pumpswap.svg'
                                      : '/logos/pumpfun.svg'
                                }
                                alt={
                                  coin.protocolDetails?.isMayhem
                                    ? 'Mayhem'
                                    : coin.isMigrated
                                      ? 'Pump Swap'
                                      : 'Pump.fun'
                                }
                                className="w-4 h-4"
                              />
                            </a>
                          </div>
                          <div className="text-green-200/80 font-mono text-xs truncate max-w-[160px]">
                            {coin.name.length > 12 ? `${coin.name.substring(0, 12)}...` : coin.name}
                          </div>
                          <div className="text-green-100/70 font-mono text-[11px]">{coin.age}</div>
                        </div>
                       </div>

                       <div className="flex flex-col items-end space-y-1">
                         <button
                           className="absolute bottom-2 right-2 text-yellow-400 hover:text-yellow-300"
                           onClick={(e) => { e.stopPropagation(); toggleFavorite(coin.contractAddress); }}
                           title={favorites.has(coin.contractAddress) ? 'Remove from favorites' : 'Add to favorites'}
                         >
                           {favorites.has(coin.contractAddress) ? CustomIcons.starFilled : CustomIcons.star}
                         </button>
                         <div className="text-green-300 font-bold font-mono text-lg">{coin.mc}</div>
                         {coin.marketCapChartData &&
                           Array.isArray(coin.marketCapChartData) &&
                           coin.marketCapChartData.length >= 2 && (
                             <div className="flex-shrink-0">
                               <MiniChart data={coin.marketCapChartData} />
                             </div>
                           )}
                       </div>
                     </div>

                     {/* Primary Metrics Row - Always visible, no wrapping */}
                     <div className="flex items-center gap-2 mt-1">
                       {/* Price Change - Primary metric */}
                        {coin.price1hrChange !== null && coin.price1hrChange !== undefined && (
                          <div
                            className={`px-2 py-0.5 text-xs font-mono font-bold ${
                              coin.price1hrChange >= 0
                                ? 'text-green-300 bg-green-500/10 border border-green-400/50'
                                : 'text-red-300 bg-red-500/10 border border-red-500/40'
                            }`}
                          >
                            {coin.price1hrChange >= 0 ? '+' : ''}
                            {coin.price1hrChange.toFixed(1)}%
                          </div>
                        )}

                        {/* Volume - Secondary metric */}
                        {coin.volume24h && (
                          <div className="flex items-center gap-1 text-green-400 font-mono text-xs">
                            <span className="font-bold">V</span>
                            <span className="font-bold">{coin.volume24h}</span>
                          </div>
                        )}

                        {/* Holders - Tertiary metric */}
                        {coin.numHolders && coin.numHolders > 0 && (
                          <div className="flex items-center gap-1 text-indigo-400 font-mono text-xs">
                            {CustomIcons.holders}
                            <span className="font-bold">{formatHolders(coin.numHolders)}</span>
                          </div>
                        )}

                        {/* Liquidity - Quaternary metric */}
                        {coin.liquiditySol && coin.liquiditySol > 0 && (
                          <div className="flex items-center gap-1 text-blue-400 font-mono text-xs">
                            <span className="text-blue-400">◎</span>
                            <span className="font-bold">{formatVolume(coin.liquiditySol)}</span>
                          </div>
                        )}
                      </div>

                      {/* Secondary Metrics Row - Special indicators */}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        {/* Buy/Sell Activity */}
                        {coin.buyCount !== undefined &&
                          coin.sellCount !== undefined &&
                          (coin.buyCount > 0 || coin.sellCount > 0) && (
                            <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 text-xs font-mono text-purple-400">
                              {CustomIcons.buy}
                              <span className="font-bold">{coin.buyCount}</span>
                              {CustomIcons.sell}
                              <span className="font-bold">{coin.sellCount}</span>
                            </div>
                          )}

                        {/* LP Burned */}
                        {coin.lpBurned !== undefined && coin.lpBurned !== null && coin.lpBurned > 0 && (
                          <div
                            className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono border ${
                              coin.lpBurned >= 100
                                ? 'text-orange-400 bg-orange-500/10 border-orange-500/30'
                                : 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
                            }`}
                          >
                            {CustomIcons.burn}
                            <span className="font-bold">{coin.lpBurned}%</span>
                          </div>
                        )}

                        {/* DEX Paid */}
                        {coin.dexPaid && (
                          <div className="flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.5 text-xs font-mono text-cyan-400">
                            {CustomIcons.paid}
                          </div>
                        )}

                        {/* Mayhem Protocol */}
                        {coin.protocolDetails?.isMayhem && (
                          <div className="flex items-center gap-1 bg-pink-500/10 border border-pink-500/30 px-1.5 py-0.5 text-xs font-mono text-pink-400">
                            {CustomIcons.mayhem}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
      </div>
    </div>

      {/* Three Column Grid: New Mint, Final Stretch, Migrated */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* New Mint */}
        <div className="border border-green-400/40 bg-black/70">
          <div className="border-b border-green-400/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-green-400">{CustomIcons.newMint}</span>
                <h3 className="text-green-300 font-bold font-mono text-sm">NEW MINT</h3>
              </div>
              <div className="flex items-center gap-2">
                <SortControls
                  current={sortConfig.newMint}
                  onChange={(key, dir) => setSortConfig((prev) => ({ ...prev, newMint: { key, dir } }))}
                />
                <FilterControls
                  current={filterConfig.newMint}
                  onChange={(next) => setFilterConfig((prev) => ({ ...prev, newMint: next }))}
                  options={RANGE_OPTIONS}
                />
              </div>
            </div>
          </div>
          <div className="divide-y divide-green-500/10 max-h-[55vh] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="text-green-500/60 font-mono text-sm">Loading...</div>
              </div>
            ) : newMintCoins.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-green-500/60 font-mono text-sm">No new mint tokens available</div>
              </div>
            ) : (
              sortedNewMint.map((coin) => (
                <CoinRow
                  key={coin.id}
                  coin={coin}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              ))
            )}
          </div>
        </div>

        {/* Final Stretch */}
        <div className="border border-green-400/40 bg-black/70">
          <div className="border-b border-green-400/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-green-400">{CustomIcons.finalStretch}</span>
                <h3 className="text-green-300 font-bold font-mono text-sm">FINAL STRETCH</h3>
              </div>
              <div className="flex items-center gap-2">
                <SortControls
                  current={sortConfig.finalStretch}
                  onChange={(key, dir) => setSortConfig((prev) => ({ ...prev, finalStretch: { key, dir } }))}
                />
                <FilterControls
                  current={filterConfig.finalStretch}
                  onChange={(next) => setFilterConfig((prev) => ({ ...prev, finalStretch: next }))}
                  options={RANGE_OPTIONS}
                />
              </div>
            </div>
          </div>
          <div className="divide-y divide-green-500/10 max-h-[55vh] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="text-green-500/60 font-mono text-sm">Loading...</div>
              </div>
            ) : finalStretchCoins.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-green-500/60 font-mono text-sm">No final stretch coins available</div>
              </div>
            ) : (
              sortedFinalStretch.map((coin) => (
                <CoinRow
                  key={coin.id}
                  coin={coin}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              ))
            )}
          </div>
        </div>

        {/* Migrated */}
        <div className="border border-green-400/40 bg-black/70">
          <div className="border-b border-green-400/30 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-green-400">{CustomIcons.migrated}</span>
                <h3 className="text-green-300 font-bold font-mono text-sm">MIGRATED</h3>
              </div>
              <div className="flex items-center gap-2">
                <SortControls
                  current={sortConfig.migrated}
                  onChange={(key, dir) => setSortConfig((prev) => ({ ...prev, migrated: { key, dir } }))}
                />
                <FilterControls
                  current={filterConfig.migrated}
                  onChange={(next) => setFilterConfig((prev) => ({ ...prev, migrated: next }))}
                  options={RANGE_OPTIONS}
                />
              </div>
            </div>
          </div>
          <div className="divide-y divide-green-500/10 max-h-[55vh] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="text-green-500/60 font-mono text-sm">Loading...</div>
              </div>
            ) : migratedCoins.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-green-500/60 font-mono text-sm">No migrated coins available</div>
              </div>
            ) : (
              sortedMigrated.map((coin) => (
                <CoinRow
                  key={coin.id}
                  coin={coin}
                  favorites={favorites}
                  onToggleFavorite={toggleFavorite}
                />
              ))
            )}
          </div>
      </div>
    </div>

      {/* Error Display */}
      {lastError && (
        <div className="mt-6 border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-red-400 font-mono text-sm">⚠️ {lastError}</div>
        </div>
      )}
    </div>
  );
};

// Mini Chart Component
function MiniChart({ data }: { data: Array<{ time: number; value: number }> }) {
  if (!data || data.length < 2) return null;

  // Get the last 8 data points for the mini chart
  const chartData = data.slice(-8);
  const values = chartData.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Create SVG path
  const pathData = chartData.map((point, index) => {
    const x = (index / (chartData.length - 1)) * 100;
    const y = 100 - ((point.value - min) / range) * 100;
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // Determine color based on trend (last value vs first value)
  const firstValue = chartData[0]?.value || 0;
  const lastValue = chartData[chartData.length - 1]?.value || 0;
  const isPositive = lastValue >= firstValue;
  const strokeColor = isPositive ? '#22c55e' : '#ef4444'; // green-500 or red-500

  return (
    <div className="w-20 h-6">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const formatAgeMinutes = (ageMinutes: number | null): string => {
  if (ageMinutes === null || ageMinutes === undefined) return 'N/A';

  const months = Math.floor(ageMinutes / (60 * 24 * 30));
  if (months > 0) return `${months}M ago`;

  const days = Math.floor(ageMinutes / (60 * 24));
  if (days > 0) return `${days}D ago`;

  const hours = Math.floor(ageMinutes / 60);
  if (hours > 0) return `${hours}h ago`;

  const minutes = Math.floor(ageMinutes);
  if (minutes > 0) return `${minutes}m ago`;

  const seconds = Math.floor(ageMinutes * 60);
  return `${seconds}s ago`;
};

// Coin Row Component
type CoinRowProps = {
  coin: Coin;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
};

function CoinRow({ coin, favorites, onToggleFavorite }: CoinRowProps) {
  const [copied, setCopied] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(() => Date.now());
  const priceChange =
    coin.price1minChange ?? coin.price5minChange ?? coin.price30minChange ?? coin.price1hrChange ?? null;
  const priceLabel =
    coin.price1minChange !== null && coin.price1minChange !== undefined
      ? '1m'
      : coin.price5minChange !== null && coin.price5minChange !== undefined
        ? '5m'
        : coin.price30minChange !== null && coin.price30minChange !== undefined
          ? '30m'
      : coin.price1hrChange !== null && coin.price1hrChange !== undefined
        ? '1h'
        : null;
  const displayAge = coin.createdAtTs
    ? formatAgeMinutes((nowTick - coin.createdAtTs) / (1000 * 60))
    : coin.age;

  React.useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const truncateAddress = (address: string) => {
    if (address.length <= 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(coin.contractAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className="border-b border-green-500/10 px-4 py-3 hover:bg-green-500/5 transition-colors cursor-pointer"
      onClick={() => window.open(`/terminal?coin=${coin.contractAddress}`, '_blank')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-green-500/5 flex items-center justify-center flex-shrink-0 rounded">
            {coin.imageUrl ? (
              <img
                src={coin.imageUrl}
                alt={`${coin.name} logo`}
                className="w-9 h-9 object-cover rounded"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = `<div class="text-sm">${coin.icon ? ReactDOMServer.renderToString(coin.icon) : '🔹'}</div>`;
                }}
              />
            ) : (
              <span className="text-sm">{coin.icon || '🔹'}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-green-300 font-bold font-mono text-sm truncate">
                {coin.name.length > 12 ? `${coin.name.substring(0, 12)}...` : coin.name}
              </span>
              <span className="text-green-200/80 font-mono text-xs">({coin.symbol})</span>
              <a
                href={`https://pump.fun/coin/${coin.contractAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 hover:opacity-80 transition-opacity"
                onClick={(e) => e.stopPropagation()}
                title="View on Pump.fun"
              >
                <img
                  src={
                    coin.protocolDetails?.isMayhem
                      ? '/logos/mayhem.svg'
                      : coin.isMigrated
                        ? '/logos/pumpswap.svg'
                        : '/logos/pumpfun.svg'
                  }
                  alt={
                    coin.protocolDetails?.isMayhem
                      ? 'Mayhem'
                      : coin.isMigrated
                        ? 'Pump Swap'
                        : 'Pump.fun'
                  }
                  className="w-4 h-4"
                />
              </a>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] font-mono text-green-200">
              <span>{displayAge}</span>
              <button
                onClick={handleCopyAddress}
                className={`text-[11px] font-mono ${copied ? 'text-green-300' : 'text-green-200/70 hover:text-green-200'} transition-colors`}
                title={copied ? 'Copied!' : `Click to copy: ${coin.contractAddress}`}
              >
                {copied ? CustomIcons.check : truncateAddress(coin.contractAddress)}
              </button>
              <button
                className="text-yellow-400 hover:text-yellow-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(coin.contractAddress);
                }}
                title={favorites.has(coin.contractAddress) ? 'Remove from favorites' : 'Add to favorites'}
              >
                {favorites.has(coin.contractAddress) ? CustomIcons.starFilled : CustomIcons.star}
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="text-green-300 font-bold font-mono text-sm text-right">{coin.mc}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono">
        {priceChange !== null && priceLabel && (
          <span
            className={`px-2 py-0.5 rounded border ${
              priceChange >= 0
                ? 'text-green-400 border-green-500/40 bg-green-500/10'
                : 'text-red-400 border-red-500/40 bg-red-500/10'
            }`}
          >
            {priceLabel}: {priceChange >= 0 ? '+' : ''}
            {priceChange.toFixed(1)}%
          </span>
        )}
        {coin.volume24h && (
          <span className="flex items-center gap-1 text-green-400">
            <span className="font-bold">V</span>
            <span className="font-bold">{coin.volume24h}</span>
          </span>
        )}
        {coin.liquiditySol && coin.liquiditySol > 0 && (
          <span className="flex items-center gap-1 text-blue-400">
            <span className="text-blue-400">◎</span>
            <span className="font-bold">{formatVolume(coin.liquiditySol)}</span>
          </span>
        )}
        {(() => {
          const displayHolders = coin.numHolders ?? coin.holders;
          if (!displayHolders) return null;
          const toLabel = (value: number) => {
            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
            if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
            return value.toLocaleString();
          };
          const label =
            coin.holdersType === 'top10' && coin.numHolders == null
              ? `Top10: ${toLabel(displayHolders)}`
              : toLabel(displayHolders);
          return (
            <span className="flex items-center gap-1 text-green-200">
              {CustomIcons.holders}
              <span className="font-bold">H</span>
              <span>{label}</span>
            </span>
          );
        })()}
        {coin.buyCount !== undefined && coin.sellCount !== undefined && (coin.buyCount > 0 || coin.sellCount > 0) && (
          <span className="flex items-center gap-1 text-purple-400">
            {CustomIcons.buy}
            {coin.buyCount}
            {CustomIcons.sell}
            {coin.sellCount}
          </span>
        )}
        {coin.lpBurned !== undefined && coin.lpBurned !== null && coin.lpBurned > 0 && (
          <span
            className={`flex items-center gap-1 ${
              coin.lpBurned >= 100 ? 'text-orange-400' : 'text-yellow-400'
            }`}
          >
            {CustomIcons.burn}
            {coin.lpBurned}%
          </span>
        )}
        {coin.protocolDetails?.isMayhem && <span className="text-pink-400">{CustomIcons.mayhem}</span>}
        {coin.dexPaid && <span className="text-cyan-400">{CustomIcons.paid}</span>}
        {coin.transactionCount && coin.transactionCount > 0 && (
          <span className="flex items-center gap-1 text-orange-400">
            {CustomIcons.transactions}
            {coin.transactionCount.toLocaleString()}
          </span>
        )}
        {coin.devHoldsPercent !== undefined && coin.devHoldsPercent > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            {CustomIcons.dev}
            {coin.devHoldsPercent.toFixed(1)}%
          </span>
        )}
        {coin.snipersHoldPercent !== undefined && coin.snipersHoldPercent > 0 && (
          <span className="flex items-center gap-1 text-yellow-400">
            {CustomIcons.sniper}
            {coin.snipersHoldPercent.toFixed(1)}%
          </span>
        )}
        {coin.insidersHoldPercent !== undefined && coin.insidersHoldPercent > 0 && (
          <span className="flex items-center gap-1 text-purple-400">
            {CustomIcons.insider}
            {coin.insidersHoldPercent.toFixed(1)}%
          </span>
        )}
        {coin.bundlersHoldPercent !== undefined && coin.bundlersHoldPercent > 0 && (
          <span className="flex items-center gap-1 text-gray-400">
            {CustomIcons.bundler}
            {coin.bundlersHoldPercent.toFixed(1)}%
          </span>
        )}
        {coin.top10HoldersPercent !== undefined && coin.top10HoldersPercent > 0 && (
          <span className="flex items-center gap-1 text-blue-400">
            {CustomIcons.top10}
            {coin.top10HoldersPercent.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Bonding curve progress for Final Stretch */}
      {coin.bondingCurveProgress !== null && coin.bondingCurveProgress !== undefined && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs font-mono text-green-500/60 mb-1">
            <span>Progress</span>
            <span>{coin.bondingCurveProgress.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-green-500/20 rounded-full h-1.5">
            <div
              className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(coin.bondingCurveProgress, 100)}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}

type SortControlsProps = {
  current: { key: 'recent' | 'mc' | 'volume' | 'holders'; dir: 'asc' | 'desc' };
  onChange: (key: 'recent' | 'mc' | 'volume' | 'holders', dir: 'asc' | 'desc') => void;
};

function SortControls({ current, onChange }: SortControlsProps) {
  const toggle = (key: SortControlsProps['current']['key']) => {
    const dir = current.key === key && current.dir === 'desc' ? 'asc' : 'desc';
    onChange(key, dir);
  };

  const btnClass = (key: SortControlsProps['current']['key']) =>
    `px-2 py-1 text-[11px] font-mono border ${
      current.key === key ? 'border-green-300 text-green-100' : 'border-green-400/40 text-green-300/80'
    } hover:border-green-200 hover:text-green-100 transition-colors`;

  const caret = (key: SortControlsProps['current']['key']) => {
    if (current.key !== key) return '';
    return current.dir === 'desc' ? '↓' : '↑';
    };

  return (
    <div className="flex items-center gap-1">
      <button className={btnClass('recent')} onClick={() => toggle('recent')}>Recent {caret('recent')}</button>
      <button className={btnClass('mc')} onClick={() => toggle('mc')}>MC {caret('mc')}</button>
      <button className={btnClass('volume')} onClick={() => toggle('volume')}>Vol {caret('volume')}</button>
      <button className={btnClass('holders')} onClick={() => toggle('holders')}>Holders {caret('holders')}</button>
    </div>
  );
}

type FilterControlsProps = {
  current: FilterState;
  onChange: (next: FilterState) => void;
  options: {
    mc: readonly FilterRange[];
    volume: readonly FilterRange[];
    holders: readonly FilterRange[];
  };
};

function FilterControls({ current, onChange, options }: FilterControlsProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  type InputsState = Record<FilterKey, { min: string; max: string }>;
  const [inputs, setInputs] = React.useState<InputsState>({
    mc: { min: '', max: '' },
    volume: { min: '', max: '' },
    holders: { min: '', max: '' }
  });

  const formatNumberInput = (value?: number) => (value != null ? value.toLocaleString('en-US') : '');
  const parseNumberInput = (val: string) => {
    const digits = val.replace(/[^\d]/g, '');
    return digits ? Number(digits) : undefined;
  };

  React.useEffect(() => {
    const sync = (key: FilterKey, range: FilterRange) => {
      if (range.custom) {
        setInputs((prev) => ({
          ...prev,
          [key]: {
            min: formatNumberInput(range.min),
            max: formatNumberInput(range.max)
          }
        }));
      } else {
        setInputs((prev) => ({
          ...prev,
          [key]: { min: '', max: '' }
        }));
      }
    };
    sync('mc', current.mc);
    sync('volume', current.volume);
    sync('holders', current.holders);
  }, [current.mc, current.volume, current.holders]);

  const handleCustomChange = (key: FilterKey, which: 'min' | 'max', raw: string) => {
    const parsed = parseNumberInput(raw);
    const formatted = formatNumberInput(parsed);
    setInputs((prev) => {
      const next = { ...prev[key], [which]: formatted };
      return { ...prev, [key]: next };
    });
    const currentInputs = inputs[key];
    const minRaw = which === 'min' ? formatted : currentInputs.min;
    const maxRaw = which === 'max' ? formatted : currentInputs.max;
    const min = parseNumberInput(minRaw);
    const max = parseNumberInput(maxRaw);
    onChange({
      ...current,
      [key]: { label: 'Custom', custom: true, min, max }
    });
  };

  const renderSelect = (label: string, value: FilterRange, list: readonly FilterRange[], key: FilterKey) => {
    const selectedIdx = list.findIndex(
      (opt) => opt.label === value.label && opt.custom === value.custom && opt.min === value.min && opt.max === value.max
    );
    const idx = selectedIdx >= 0 ? selectedIdx : 0;
    const isCustom = value.custom;

    return (
      <div className="space-y-1">
        <label className="flex items-center justify-between text-[11px] font-mono text-green-200/80">
          <span className="mr-2">{label}</span>
          <select
            className="bg-black/60 border border-green-400/40 text-green-100 text-[11px] px-2 py-1"
            value={idx}
            onChange={(e) => {
              const nextIdx = Number(e.target.value);
              const nextRange = list[nextIdx] || list[0];
              onChange({ ...current, [key]: nextRange });
            }}
          >
            {list.map((opt, optIdx) => (
              <option key={`${label}-${optIdx}`} value={optIdx}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {isCustom && (
          <div className="grid grid-cols-2 gap-2">
            <input
              className="bg-black/60 border border-green-400/40 text-green-100 text-[11px] px-2 py-1"
              placeholder="Min"
              value={inputs[key as keyof InputsState].min}
              onChange={(e) => handleCustomChange(key, 'min', e.target.value)}
              onBlur={(e) => handleCustomChange(key, 'min', formatNumberInput(parseNumberInput(e.target.value)))}
            />
            <input
              className="bg-black/60 border border-green-400/40 text-green-100 text-[11px] px-2 py-1"
              placeholder="Max"
              value={inputs[key as keyof InputsState].max}
              onChange={(e) => handleCustomChange(key, 'max', e.target.value)}
              onBlur={(e) => handleCustomChange(key, 'max', formatNumberInput(parseNumberInput(e.target.value)))}
            />
          </div>
        )}
      </div>
    );
  };

  React.useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="px-2 py-1 text-[11px] font-mono border border-green-400/40 text-green-100 hover:border-green-300 hover:text-green-50 transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-label="Filter"
      >
        <span className="flex items-center gap-1">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16M8 11h8m-4 6h0" />
            <path d="M10 17h4l-4 4v-4z" />
          </svg>
          <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-black/80 border border-green-400/40 p-3 space-y-2 z-20">
          {renderSelect('MC', current.mc, options.mc, 'mc')}
          {renderSelect('Volume', current.volume, options.volume, 'volume')}
          {renderSelect('Holders', current.holders, options.holders, 'holders')}
          <div className="flex justify-end">
            <button
              className="text-[11px] font-mono text-green-300 hover:text-green-100"
              onClick={() => {
                onChange({
                  mc: options.mc[0],
                  volume: options.volume[0],
                  holders: options.holders[0]
                });
              }}
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Screener;
