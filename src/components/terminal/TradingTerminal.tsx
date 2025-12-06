"use client";

import React, { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useMarketData, TradeData } from "@/hooks/useMarketData";

// Custom Icons for Terminal
const CustomIcons = {
  insider: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M5 16L3 5l3.5 2L12 3l5.5 4L21 5l-2 11H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),

  bundler: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
      <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2"/>
      <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2"/>
      <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),

  sniper: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="2"/>
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2"/>
      <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2"/>
      <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2"/>
    </svg>
  )
};

type OperatorProps = {
  userId: number;
  tier: string;
  is2faEnabled: boolean;
};

type TradingTerminalProps = {
  operator: OperatorProps | null;
};

const TradingTerminal = ({ operator }: TradingTerminalProps) => {
  const [activeTab, setActiveTab] = useState<'wallets' | 'trades' | 'holders-bubble' | 'top-trader'>('trades');
  const [rightPanelWidth, setRightPanelWidth] = useState(25);
  const [chartHeight, setChartHeight] = useState(55);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizingVertical, setIsResizingVertical] = useState(false);
  const [currentCoin, setCurrentCoin] = useState<string>('So11111111111111111111111111111112');
  const [recentTrades, setRecentTrades] = useState<TradeData[]>([]);
  const [tradeMode, setTradeMode] = useState<'buy' | 'sell'>('buy');
  const [tradeSolAmount, setTradeSolAmount] = useState<string>('');
  const [tradeTokenAmount, setTradeTokenAmount] = useState<string>('');
  const [showBetaOverlay, setShowBetaOverlay] = useState(true);
  const [timeFormat, setTimeFormat] = useState<'absolute' | 'relative'>('absolute');
  const [holders, setHolders] = useState<any[]>([]);
  const [holdersLoading, setHoldersLoading] = useState(false);
  const [pairInfo, setPairInfo] = useState<any>(null);
  const [pairInfoLoading, setPairInfoLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<any>(null);
  const [tokenInfoLoading, setTokenInfoLoading] = useState(false);
  const [protocolType, setProtocolType] = useState<'v1' | 'amm' | null>(null);
  const [traders, setTraders] = useState<any[]>([]);
  const [tradersLoading, setTradersLoading] = useState(false);
  const searchParams = useSearchParams();
  const { subscribeToTrades, isConnected, marketData, fetchRecentTrades } = useMarketData();
  const tradeUnsubscribeRef = useRef<(() => void) | null>(null);

  // Load saved layout preferences
  React.useEffect(() => {
    const savedChartHeight = localStorage.getItem('trading-chart-height');
    const savedRightPanelWidth = localStorage.getItem('trading-right-panel-width');
    const savedTimeFormat = localStorage.getItem('trading-time-format');
    
    if (savedChartHeight) setChartHeight(parseFloat(savedChartHeight));
    if (savedRightPanelWidth) setRightPanelWidth(parseFloat(savedRightPanelWidth));
    if (savedTimeFormat) setTimeFormat(savedTimeFormat as 'absolute' | 'relative');
  }, []);

  const tabs = [
    { id: 'wallets' as const, label: 'WALLETS' },
    { id: 'trades' as const, label: 'TRADES' },
    { id: 'holders-bubble' as const, label: 'HOLDER' },
    { id: 'top-trader' as const, label: 'TOP TRADER' }
  ];

  // Dynamic tab labels
  const getTabLabel = (tabId: string) => {
    if (tabId === 'holders-bubble' && tokenInfo) {
      return `HOLDER (${tokenInfo.numHolders || 0})`;
    }
    return tabs.find(tab => tab.id === tabId)?.label || tabId.toUpperCase();
  };

  const handleTabClick = (tabId: typeof tabs[number]['id']) => {
    setActiveTab(tabId);
    if (currentCoin === 'So11111111111111111111111111111112') return;
    if (tabId === 'holders-bubble') {
      fetchHolders(currentCoin);
    }
    if (tabId === 'top-trader') {
      fetchTraders(currentCoin);
    }
  };

  // Handle coin address from URL params
  React.useEffect(() => {
    const coinParam = searchParams.get('coin');
    if (coinParam) {
      setCurrentCoin(coinParam);
      localStorage.setItem('lastTradingCoin', coinParam);
    } else {
      const lastCoin = localStorage.getItem('lastTradingCoin');
      if (lastCoin) {
        setCurrentCoin(lastCoin);
      }
    }
  }, [searchParams]);

  // Fetch holders, pair info, token info, and traders when coin changes
  React.useEffect(() => {
    if (currentCoin) {
      fetchPairInfo(currentCoin);
      fetchTokenInfo(currentCoin);
      detectProtocol(currentCoin);
      if (currentCoin !== 'So11111111111111111111111111111112') {
        fetchHolders(currentCoin);
        fetchTraders(currentCoin);
      } else {
        setHolders([]);
        setTraders([]);
        setProtocolType(null);
      }
    }
  }, [currentCoin]);

  // Handle trade subscriptions
  React.useEffect(() => {
    console.log(`🔄 TradingTerminal: Coin changed to ${currentCoin}`);

    if (tradeUnsubscribeRef.current) {
      console.log(`🧹 TradingTerminal: Cleaning up previous trade subscription`);
      tradeUnsubscribeRef.current();
      tradeUnsubscribeRef.current = null;
    }

    setRecentTrades([]);

    if (currentCoin === 'So11111111111111111111111111111112') {
      console.log(`⏭️ TradingTerminal: Skipping trade subscription for SOL`);
      return;
    }

    console.log(`📡 TradingTerminal: Subscribing to trades for ${currentCoin}`);
    const unsubscribe = subscribeToTrades(currentCoin, (trade) => {
      console.log(`💰 TradingTerminal: Received trade:`, trade);
      setRecentTrades(prev => {
        const newTrades = [trade, ...prev];
        return newTrades.slice(0, 50);
      });
    });

    tradeUnsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, [currentCoin, subscribeToTrades]);

  // Initial recent trades load
  React.useEffect(() => {
    let cancelled = false;
    if (currentCoin === 'So11111111111111111111111111111112') return;

    (async () => {
      try {
        const initialTrades = await fetchRecentTrades(currentCoin);
        if (!cancelled) {
          setRecentTrades(initialTrades);
        }
      } catch (error) {
        console.warn('Failed to load initial trades:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentCoin, fetchRecentTrades]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const container = document.querySelector('[data-terminal-container]') as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newWidth = ((rect.right - e.clientX) / rect.width) * 100;
    const constrainedWidth = Math.max(15, Math.min(40, newWidth));
    setRightPanelWidth(constrainedWidth);
  }, [isResizing]);

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  const handleVerticalMouseDown = (e: React.MouseEvent) => {
    setIsResizingVertical(true);
    e.preventDefault();
  };

  const handleVerticalMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizingVertical) return;
    const container = document.querySelector('[data-terminal-container]') as HTMLElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const newHeight = ((e.clientY - rect.top) / rect.height) * 100;
    const constrainedHeight = Math.max(30, Math.min(80, newHeight));
    setChartHeight(constrainedHeight);
  }, [isResizingVertical]);

  const handleVerticalMouseUp = () => {
    setIsResizingVertical(false);
    localStorage.setItem('trading-chart-height', chartHeight.toString());
  };

  const handleMouseUpHorizontal = () => {
    setIsResizing(false);
    localStorage.setItem('trading-right-panel-width', rightPanelWidth.toString());
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const toggleTimeFormat = () => {
    const newFormat = timeFormat === 'absolute' ? 'relative' : 'absolute';
    setTimeFormat(newFormat);
    localStorage.setItem('trading-time-format', newFormat);
  };

  const formatCompact = (value: number | null | undefined, decimals = 1) => {
    if (value == null || isNaN(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(decimals)}b`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}m`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(decimals)}k`;
    return value.toFixed(decimals);
  };

  const fetchHolders = async (tokenAddress: string) => {
    if (tokenAddress === 'So11111111111111111111111111111112') return; // Skip for SOL

    setHoldersLoading(true);
    try {
      // First resolve the pair address
      const pairAddress = await resolvePairAddress(tokenAddress);
      if (!pairAddress) {
        console.warn('Could not resolve pair address for holders');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL || 'http://localhost:8082'}/api/holders?pairAddress=${pairAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.holders)) {
        setHolders(data.holders);
      }
    } catch (error) {
      console.warn('Failed to fetch holders:', error);
      setHolders([]);
    } finally {
      setHoldersLoading(false);
    }
  };

  const fetchPairInfo = async (tokenAddress: string) => {
    if (tokenAddress === 'So11111111111111111111111111111112') {
      // For SOL, set basic info
      setPairInfo({
        tokenName: 'Solana',
        tokenTicker: 'SOL',
        tokenAddress: 'So11111111111111111111111111111112',
        marketCapSol: 0, // Will be calculated from market data
        supply: 0
      });
      return;
    }

    setPairInfoLoading(true);
    try {
      // First resolve the pair address
      const pairAddress = await resolvePairAddress(tokenAddress);
      if (!pairAddress) {
        console.warn('Could not resolve pair address for pair info');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL || 'http://localhost:8082'}/api/pair-info?pairAddress=${pairAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.pairInfo) {
        const info = data.pairInfo;
        const normalized = {
          tokenName: info.tokenName || info.token_name,
          tokenTicker: info.tokenTicker || info.token_ticker,
          tokenImage: info.tokenImage || info.token_image,
          tokenDecimals: info.tokenDecimals ?? info.token_decimals ?? 6,
          marketCapSol: info.marketCapSol ?? info.market_cap_sol ?? 0,
          supply: info.supply ?? info.total_supply ?? 0,
          dexPaid: info.dexPaid ?? info.dex_paid ?? false,
          feeVolumeSol: info.feeVolumeSol ?? info.fee_volume_sol ?? 0,
          pairAddress: info.pairAddress || info.pair_address || pairAddress
        };
        setPairInfo(normalized);
      }
    } catch (error) {
      console.warn('Failed to fetch pair info:', error);
      setPairInfo(null);
    } finally {
      setPairInfoLoading(false);
    }
  };

  const fetchTokenInfo = async (tokenAddress: string) => {
    if (tokenAddress === 'So11111111111111111111111111111112') {
      // For SOL, set basic info
      setTokenInfo({
        numHolders: 0,
        numBotUsers: 0,
        top10HoldersPercent: 0,
        devHoldsPercent: 0,
        insidersHoldPercent: 0,
        bundlersHoldPercent: 0,
        snipersHoldPercent: 0,
        dexPaid: false,
        dexPaidTime: null,
        totalPairFeesPaid: 0
      });
      return;
    }

    setTokenInfoLoading(true);
    try {
      // First resolve the pair address
      const pairAddress = await resolvePairAddress(tokenAddress);
      if (!pairAddress) {
        console.warn('Could not resolve pair address for token info');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL || 'http://localhost:8082'}/api/token-info?pairAddress=${pairAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.tokenInfo) {
        const info = data.tokenInfo.raw || data.tokenInfo; // support normalized+raw shape
        const normalized = {
          numHolders: info.numHolders ?? info.holdersCount ?? info.holders_count ?? info.num_holders,
          numBotUsers: info.numBotUsers ?? info.botTradesPercent ?? info.num_bot_users,
          top10HoldersPercent: info.top10HoldersPercent ?? info.top_10_holders,
          devHoldsPercent: info.devHoldsPercent ?? info.dev_holds_percent,
          insidersHoldPercent: info.insidersHoldPercent ?? info.insiders_hold_percent,
          bundlersHoldPercent: info.bundlersHoldPercent ?? info.bundlers_hold_percent,
          snipersHoldPercent: info.snipersHoldPercent ?? info.snipers_hold_percent,
          dexPaid: info.dexPaid ?? info.dex_paid ?? false,
          dexPaidTime: info.dexPaidTime ?? info.dex_paid_time ?? null,
          totalPairFeesPaid: info.totalPairFeesPaid ?? info.total_pair_fees_paid ?? info.totalPairFees ?? info.total_pair_fees ?? 0,
          totalSupply: info.totalSupply ?? info.total_supply
        };
        setTokenInfo(normalized);
      }
    } catch (error) {
      console.warn('Failed to fetch token info:', error);
      setTokenInfo(null);
    } finally {
      setTokenInfoLoading(false);
    }
  };

  // Poll token metrics periodically (every 10s)
  React.useEffect(() => {
    if (!currentCoin || currentCoin === 'So11111111111111111111111111111112') return;

    const interval = setInterval(() => {
      fetchTokenInfo(currentCoin);
    }, 10_000);

    return () => clearInterval(interval);
  }, [currentCoin, fetchTokenInfo]);

  const fetchTraders = async (tokenAddress: string) => {
    if (tokenAddress === 'So11111111111111111111111111111112') return; // Skip for SOL

    setTradersLoading(true);
    try {
      // First resolve the pair address
      const pairAddress = await resolvePairAddress(tokenAddress);
      if (!pairAddress) {
        console.warn('Could not resolve pair address for traders');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL || 'http://localhost:8082'}/api/top-traders?pairAddress=${pairAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.traders)) {
        setTraders(data.traders);
      }
    } catch (error) {
      console.warn('Failed to fetch traders:', error);
      setTraders([]);
    } finally {
      setTradersLoading(false);
    }
  };

  const resolvePairAddress = async (tokenAddress: string) => {
    try {
      // Check if we have it in market data first
      const allTokens = [
        ...(marketData?.trending || []),
        ...(marketData?.finalStretch || []),
        ...(marketData?.migrated || []),
        ...(marketData?.newMint || []),
      ];

      const token = allTokens.find(t => t.tokenAddress === tokenAddress);
      if (token) {
        // For migrated tokens, migratedTo contains the pair address
        if (token.migratedTo) {
          return token.migratedTo;
        }
        // For other tokens, we might not have the pair address in the normalized data
        // Fall back to pump.fun API
      }

      // Fallback to pump.fun API
      const response = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenAddress}`);
      if (response.ok) {
        const data = await response.json();
        return data.pump_swap_pool || data.bonding_curve;
      }
    } catch (error) {
      console.warn('Failed to resolve pair address:', error);
    }
    return null;
  };

  const detectProtocol = async (tokenAddress: string) => {
    if (tokenAddress === 'So11111111111111111111111111111112') {
      setProtocolType(null);
      return;
    }
    try {
      const response = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenAddress}`);
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data?.pump_swap_pool) {
        setProtocolType('amm');
      } else {
        setProtocolType('v1');
      }
    } catch {
      // ignore detection errors
    }
  };

  const currentTokenInfo = React.useMemo(() => {
    const allTokens = [
      ...(marketData?.trending || []),
      ...(marketData?.finalStretch || []),
      ...(marketData?.migrated || []),
      ...(marketData?.newMint || []),
    ];
    return allTokens.find((t) => t.tokenAddress === currentCoin) || null;
  }, [marketData, currentCoin]);

  const currentPriceUsd = React.useMemo(() => {
    if (currentCoin === 'So11111111111111111111111111111112') {
      return marketData?.solPrice || null;
    }
    const latestTrade = recentTrades[0];
    if (latestTrade) {
      const fromTrade =
        latestTrade.usdPricePerToken ??
        (marketData?.solPrice ? latestTrade.spotPriceSol * marketData.solPrice : null);
      if (fromTrade && !Number.isNaN(fromTrade)) {
        return fromTrade;
      }
    }
    return null;
  }, [currentCoin, recentTrades, marketData]);

  const currentMarketCapUsd = React.useMemo(() => {
    const supply =
      (currentTokenInfo as any)?.totalSupply ??
      pairInfo?.supply ??
      tokenInfo?.totalSupply ??
      tokenInfo?.total_supply ??
      1_000_000_000; // default Pump.fun supply
    if (!currentPriceUsd || !supply) return null;
    const mc = currentPriceUsd * supply;
    return Number.isFinite(mc) ? mc : null;
  }, [currentPriceUsd, currentTokenInfo, tokenInfo]);

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUpHorizontal);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else if (isResizingVertical) {
      document.addEventListener('mousemove', handleVerticalMouseMove);
      document.addEventListener('mouseup', handleVerticalMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUpHorizontal);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mouseup', handleVerticalMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUpHorizontal);
      document.removeEventListener('mousemove', handleVerticalMouseMove);
      document.removeEventListener('mouseup', handleVerticalMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, isResizingVertical, handleMouseMove, handleVerticalMouseMove]);

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <PageHeader currentPage="terminal" operator={operator} />

      {/* Top Bar - COIN INFO + Token Metrics (single block) */}
      <div className="border-b border-green-500/30 bg-black/70 backdrop-blur-sm">
        <div className="p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-1 w-2 h-2 rounded-full bg-green-300 shadow-[0_0_10px_rgba(74,222,128,0.6)] flex-shrink-0" />
              {pairInfo?.tokenImage && (
                <img
                  src={pairInfo.tokenImage}
                  alt={pairInfo.tokenName || pairInfo.tokenTicker}
                  className="w-10 h-10 rounded border border-green-500/30 object-cover flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="text-green-100 font-bold text-lg font-mono truncate">
                    {pairInfo
                      ? pairInfo.tokenName
                        ? `${pairInfo.tokenName} (${pairInfo.tokenTicker})`
                        : pairInfo.tokenTicker || (currentCoin === 'So11111111111111111111111111111112' ? 'SOL' : `${currentCoin.slice(0, 8)}...`)
                      : currentCoin === 'So11111111111111111111111111111112'
                        ? 'SOL /USD'
                        : `${currentCoin.slice(0, 8)}...`}
                  </div>
                  <div className="px-3 py-1 rounded border border-green-500/40 bg-green-500/10 text-green-100 text-sm font-mono whitespace-nowrap">
                    {pairInfoLoading ? '...' : currentMarketCapUsd ? `$${formatCompact(currentMarketCapUsd, 2)}` : '$—'}
                  </div>
                </div>
                {currentCoin && currentCoin !== 'So11111111111111111111111111111112' && (
                  <div className="flex items-center gap-2 text-xs text-green-200 font-mono">
                    <button
                      type="button"
                      className="px-2 py-1 rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 transition-colors"
                      onClick={() => navigator.clipboard?.writeText(currentCoin)}
                      title="Copy token address"
                    >
                      {currentCoin}
                    </button>
                    <a
                      href={
                        protocolType === 'amm'
                          ? `https://pump.fun/amm/${currentCoin}`
                          : `https://pump.fun/coin/${currentCoin}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 px-2 py-1 rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 transition-colors text-green-100"
                    >
                      <img
                        src={protocolType === 'amm' ? '/logos/pumpswap.svg' : '/logos/pumpfun.svg'}
                        alt="protocol"
                        className="w-4 h-4"
                      />
                      <span className="text-xs uppercase">{protocolType === 'amm' ? 'PUMP AMM' : 'PUMP V1'}</span>
                    </a>
                  </div>
                )}
              </div>
            </div>

            {tokenInfo && (
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 text-[11px] sm:text-xs font-mono">
                <span className="px-2 py-1 rounded border border-green-500/30 bg-black/60 text-green-100 flex items-center gap-1">
                  <span className="text-green-200/90">Top 10</span>
                  <span className="text-green-100 font-semibold">{tokenInfo.top10HoldersPercent?.toFixed(1) || 0}%</span>
                </span>
                <span className="px-2 py-1 rounded border border-green-500/30 bg-black/60 text-green-100 flex items-center gap-1">
                  <span className="text-green-200/90">Bundlers</span>
                  <span className="text-green-100 font-semibold">{tokenInfo.bundlersHoldPercent?.toFixed(1) || 0}%</span>
                </span>
                <span className="px-2 py-1 rounded border border-green-500/30 bg-black/60 text-green-100 flex items-center gap-1">
                  <span className="text-green-200/90">Insiders</span>
                  <span className="text-green-100 font-semibold">{tokenInfo.insidersHoldPercent?.toFixed(1) || 0}%</span>
                </span>
                <span className="px-2 py-1 rounded border border-green-500/30 bg-black/60 text-green-100 flex items-center gap-1">
                  <span className="text-green-200/90">Bots</span>
                  <span className="text-green-100 font-semibold">{tokenInfo.numBotUsers || 0}</span>
                </span>
                <span className="px-2 py-1 rounded border border-green-500/30 bg-black/60 text-green-100 flex items-center gap-1">
                  <span className="text-green-200/90">DEX Paid</span>
                  <span className={tokenInfo.dexPaid ? 'text-green-100 font-semibold' : 'text-red-300 font-semibold'}>
                    {tokenInfo.dexPaid ? '✓' : '✗'}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

       {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0" data-terminal-container>
        {/* Left Panel */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chart Area */}
          <div
            className="border-b border-green-500/20 bg-gradient-to-br from-black via-black/95 to-green-900/10 relative overflow-hidden flex-shrink-0"
            style={{ height: `${chartHeight}%` }}
          >
            <iframe
              key={currentCoin}
              src={`https://birdeye.so/tv-widget/${currentCoin}?chain=solana&viewMode=pair&chartInterval=1&chartType=Candle&chartTimezone=Asia%2FBangkok&chartLeftToolbar=show&theme=dark`}
              className="absolute top-0 left-0 w-full h-full rounded-md z-[1]"
              style={{ border: 'none' }}
              title="Trading Chart"
            ></iframe>
            {(isResizingVertical || isResizing) && (
              <div className="absolute inset-0 z-[2] cursor-row-resize" />
            )}
          </div>

          {/* Splitter */}
          <div
            className="w-full h-1 bg-green-500/30 hover:bg-green-500/50 cursor-row-resize transition-colors relative group flex-shrink-0"
            onMouseDown={handleVerticalMouseDown}
          >
            <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2 flex justify-center">
              <div className="w-8 h-0.5 bg-green-500/60 group-hover:bg-green-400 transition-colors"></div>
            </div>
          </div>

          {/* Bottom Section */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-green-500/20 bg-black/30 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => handleTabClick(tab.id)}
                      className={`px-4 py-2 text-xs font-mono font-semibold border-r border-green-500/20 transition-all duration-200 relative ${
                        activeTab === tab.id
                          ? 'bg-green-500/15 text-green-300 border-b-2 border-green-400 shadow-inner'
                          : 'text-green-400/70 hover:text-green-300 hover:bg-green-500/5'
                      }`}
                    >
    <span className="opacity-60 mr-1">[</span>
    {getTabLabel(tab.id)}
    <span className="opacity-60 ml-1">]</span>
                      {activeTab === tab.id && (
                        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-2 h-0.5 bg-green-400"></div>
                      )}
                    </button>
                  ))}
                </div>
                {activeTab === 'trades' && (
                  <div className="px-4">
                    <span className={`text-xs font-mono ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                      {isConnected ? '● LIVE' : '● OFFLINE'}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 p-2 bg-black/30 min-h-0 overflow-hidden flex flex-col max-h-[60vh]">
              {activeTab === 'trades' ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {currentCoin === 'So11111111111111111111111111111112' ? (
                    <div className="text-center text-green-500/60 py-8">
                      <div className="text-green-500/40 font-mono text-sm">
                        Trade data not available for SOL
                      </div>
                    </div>
                  ) : recentTrades.length === 0 ? (
                    <div className="text-center text-green-500/60 py-8">
                      <div className="text-green-500/40 font-mono text-sm">
                        {isConnected ? 'Waiting for trades...' : 'Connect to market relay for live trades'}
                      </div>
                    </div>
                  ) : (
                     <div className="flex-1 overflow-y-auto border border-green-500/20 rounded min-h-0 max-h-[45vh] p-0">
                       <table className="w-full text-xs font-mono">
                        <thead className="bg-black/95 text-green-300 sticky top-0 z-10 backdrop-blur-sm">
                          <tr className="text-left border-b border-green-500/30">
                            <th className="px-3 py-2 cursor-pointer hover:text-green-200" onClick={toggleTimeFormat}>
                              Time {timeFormat === 'relative' ? '(Ago)' : ''}
                            </th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">MC (USD)</th>
                            <th className="px-3 py-2">Amount</th>
                            <th className="px-3 py-2">Total (SOL / USD)</th>
                            <th className="px-3 py-2">Address</th>
                            <th className="px-3 py-2">Tx</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-green-500/20">
                          {recentTrades.map((trade, index) => (
                            <tr 
                              key={`${trade.txId}-${index}`} 
                              className={`${
                                trade.type === 'buy' 
                                  ? 'bg-green-500/5 hover:bg-green-500/10' 
                                  : 'bg-red-500/5 hover:bg-red-500/10'
                              } transition-colors`}
                            >
                              <td className="px-3 py-2 whitespace-nowrap text-gray-400">
                                {timeFormat === 'absolute' 
                                  ? new Date(trade.timestamp).toLocaleTimeString()
                                  : formatTimeAgo(trade.timestamp)
                                }
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className={`font-bold ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                                  {trade.type.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-100 font-medium">
                                {(() => {
                                  const pricePerTokenUsd =
                                    trade.usdPricePerToken ??
                                    (marketData?.solPrice ? trade.spotPriceSol * marketData.solPrice : null);
                                   const totalSupply = 1_000_000_000; // Default supply for calculations
                                  const mcUsd =
                                    pricePerTokenUsd != null && totalSupply != null
                                      ? pricePerTokenUsd * totalSupply
                                      : null;
                                  return mcUsd != null ? `$${formatCompact(mcUsd, 2)}` : '—';
                                })()}
                              </td>
                              <td className={`px-3 py-2 whitespace-nowrap font-semibold ${
                                trade.type === 'buy' ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {formatCompact(trade.tokenAmount, 2)}
                              </td>
                              <td className={`px-3 py-2 whitespace-nowrap font-medium ${
                                trade.type === 'buy' ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {`${trade.solAmount.toFixed(4)} / $${trade.usdAmount.toFixed(2)}`}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-200 hover:text-white cursor-pointer transition-colors">
                                {trade.wallet.slice(0, 6)}...{trade.wallet.slice(-4)}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-200 hover:text-white cursor-pointer transition-colors">
                                {trade.txId.slice(0, 6)}...{trade.txId.slice(-4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
               ) : activeTab === 'holders-bubble' ? (
                 <div className="flex-1 flex flex-col min-h-0">
                   <div className="flex-1 flex gap-4 min-h-0">
                     {/* Holders Section */}
                     <div className="flex-1 border border-green-500/20 rounded overflow-hidden flex flex-col">
                       <div className="px-4 py-2 border-b border-green-500/20 bg-green-500/5 flex-shrink-0">
                         <h3 className="text-green-300 font-mono font-semibold text-sm">
                           HOLDERS {tokenInfo ? `(${tokenInfo.numHolders || 0})` : ''}
                         </h3>
                       </div>
                       <div className="flex-1 overflow-y-auto max-h-[40vh] p-0">
                         {holdersLoading ? (
                           <div className="p-4 text-center text-green-500/60">
                             <div className="text-green-500/40 font-mono text-sm">
                               Loading holders...
                             </div>
                           </div>
                         ) : holders.length === 0 ? (
                           <div className="p-4 text-center text-green-500/60">
                             <div className="text-green-500/40 font-mono text-sm">
                               {currentCoin === 'So11111111111111111111111111111112' ? 'Holder data not available for SOL' : 'No holder data available'}
                             </div>
                           </div>
                         ) : (
                           <table className="w-full text-xs font-mono">
                             <thead className="bg-green-500/10 sticky top-0 z-10">
                               <tr className="text-left border-b border-green-500/20">
                                 <th className="px-3 py-2">Wallet</th>
                                 <th className="px-3 py-2">Tokens</th>
                                 <th className="px-3 py-2">SOL</th>
                                 <th className="px-3 py-2">% of Supply</th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-green-500/10">
                               {holders.slice(0, 20).map((holder, index) => {
                                  const totalSupply = 1_000_000_000; // Default supply for calculations
                                 const percentage = ((holder.tokenBalance / totalSupply) * 100).toFixed(2);
                                 return (
                                   <tr key={holder.walletAddress} className="hover:bg-green-500/5">
                                     <td className="px-3 py-2 whitespace-nowrap text-green-300/70 font-mono">
                                       <span className="inline-flex items-center">
                                         {holder.walletAddress.slice(0, 6)}...{holder.walletAddress.slice(-4)}
                                         {holder.isInsider && <span className="ml-1 text-yellow-400 inline-block">{CustomIcons.insider}</span>}
                                         {holder.isBundler && <span className="ml-1 text-red-400 inline-block">{CustomIcons.bundler}</span>}
                                       </span>
                                     </td>
                                     <td className="px-3 py-2 whitespace-nowrap text-green-400 font-semibold">
                                       {formatCompact(holder.tokenBalance, 1)}
                                     </td>
                                     <td className="px-3 py-2 whitespace-nowrap text-green-300">
                                       {holder.solBalance.toFixed(3)}
                                     </td>
                                     <td className="px-3 py-2 whitespace-nowrap text-green-300/80">
                                       {percentage}%
                                     </td>
                                   </tr>
                                 );
                               })}
                             </tbody>
                           </table>
                         )}
                       </div>
                     </div>

                     {/* Bubble Map Section */}
                     <div className="flex-1 border border-green-500/20 rounded overflow-hidden">
                       <iframe
                         src={`https://app.insightx.network/bubblemaps/solana/${currentCoin}`}
                         className="w-full h-full"
                         style={{ border: 'none' }}
                         title="Bubble Map"
                       />
                     </div>
                   </div>
                 </div>
               ) : activeTab === 'top-trader' ? (
                 <div className="flex-1 flex flex-col min-h-0">
                   {tradersLoading ? (
                     <div className="text-center text-green-500/60 py-8">
                       <div className="text-green-500/40 font-mono text-sm">
                         Loading top traders...
                       </div>
                     </div>
                   ) : traders.length === 0 ? (
                     <div className="text-center text-green-500/60 py-8">
                       <div className="text-green-500/40 font-mono text-sm">
                         {currentCoin === 'So11111111111111111111111111111112' ? 'Top traders not available for SOL' : 'No trader data available'}
                       </div>
                     </div>
                   ) : (
                     <div className="flex-1 overflow-y-auto border border-green-500/20 rounded min-h-0 max-h-[50vh] p-0">
                       <table className="w-full text-xs font-mono">
                         <thead className="bg-green-500/10 sticky top-0 z-10">
                           <tr className="text-left border-b border-green-500/20">
                             <th className="px-3 py-2">Wallet</th>
                             <th className="px-3 py-2">Buys</th>
                             <th className="px-3 py-2">Sells</th>
                             <th className="px-3 py-2">Tokens Bought</th>
                             <th className="px-3 py-2">Tokens Sold</th>
                             <th className="px-3 py-2">SOL Invested</th>
                             <th className="px-3 py-2">SOL Sold</th>
                             <th className="px-3 py-2">PnL (USD)</th>
                           </tr>
                         </thead>
                         <tbody className="divide-y divide-green-500/10">
                           {traders.slice(0, 20).map((trader, index) => {
                             const pnl = trader.usdSold - trader.usdInvested;
                             return (
                               <tr key={trader.walletAddress} className="hover:bg-green-500/5">
                                 <td className="px-3 py-2 whitespace-nowrap text-green-300/70 font-mono">
                                   <span className="inline-flex items-center">
                                     {trader.walletAddress.slice(0, 6)}...{trader.walletAddress.slice(-4)}
                                     {trader.isInsider && <span className="ml-1 text-yellow-400 inline-block">{CustomIcons.insider}</span>}
                                     {trader.isBundler && <span className="ml-1 text-red-400 inline-block">{CustomIcons.bundler}</span>}
                                     {trader.isSniper && <span className="ml-1 text-red-400 inline-block">{CustomIcons.sniper}</span>}
                                   </span>
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-green-400 font-semibold">
                                   {trader.buyTransactions}
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-red-400 font-semibold">
                                   {trader.sellTransactions}
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-green-300">
                                   {formatCompact(trader.tokensBought, 1)}
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-red-300">
                                   {formatCompact(trader.tokensSold, 1)}
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-green-300">
                                   {trader.solInvested.toFixed(2)} ◎
                                 </td>
                                 <td className="px-3 py-2 whitespace-nowrap text-red-300">
                                   {trader.solSold.toFixed(2)} ◎
                                 </td>
                                 <td className={`px-3 py-2 whitespace-nowrap font-semibold ${
                                   pnl >= 0 ? 'text-green-400' : 'text-red-400'
                                 }`}>
                                   {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                                 </td>
                               </tr>
                             );
                           })}
                         </tbody>
                       </table>
                     </div>
                   )}
                 </div>
              ) : activeTab === 'wallets' ? (
                <div className="relative flex-1 flex items-center justify-center border border-green-500/20 rounded bg-black/40">
                  <div className="text-center text-green-500/60 py-8 space-y-3">
                    <div className="text-green-300 font-mono text-lg mb-2">[ WALLETS ]</div>
                    <button
                      className="px-4 py-2 border border-green-500/40 rounded bg-green-500/10 text-green-100 font-mono text-sm hover:bg-green-500/20 transition-colors"
                      onClick={() => {/* hook up wallet setup later */}}
                    >
                      Setup Wallet
                    </button>
                  </div>
                  {showBetaOverlay && (
                    <div className="absolute inset-0 bg-green-500/20 backdrop-blur-sm border border-green-500/30 rounded flex flex-col items-center justify-center p-4 text-center space-y-3">
                      <div className="text-green-50 font-mono text-base">Public beta opening soon</div>
                      <div className="text-green-100/90 text-xs font-mono">Register now to unlock wallet tools.</div>
                      <a
                        href="https://t.me/a_trade_dot_fun_bot"
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 rounded border border-green-300 bg-green-500/30 text-green-50 text-sm font-mono hover:bg-green-500/40"
                      >
                        Join Beta
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center text-green-500/60 py-8">
                  <div className="text-green-300 font-mono text-lg mb-2">[ {(activeTab as string).toUpperCase()} ]</div>
                  <div className="text-green-500/40 font-mono text-sm">Content coming soon</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 bg-green-500/30 hover:bg-green-500/50 cursor-col-resize transition-colors relative group"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 flex items-center">
            <div className="w-0.5 h-8 bg-green-500/60 group-hover:bg-green-400 transition-colors"></div>
          </div>
        </div>

        {/* Right Panel */}
        <div
          className="bg-black/20 overflow-hidden flex"
          style={{ width: `${rightPanelWidth}%` }}
        >
          <div className="p-4 space-y-4 relative flex-1">
            <div className="border border-green-500/20 rounded-lg bg-black/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-green-200 font-mono font-semibold">Quick Trade</span>
                <div className="flex gap-2 text-xs font-mono">
                  <button
                    className={`px-2 py-1 rounded border ${tradeMode === 'buy' ? 'bg-green-500/20 border-green-400 text-green-100' : 'border-green-500/30 text-green-300 hover:bg-green-500/10'}`}
                    onClick={() => setTradeMode('buy')}
                  >
                    BUY
                  </button>
                  <button
                    className={`px-2 py-1 rounded border ${tradeMode === 'sell' ? 'bg-red-500/20 border-red-400 text-red-100' : 'border-green-500/30 text-green-300 hover:bg-red-500/10'}`}
                    onClick={() => setTradeMode('sell')}
                  >
                    SELL
                  </button>
                </div>
              </div>

              <div className="space-y-3 text-sm font-mono text-green-100">
                <div className="flex flex-col gap-2">
                  <label className="text-green-300/80">Amount (SOL)</label>
                  <input
                    value={tradeSolAmount}
                    onChange={(e) => setTradeSolAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-green-500/30 bg-black/60 px-3 py-2 text-green-100 placeholder:text-green-500/40 focus:outline-none focus:border-green-400"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-green-300/80">Amount (Token)</label>
                  <input
                    value={tradeTokenAmount}
                    onChange={(e) => setTradeTokenAmount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded border border-green-500/30 bg-black/60 px-3 py-2 text-green-100 placeholder:text-green-500/40 focus:outline-none focus:border-green-400"
                  />
                </div>
                <div className="text-xs text-green-300/70">
                  Price (est): {currentPriceUsd ? `$${currentPriceUsd.toFixed(6)}` : '—'}
                </div>
                <button
                  className={`w-full py-2 rounded border font-semibold transition-colors ${
                    tradeMode === 'buy'
                      ? 'bg-green-500/20 border-green-400 text-green-100 hover:bg-green-500/30'
                      : 'bg-red-500/20 border-red-400 text-red-100 hover:bg-red-500/30'
                  }`}
                  onClick={() => {/* hook up actual trade action later */}}
                >
                  {tradeMode === 'buy' ? 'Confirm Buy' : 'Confirm Sell'}
                </button>
                <div className="text-[11px] text-green-500/60">
                  Quick trade is a preview. Wire up execution flow to relay when ready.
                </div>
              </div>
            </div>
            {showBetaOverlay && (
              <div className="absolute inset-0 bg-green-500/20 backdrop-blur-sm border border-green-500/30 rounded-lg flex flex-col items-center justify-center p-4 text-center space-y-3">
                <div className="text-green-50 font-mono text-base">Early access</div>
                <div className="text-green-100/90 text-xs font-mono">Register to unlock trading controls.</div>
                <a
                  href="https://t.me/a_trade_dot_fun_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded border border-green-300 bg-green-500/30 text-green-50 text-sm font-mono hover:bg-green-500/40"
                >
                  Join Beta
                </a>
              </div>
            )}
          </div>
        </div>
      </div>


    </div>
  );
};

export default TradingTerminal;
