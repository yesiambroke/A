export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface NormalizedToken {
  tokenAddress: string;
  tokenName: string;
  tokenTicker: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  protocol: string;
  marketCapSol: number;
  marketCapUSD: number | null;
  volumeSol: number;
  volumeUSD: number | null;
  age: number | null;
  ageFormatted: string;
  holders: number | null;
  bondingCurveProgress: number | null;
  migratedFrom?: string | null;
  migratedTo?: string | null;
  status: 'new' | 'trending' | 'final_stretch' | 'migrated';
  createdAt?: string;
  updatedAt?: string;
  // New fields for trending tokens
  priceSol?: number | null;
  price1minChange?: number | null;
  price5minChange?: number | null;
  price30minChange?: number | null;
  price1hrChange?: number | null;
  marketCapChartData?: Array<{ time: number; value: number }> | null;
  protocolDetails?: { isMayhem?: boolean };
}

export interface MarketData {
  trending: NormalizedToken[];
  finalStretch: NormalizedToken[];
  migrated: NormalizedToken[];
  newMint: NormalizedToken[];
  solPrice: number | null;
  lastUpdate: string | null;
}
