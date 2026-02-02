"use client";

import React, { useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { useMarketData, TradeData } from "@/hooks/useMarketData";
import LadderBuyModal from "./LadderBuyModal";
import LadderSellModal from "./LadderSellModal";
import BundleBuyModal from "./BundleBuyModal";
import GatherSolModal from "./GatherSolModal";
import DistributeSolModal from "./DistributeSolModal";
import WarmUpWalletModal from "./WarmUpWalletModal";

const MARKET_RELAY_API_URL =
  process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://token-api.a-trade.fun' : 'http://localhost:8082');
const MARKET_RELAY_API_KEY =
  process.env.NEXT_PUBLIC_MARKET_RELAY_API_KEY ||
  'f9f41681-2936-44fc-8fb2-397310e7aef6';
const INSIGHTX_API_KEY =
  process.env.NEXT_PUBLIC_INSIGHTX_API_KEY ||
  'f9f41681-2936-44fc-8fb2-397310e7aef6';

// Custom Icons for Terminal
const CustomIcons = {
  insider: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <path d="M5 16L3 5l3.5 2L12 3l5.5 4L21 5l-2 11H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),

  bundler: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
      <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" strokeWidth="2" />
      <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),

  sniper: (
    <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="2" />
      <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="2" />
      <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),

  slippage: (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
      <path d="M3 12h18M3 12l3-3m-3 3l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 8l2-2 2 2M9 16l2 2 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 6v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
};

type OperatorProps = {
  accountId: string;
  userTier: string;
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
  const [tradePercentage, setTradePercentage] = useState<string>('');
  const [slippage, setSlippage] = useState<string>('5'); // Default 5% slippage
  const [useJito, setUseJito] = useState<boolean>(true); // Default Jito enabled
  const [jitoTip, setJitoTip] = useState<number | null>(null);
  const [showSlippageTooltip, setShowSlippageTooltip] = useState(false);

  // Ladder Buy modal state
  const [showLadderBuyModal, setShowLadderBuyModal] = useState(false);
  const [showLadderSellModal, setShowLadderSellModal] = useState(false);
  const [showBundleBuyModal, setShowBundleBuyModal] = useState(false);
  const [showGatherSolModal, setShowGatherSolModal] = useState(false);
  const [showDistributeSolModal, setShowDistributeSolModal] = useState(false);
  const [showWarmUpWalletModal, setShowWarmUpWalletModal] = useState(false);

  // Minimized modal tracking for positioning
  const [minimizedModals, setMinimizedModals] = useState<Set<string>>(new Set());

  // Minimize/Restore handlers for dynamic positioning
  const handleLadderBuyMinimize = () => {
    setMinimizedModals(prev => new Set([...prev, 'ladderBuy']));
  };
  const handleLadderBuyRestore = () => {
    setMinimizedModals(prev => {
      const newSet = new Set(prev);
      newSet.delete('ladderBuy');
      return newSet;
    });
  };
  const handleLadderSellMinimize = () => {
    setMinimizedModals(prev => new Set([...prev, 'ladderSell']));
  };
  const handleLadderSellRestore = () => {
    setMinimizedModals(prev => {
      const newSet = new Set(prev);
      newSet.delete('ladderSell');
      return newSet;
    });
  };
  const handleBundleBuyMinimize = () => {
    setMinimizedModals(prev => new Set([...prev, 'bundleBuy']));
  };
  const handleBundleBuyRestore = () => {
    setMinimizedModals(prev => {
      const newSet = new Set(prev);
      newSet.delete('bundleBuy');
      return newSet;
    });
  };
  const handleGatherSolMinimize = () => {
    setMinimizedModals(prev => new Set([...prev, 'gatherSol']));
  };
  const handleGatherSolRestore = () => {
    setMinimizedModals(prev => {
      const newSet = new Set(prev);
      newSet.delete('gatherSol');
      return newSet;
    });
  };
  const handleDistributeSolMinimize = () => {
    setMinimizedModals(prev => new Set([...prev, 'distributeSol']));
  };
  const handleDistributeSolRestore = () => {
    setMinimizedModals(prev => {
      const newSet = new Set(prev);
      newSet.delete('distributeSol');
      return newSet;
    });
  };
  const handleWarmUpWalletMinimize = () => {
    setMinimizedModals(prev => new Set([...prev, 'warmUpWallet']));
  };
  const handleWarmUpWalletRestore = () => {
    setMinimizedModals(prev => {
      const newSet = new Set(prev);
      newSet.delete('warmUpWallet');
      return newSet;
    });
  };

  // Calculate position index for each modal
  const getPositionIndex = (modalType: string) => {
    const minimizedArray = Array.from(minimizedModals);
    return minimizedArray.indexOf(modalType);
  };

  const [showBetaOverlay, setShowBetaOverlay] = useState(false);
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
  const [connectedWallets, setConnectedWallets] = useState<any[]>([]);
  const [walletConnectionStatus, setWalletConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [multiWalletProcessing, setMultiWalletProcessing] = useState<{
    active: boolean;
    currentWallet: string | null;
    remainingWallets: string[];
    completedWallets: string[];
    failedWallets: string[];
  }>({
    active: false,
    currentWallet: null,
    remainingWallets: [],
    completedWallets: [],
    failedWallets: []
  });
  const [finalStats, setFinalStats] = useState<{
    completed: number;
    failed: number;
    total: number;
  } | null>(null);

  // Solscan URL generator
  const getSolscanUrl = (txSignature: string) => {
    return `https://solscan.io/tx/${txSignature}`;
  };

  // Toast notification function
  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000); // Extended to 3 seconds for links
  };
  const [wssConnection, setWssConnection] = useState<WebSocket | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Redirect to screener if no coin parameter
  if (!searchParams.get('coin')) {
    React.useEffect(() => {
      router.push('/screener');
    }, [router]);
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-green-400 font-mono">
        Redirecting to screener...
      </div>
    );
  }

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

  // Check wallet connection status on mount
  React.useEffect(() => {
    checkWalletConnection();
  }, []);

  // WebSocket connection to WSS server
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    // Only connect if user is logged in
    if (!operator) {
      console.log('🚫 Skipping WSS connection - user not logged in');
      setWalletConnectionStatus('disconnected');
      return;
    }

    const connectToWSS = async () => {
      try {
        // First authenticate via HTTP to get session validation
        const authResponse = await fetch('/api/wallets/authenticate-wss', {
          method: 'POST'
        });

        if (!authResponse.ok) {
          console.error('WSS authentication failed');
          setWalletConnectionStatus('disconnected');
          return;
        }

        const authData = await authResponse.json();

        // Now connect to WebSocket with authenticated session
        const LIGHT_WSS_URL = process.env.NEXT_PUBLIC_LIGHT_WSS_URL ||
          (process.env.NODE_ENV === 'production' ? 'wss://light.a-trade.fun' : 'ws://localhost:4128');
        const ws = new WebSocket(`${LIGHT_WSS_URL}?sessionId=${authData.sessionId}`);

        ws.onopen = () => {
          console.log('🔌 Connected to WSS server');
          setWssConnection(ws);
          setWalletConnectionStatus('connecting'); // Still connecting until authenticated
          console.log('🔄 Set wallet connection status to connecting');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('📥 WSS message:', data);

            if (data.type === 'auth_success') {
              console.log('🔐 WSS authentication successful for', data.clientType);

              // Update Jito Tip if provided
              if (data.jitoTip) {
                setJitoTip(data.jitoTip);
              }

              if (data.clientType === 'terminal') {
                // Don't set to 'connected' yet - wait for wallet data response
                console.log('🔄 Terminal authenticated, requesting wallet data to check wallet client status');
                // Request wallet data immediately to check if wallet client is connected
                const request = {
                  requestId: `auth_${Date.now()}`,
                  currentCoin: currentCoin
                };
                console.log('📤 Requesting wallet data after authentication:', request);
                ws.send(JSON.stringify(request));
              }

            } else if (data.type === 'jito_tip_update') {
              if (data.jitoTip) {
                setJitoTip(data.jitoTip);
              }

            } else if (data.type === 'auth_failed') {
              console.error('🔐 WSS authentication failed:', data.reason);
              setWalletConnectionStatus('disconnected');
              ws.close();

            } else if (data.type === 'wallet_data_response' && data.success) {
              console.log('📥 Received wallet data response:', data);
              const wallets = data.wallets || [];
              setConnectedWallets(wallets);
              console.log('🔄 Updated connectedWallets:', wallets.length, 'wallets');

              if (wallets.length > 0 && selectedWallets.length === 0) {
                setSelectedWallets([wallets[0].id]);
                console.log('🎯 Auto-selected first wallet:', wallets[0].name);
              }

              // Set connection status based on wallet data
              if (wallets.length > 0) {
                setWalletConnectionStatus('connected');
                console.log('🔄 Set wallet connection status to connected (have wallets)');
              } else {
                setWalletConnectionStatus('disconnected');
                console.log('🔄 Set wallet connection status to disconnected (no wallets - wallet client not connected)');
              }
            } else if (data.type === 'wallet_update') {
              console.log('📥 Received wallet update:', data);
              console.log('🔄 Updating wallets from', connectedWallets.length, 'to', data.wallets?.length || 0, 'wallets');

              const previousWallets = connectedWallets;
              const newWallets = data.wallets || [];

              setConnectedWallets(newWallets);

              // Log wallet changes for debugging
              const previousIds = new Set(previousWallets.map((w: any) => w.id));
              const newIds = new Set(newWallets.map((w: any) => w.id));
              const addedWallets = newWallets.filter((w: any) => !previousIds.has(w.id));
              const removedWallets = previousWallets.filter((w: any) => !newIds.has(w.id));

              if (addedWallets.length > 0) {
                console.log('➕ Added wallets:', addedWallets.map((w: any) => `${w.name} (${w.id})`));
              }
              if (removedWallets.length > 0) {
                console.log('➖ Removed wallets:', removedWallets.map((w: any) => `${w.name} (${w.id})`));
              }

              // Update selected wallets - keep only existing ones
              if (newWallets.length > 0) {
                const existingWalletIds = newWallets.map((w: any) => w.id);
                setSelectedWallets(prev => {
                  const filtered = prev.filter(id => existingWalletIds.includes(id));
                  if (filtered.length !== prev.length) {
                    console.log('🔄 Filtered selected wallets from', prev.length, 'to', filtered.length);
                  }
                  return filtered;
                });

                // Auto-select first wallet if none selected
                setSelectedWallets(prev => {
                  if (prev.length === 0 && newWallets.length > 0) {
                    console.log('🎯 Auto-selecting first wallet:', newWallets[0].name);
                    return [newWallets[0].id];
                  }
                  return prev;
                });
              } else {
                console.log('📭 No wallets remaining, clearing selection');
                setSelectedWallets([]);
              }

              // Update connection status based on wallet count
              if (newWallets.length > 0) {
                setWalletConnectionStatus('connected');
                console.log('🔄 Set wallet connection status to connected (received wallet update with wallets)');
              } else {
                setWalletConnectionStatus('disconnected');
                console.log('🔄 Set wallet connection status to disconnected (received wallet update with no wallets)');
              }

              console.log('✅ Wallet update complete. Total wallets:', newWallets.length);
            } else if (data.type === 'wallet_client_disconnected') {
              console.log('🔌 Received wallet client disconnection notification:', data);
              setWalletConnectionStatus('disconnected');
              // Clear wallet data to prevent stale data from being displayed
              setConnectedWallets([]);
              setSelectedWallets([]);
              console.log('🔄 Updated wallet connection status to disconnected and cleared wallet data');
            } else if (data.type === 'wallet_client_connected') {
              console.log('🔌 Received wallet client connection notification:', data);
              // Update connection status to connected
              setWalletConnectionStatus('connected');
              // Request wallet data when wallet client connects
              const request = {
                type: 'wallet_data_request',
                requestId: `refresh_${Date.now()}`,
                currentCoin: currentCoin
              };
              console.log('📤 Requesting wallet data after wallet client connected:', request);
              ws.send(JSON.stringify(request));
            } else if (data.type === 'balance_update') {
              console.log('💰 Received balance update:', data.wallets);
              // Update wallet balances without replacing the entire wallet list
              setConnectedWallets(currentWallets => {
                const updated = currentWallets.map(wallet => {
                  const balanceUpdate = data.wallets.find((update: any) => update.publicKey === wallet.publicKey);
                  if (balanceUpdate) {
                    console.log(`💸 Updating balance for ${wallet.name}: ${balanceUpdate.solBalance} SOL, ${balanceUpdate.splBalance || 0} SPL`);
                    return {
                      ...wallet,
                      solBalance: balanceUpdate.solBalance,
                      splBalance: balanceUpdate.splBalance || 0,
                      lastUpdated: balanceUpdate.lastUpdated
                    };
                  }
                  return wallet;
                });
                console.log('🔄 Updated wallets state:', updated.map(w => ({ name: w.name, sol: w.solBalance, spl: w.splBalance })));
                return updated;
              });
            } else if (data.type === 'transaction_sent') {
              console.log('✅ Transaction sent to Solana:', data.txSignature);

              // Check if this is part of multi-wallet processing
              if (multiWalletProcessing.active && data.walletId === multiWalletProcessing.currentWallet) {
                // Move to next wallet in multi-wallet processing
                setMultiWalletProcessing(prev => {
                  const updated = {
                    ...prev,
                    completedWallets: [...prev.completedWallets, data.walletId],
                    currentWallet: prev.remainingWallets[0] || null,
                    remainingWallets: prev.remainingWallets.slice(1)
                  };

                  // If no more wallets, complete the process
                  if (!updated.currentWallet) {
                    setTimeout(() => {
                      setFinalStats({
                        completed: updated.completedWallets.length,
                        failed: updated.failedWallets.length,
                        total: selectedWallets.length
                      });
                      setMultiWalletProcessing({ ...updated, active: false });
                      setTimeout(() => setFinalStats(null), 4000);
                    }, 500);
                  }

                  return updated;
                });
              } else {
                // Single wallet transaction
                const solscanLink = `<a href="${getSolscanUrl(data.txSignature)}" target="_blank" class="underline hover:text-green-300">[TX]</a>`;
                showToast(`Transaction confirmed ${solscanLink}`);
              }
            } else if (data.type === 'transaction_failed') {
              console.log('❌ Transaction failed:', data.error);

              // Handle multi-wallet failure
              if (multiWalletProcessing.active && data.walletId === multiWalletProcessing.currentWallet) {
                setMultiWalletProcessing(prev => ({
                  ...prev,
                  failedWallets: [...prev.failedWallets, data.walletId],
                  currentWallet: prev.remainingWallets[0] || null,
                  remainingWallets: prev.remainingWallets.slice(1)
                }));
              } else {
                showToast(`❌ Transaction failed: ${data.error}`);
              }
            } else if (data.type === 'nuke_response') {
              if (data.success) {
                showToast(`✅ ${data.message || 'Nuke request processed'}`);
              } else {
                showToast(`❌ Nuke failed: ${data.error}`);
              }
            } else if (data.type === 'nuke_gather_complete') {
              if (data.success) {
                showToast(`✅ Gathered ${data.walletsProcessed} wallets - ${data.message}`);
              } else {
                showToast(`❌ Nuke gather failed: ${data.error}`);
              }
            }
          } catch (error) {
            console.error('Failed to parse WSS message:', error);
          }
        };



        ws.onclose = () => {
          console.log('🔌 Disconnected from WSS server');
          setWssConnection(null);
          setWalletConnectionStatus('disconnected');
          // Clear wallet data on WSS disconnect
          setConnectedWallets([]);
          setSelectedWallets([]);
        };

        ws.onerror = (error) => {
          console.error('WSS connection error:', error);
          setWalletConnectionStatus('disconnected');
          // Clear wallet data on WSS error
          setConnectedWallets([]);
          setSelectedWallets([]);
        };

      } catch (error) {
        console.error('Failed to connect to WSS:', error);
        setWalletConnectionStatus('disconnected');
      }
    };

    connectToWSS();

    // Cleanup on unmount
    return () => {
      if (wssConnection) {
        wssConnection.close();
      }
    };
  }, [operator]);

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

    // Clear wallet state immediately when navigating to prevent stale data
    // This happens before the new coin is set
    if (coinParam && coinParam !== currentCoin) {
      console.log(`🔄 Navigation detected: ${currentCoin} -> ${coinParam}, clearing wallet state`);
      setConnectedWallets([]);
      setSelectedWallets([]);
      setWalletConnectionStatus('disconnected');
    }

    if (coinParam) {
      setCurrentCoin(coinParam);
      localStorage.setItem('lastTradingCoin', coinParam);
    } else {
      const lastCoin = localStorage.getItem('lastTradingCoin');
      if (lastCoin) {
        setCurrentCoin(lastCoin);
      }
    }
  }, [searchParams, currentCoin]);

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

  // Request fresh wallet data when coin changes to ensure we have current wallet connection status
  React.useEffect(() => {
    if (wssConnection && wssConnection.readyState === WebSocket.OPEN && currentCoin) {
      console.log(`🔄 Coin changed to ${currentCoin}, requesting fresh wallet data`);
      const request = {
        type: 'wallet_data_request',
        requestId: `coin_change_${Date.now()}`,
        currentCoin: currentCoin
      };
      wssConnection.send(JSON.stringify(request));
    }
  }, [currentCoin, wssConnection]);

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

  // Send wallet data request when both currentCoin and wallet connection are ready
  React.useEffect(() => {
    console.log('🔄 Wallet request check:', {
      walletConnectionStatus,
      currentCoin,
      wssReady: wssConnection?.readyState === WebSocket.OPEN,
      isNotSOL: currentCoin !== 'So11111111111111111111111111111112'
    });

    if (walletConnectionStatus === 'connected' && currentCoin && wssConnection && wssConnection.readyState === WebSocket.OPEN) {
      // Only send if we haven't already sent a request (avoid duplicates)
      if (currentCoin !== 'So11111111111111111111111111111112') { // Don't send for SOL
        const request = {
          type: 'wallet_data_request',
          requestId: `req_${Date.now()}`,
          currentCoin: currentCoin
        };
        console.log('📤 Sending wallet_data_request after coin update:', request);
        wssConnection.send(JSON.stringify(request));
      } else {
        console.log('⏭️ Skipping wallet request for SOL token');
      }
    }
  }, [currentCoin, walletConnectionStatus, wssConnection]);

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

      const response = await fetch(`${MARKET_RELAY_API_URL}/api/holders?pairAddress=${pairAddress}`, {
        headers: { 'X-API-Key': MARKET_RELAY_API_KEY }
      });
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
    console.log('🔍 fetchPairInfo called for:', tokenAddress);
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
      console.log('🔗 Resolved pair address:', pairAddress);
      if (!pairAddress) {
        console.warn('Could not resolve pair address for pair info');
        return;
      }

      const url = `${MARKET_RELAY_API_URL}/api/pair-info?tokenAddress=${tokenAddress}`;
      console.log('🌐 Fetching pair info from:', url);
      const response = await fetch(url, {
        headers: { 'X-API-Key': MARKET_RELAY_API_KEY }
      });
      console.log('📡 Response status:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('📦 Pair info data:', data);
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
        console.log('✅ Setting pair info:', normalized);
        setPairInfo(normalized);
      } else {
        console.warn('❌ No pair info in response');
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

      const response = await fetch(`${MARKET_RELAY_API_URL}/api/token-info?pairAddress=${pairAddress}`, {
        headers: { 'X-API-Key': MARKET_RELAY_API_KEY }
      });
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

      const response = await fetch(`${MARKET_RELAY_API_URL}/api/top-traders?pairAddress=${pairAddress}`, {
        headers: { 'X-API-Key': MARKET_RELAY_API_KEY }
      });
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
    console.log('🔍 resolvePairAddress called for:', tokenAddress);
    try {
      // Check if we have it in market data first (with proper null checks)
      const allTokens = [
        ...(marketData?.trending ?? []),
        ...(marketData?.finalStretch ?? []),
        ...(marketData?.migrated ?? []),
        ...(marketData?.newMint ?? []),
      ];

      const token = allTokens.find(t => t.tokenAddress === tokenAddress);
      console.log('📊 Token found in market data:', token);
      if (token) {
        // For migrated tokens, migratedTo contains the pair address
        if (token.migratedTo) {
          console.log('🔄 Using migratedTo:', token.migratedTo);
          return token.migratedTo;
        }
        // For other tokens, we might not have the pair address in the normalized data
        // Fall back to pump.fun API
      }

      // Fallback to market-relay API (bypasses CORS)
      const url = `${MARKET_RELAY_API_URL}/api/pair-info?tokenAddress=${tokenAddress}`;
      console.log('🌐 Fetching pair info from market-relay:', url);

      const response = await fetch(url, {
        headers: { 'X-API-Key': MARKET_RELAY_API_KEY }
      });
      console.log('📡 Market-relay response status:', response.status);
      if (response.ok) {
        const result = await response.json();
        console.log('📦 Market-relay data:', result);

        if (result.success && result.pairInfo?.pairAddress) {
          const pairAddress = result.pairInfo.pairAddress;
          console.log('🔄 Using pairAddress from market-relay:', pairAddress);
          return pairAddress;
        } else {
          console.warn('❌ Market-relay API returned invalid data:', result);
        }
      } else {
        console.warn('❌ Market-relay API returned status:', response.status);
      }
    } catch (error) {
      console.warn('Failed to resolve pair address:', error);
    }
    console.log('❌ Could not resolve pair address');
    return null;
  };

  const detectProtocol = async (tokenAddress: string) => {
    if (tokenAddress === 'So11111111111111111111111111111112') {
      setProtocolType(null);
      return;
    }
    try {
      const response = await fetch(`${MARKET_RELAY_API_URL}/api/pumpfun/coins/${tokenAddress}`, {
        headers: { 'X-API-Key': MARKET_RELAY_API_KEY }
      });
      if (!response.ok) {
        return;
      }
      const result = await response.json();
      if (result?.data?.pump_swap_pool) {
        setProtocolType('amm');
      } else {
        setProtocolType('v1');
      }
    } catch {
      // ignore detection errors
    }
  };

  // Wallet connection management
  const checkWalletConnection = async () => {
    try {
      const response = await fetch('/api/wallets/status');
      if (response.ok) {
        const data = await response.json();
        setConnectedWallets(data.wallets || []);
        setWalletConnectionStatus(data.connected ? 'connected' : 'disconnected');
        if (data.wallets && data.wallets.length > 0 && selectedWallets.length === 0) {
          setSelectedWallets([data.wallets[0].id]);
        }
      }
    } catch (error) {
      console.error('Failed to check wallet connection:', error);
      setWalletConnectionStatus('disconnected');
    }
  };

  const connectWalletClient = async () => {
    if (wssConnection && wssConnection.readyState === WebSocket.OPEN) {
      setWalletConnectionStatus('connecting');

      // Request wallet data from WSS server
      const request = {
        type: 'wallet_data_request',
        requestId: `req_${Date.now()}`,
        currentCoin: currentCoin
      };
      console.log('📤 Manual wallet_data_request:', request);
      wssConnection.send(JSON.stringify(request));
    } else {
      console.log('WSS connection not available');
      setWalletConnectionStatus('disconnected');
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

  // Trade calculation helpers - use latest trade for price estimation
  const latestTradePrice = React.useMemo(() => {
    if (!recentTrades.length) return null;
    const latestTrade = recentTrades[0];
    // Price is SOL per token (how much SOL for 1 token)
    return latestTrade.solAmount / latestTrade.tokenAmount;
  }, [recentTrades]);

  const calculateEstimatedTokens = React.useMemo(() => {
    if (!latestTradePrice) return null;

    if (tradeMode === 'buy') {
      const solAmount = parseFloat(tradeSolAmount);
      if (isNaN(solAmount) || solAmount <= 0) return null;

      // Calculate tokens from SOL amount using latest trade price
      const tokens = solAmount / latestTradePrice;
      return tokens;
    } else {
      // For sell mode, we need wallet SPL balance
      const selectedWallet = connectedWallets.find(w => selectedWallets.includes(w.id));
      if (!selectedWallet || !selectedWallet.splBalance) return null;

      const percentage = parseFloat(tradePercentage);
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) return null;

      const tokensToSell = (selectedWallet.splBalance * percentage) / 100;
      return tokensToSell;
    }
  }, [tradeMode, tradeSolAmount, tradePercentage, latestTradePrice, connectedWallets, selectedWallets]);

  // Calculate estimated SOL receive for sell mode
  const calculateEstimatedSolReceive = React.useMemo(() => {
    if (tradeMode !== 'sell' || !latestTradePrice || !calculateEstimatedTokens) return null;

    // Use current slippage setting
    const slippagePercent = parseFloat(slippage) || 5;
    const slippageMultiplier = (100 - slippagePercent) / 100;

    // Estimated SOL = tokens to sell * price per token * slippage adjustment
    const estimatedSol = calculateEstimatedTokens * latestTradePrice * slippageMultiplier;
    return estimatedSol;
  }, [tradeMode, latestTradePrice, calculateEstimatedTokens, slippage]);

  // Handle quick button clicks for percentage-based inputs
  const handleQuickButton = (percentage: number) => {
    if (tradeMode === 'buy') {
      // Calculate SOL amount from percentage of wallet balance
      const selectedWallet = connectedWallets.find(w => w.id === selectedWallets[0]);
      if (selectedWallet?.solBalance) {
        const amount = (selectedWallet.solBalance * percentage / 100).toFixed(4);
        setTradeSolAmount(amount);
      }
    } else {
      // Set percentage for token selling
      setTradePercentage(percentage.toString());
    }
  };

  const validateTradeInputs = () => {
    // Check if we have price data
    if (!latestTradePrice) {
      return { valid: false, error: 'Waiting for market data...' };
    }

    if (tradeMode === 'buy') {
      const solAmount = parseFloat(tradeSolAmount);
      if (isNaN(solAmount) || solAmount <= 0) {
        return { valid: false, error: 'Please enter a valid SOL amount' };
      }
      if (solAmount < 0.000001) {
        return { valid: false, error: 'Minimum trade amount is 0.000001 SOL' };
      }
    } else {
      const percentage = parseFloat(tradePercentage);
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        return { valid: false, error: 'Please enter a valid percentage (1-100)' };
      }

      // Check if selected wallet has SPL balance for selling
      const selectedWallet = connectedWallets.find(w => selectedWallets.includes(w.id));
      if (!selectedWallet || !selectedWallet.splBalance || selectedWallet.splBalance <= 0) {
        return { valid: false, error: 'No token balance to sell' };
      }
    }

    return { valid: true, error: null };
  };

  // Build Pump V1 buy instructions via WSS server
  const buildPumpBuyInstructions = async (params: {
    mintAddress: string;
    buyAmount: string; // SOL amount as string
    walletPublicKey: string;
    walletId: string; // Wallet ID for signing
    slippage?: number;
    protocol?: 'v1' | 'amm'; // Default to v1
    pairAddress?: string; // For AMM tokens
    useJito?: boolean;
  }): Promise<{
    success: boolean;
    instructions?: any[];
    tokenAmount?: string;
    solAmount?: string;
    error?: string;
  }> => {
    return new Promise((resolve, reject) => {
      if (!wssConnection || wssConnection.readyState !== WebSocket.OPEN) {
        reject(new Error('WSS connection not available'));
        return;
      }

      const requestId = `pump_buy_${Date.now()}`;
      const request = {
        type: 'build_pump_buy',
        requestId,
        // userId: operator?.userId?.toString() || 'unknown', // Removed
        mintAddress: params.mintAddress,
        buyAmount: params.buyAmount,
        walletPublicKey: params.walletPublicKey,
        walletId: params.walletId, // Wallet ID for signing
        slippage: params.slippage || 1,
        protocol: params.protocol || 'v1', // Use detected protocol
        pairAddress: params.pairAddress, // For AMM tokens
        useJito: params.useJito || false
      };

      console.log('📤 Building Pump buy instructions:', request);

      // Set up one-time response handler
      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'build_pump_buy_response' && data.requestId === requestId) {
            // Remove this handler after receiving response
            wssConnection.removeEventListener('message', handleResponse);

            if (data.success) {
              console.log('✅ Pump buy instructions built successfully');
              resolve({
                success: true,
                instructions: data.data.instructions,
                tokenAmount: data.data.tokenAmount,
                solAmount: data.data.solAmount
              });
            } else {
              console.error('❌ Failed to build Pump buy instructions:', data.error);
              resolve({
                success: false,
                error: data.error || 'Unknown error'
              });
            }
          }
        } catch (error) {
          console.error('Error parsing WSS response:', error);
          wssConnection.removeEventListener('message', handleResponse);
          reject(error);
        }
      };

      // Add response handler
      wssConnection.addEventListener('message', handleResponse);

      // Send the request
      wssConnection.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        wssConnection.removeEventListener('message', handleResponse);
        reject(new Error('Timeout waiting for Pump buy instruction response'));
      }, 30000);
    });
  };

  // Build Pump V1 sell instructions via WSS server
  const buildPumpSellInstructions = async (params: {
    mintAddress: string;
    tokenAmount: string; // Token amount to sell as string (in human readable form)
    walletPublicKey: string;
    walletId: string; // Wallet ID for signing
    slippage?: number;
    protocol?: 'v1' | 'amm'; // Default to v1
    pairAddress?: string; // For AMM tokens
    useJito?: boolean;
  }): Promise<{
    success: boolean;
    instructions?: any[];
    tokenAmount?: string;
    solAmount?: string;
    error?: string;
  }> => {
    return new Promise((resolve, reject) => {
      if (!wssConnection || wssConnection.readyState !== WebSocket.OPEN) {
        reject(new Error('WSS connection not available'));
        return;
      }

      const requestId = `pump_sell_${Date.now()}`;
      const request = {
        type: 'build_pump_sell',
        requestId,
        // userId: operator?.userId?.toString() || 'unknown', // Removed
        mintAddress: params.mintAddress,
        tokenAmount: params.tokenAmount,
        walletPublicKey: params.walletPublicKey,
        walletId: params.walletId, // Wallet ID for signing
        slippage: params.slippage || 1,
        protocol: params.protocol || 'v1', // Use detected protocol
        pairAddress: params.pairAddress, // For AMM tokens
        useJito: params.useJito || false
      };

      console.log('📤 Building Pump sell instructions:', request);

      // Set up one-time response handler
      const handleResponse = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'build_pump_sell_response' && data.requestId === requestId) {
            // Remove this handler after receiving response
            wssConnection.removeEventListener('message', handleResponse);

            if (data.success) {
              console.log('✅ Pump sell instructions built successfully');
              resolve({
                success: true,
                instructions: data.data.instructions,
                tokenAmount: data.data.tokenAmount,
                solAmount: data.data.solAmount
              });
            } else {
              console.error('❌ Failed to build Pump sell instructions:', data.error);
              resolve({
                success: false,
                error: data.error || 'Unknown error'
              });
            }
          }
        } catch (error) {
          console.error('Error parsing WSS response:', error);
          wssConnection.removeEventListener('message', handleResponse);
          reject(error);
        }
      };

      // Add response handler
      wssConnection.addEventListener('message', handleResponse);

      // Send the request
      wssConnection.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        wssConnection.removeEventListener('message', handleResponse);
        reject(new Error('Timeout waiting for Pump sell instruction response'));
      }, 30000);
    });
  };

  // Balance validation for multi-wallet processing
  const validateWalletBalance = (walletId: string, requiredAmount: number): boolean => {
    const wallet = connectedWallets.find(w => w.id === walletId);
    if (!wallet) return false;

    // Check if wallet has enough SOL for transaction + fees
    const buffer = 0.001; // 0.001 SOL buffer for fees
    return (wallet.solBalance || 0) >= (requiredAmount + buffer);
  };

  // Multi-wallet sequential selling
  const processMultiWalletSell = async (walletIds: string[], percentage: number) => {
    setMultiWalletProcessing({
      active: true,
      currentWallet: walletIds[0],
      remainingWallets: walletIds.slice(1),
      completedWallets: [],
      failedWallets: []
    });

    for (const walletId of walletIds) {
      const wallet = connectedWallets.find(w => w.id === walletId);
      if (!wallet) continue;

      // Calculate token amount (percentage of this wallet's token balance)
      const tokenAmount = (wallet.splBalance * percentage) / 100;

      // Skip wallets with zero/insufficient tokens
      if (tokenAmount <= 0) {
        setMultiWalletProcessing(prev => ({
          ...prev,
          failedWallets: [...prev.failedWallets, walletId],
          currentWallet: prev.remainingWallets[0] || null,
          remainingWallets: prev.remainingWallets.slice(1)
        }));
        continue;
      }

      try {
        setMultiWalletProcessing(prev => ({
          ...prev,
          currentWallet: walletId
        }));

        showToast(`💥 Selling ${percentage}% (${formatCompact(tokenAmount, 1)} tokens) from wallet ${walletId}...`);

        const result = await buildPumpSellInstructions({
          mintAddress: currentCoin,
          tokenAmount: tokenAmount.toString(),
          walletPublicKey: wallet.publicKey,
          walletId: walletId,
          slippage: parseFloat(slippage) || 5,
          protocol: protocolType || 'v1',
          pairAddress: pairInfo?.pairAddress,
          useJito: useJito
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        // Wait for transaction confirmation (handled by WebSocket)

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        setMultiWalletProcessing(prev => ({
          ...prev,
          failedWallets: [...prev.failedWallets, walletId]
        }));
      }
    }

    // Processing complete - show final stats
    setTimeout(() => {
      setFinalStats({
        completed: multiWalletProcessing.completedWallets.length,
        failed: multiWalletProcessing.failedWallets.length,
        total: walletIds.length
      });

      setMultiWalletProcessing(prev => ({ ...prev, active: false, currentWallet: null }));

      setTimeout(() => {
        setFinalStats(null);
      }, 4000);
    }, 1000);
  };

  // Multi-wallet sequential buying
  const processMultiWalletBuy = async (walletIds: string[], amount: number) => {
    setMultiWalletProcessing({
      active: true,
      currentWallet: walletIds[0],
      remainingWallets: walletIds.slice(1),
      completedWallets: [],
      failedWallets: []
    });

    for (const walletId of walletIds) {
      // Balance validation
      if (!validateWalletBalance(walletId, amount)) {
        showToast(`❌ Wallet ${walletId} insufficient balance - skipping`);
        setMultiWalletProcessing(prev => ({
          ...prev,
          failedWallets: [...prev.failedWallets, walletId],
          currentWallet: prev.remainingWallets[0] || null,
          remainingWallets: prev.remainingWallets.slice(1)
        }));
        continue;
      }

      const wallet = connectedWallets.find(w => w.id === walletId);
      if (!wallet) continue;

      try {
        setMultiWalletProcessing(prev => ({
          ...prev,
          currentWallet: walletId
        }));

        showToast(`🪙 Processing wallet ${walletId}: Buying ${amount.toFixed(4)} SOL...`);

        const result = await buildPumpBuyInstructions({
          mintAddress: currentCoin,
          buyAmount: amount.toString(),
          walletPublicKey: wallet.publicKey,
          walletId: walletId,
          slippage: parseFloat(slippage) || 5,
          protocol: protocolType || 'v1',
          pairAddress: pairInfo?.pairAddress,
          useJito: useJito
        });

        if (!result.success) {
          throw new Error(result.error);
        }

        // Wait for transaction confirmation (handled by WebSocket)

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        showToast(`❌ Wallet ${walletId} failed: ${errorMsg}`);
        setMultiWalletProcessing(prev => ({
          ...prev,
          failedWallets: [...prev.failedWallets, walletId]
        }));
      }
    }

    // Processing complete - show final stats
    setTimeout(() => {
      setFinalStats({
        completed: multiWalletProcessing.completedWallets.length,
        failed: multiWalletProcessing.failedWallets.length,
        total: walletIds.length
      });

      setMultiWalletProcessing(prev => ({ ...prev, active: false, currentWallet: null }));

      setTimeout(() => {
        setFinalStats(null);
      }, 4000);
    }, 1000);
  };

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
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-1">
                {pairInfo?.tokenImage && (
                  <img
                    src={pairInfo.tokenImage}
                    alt={pairInfo.tokenName || pairInfo.tokenTicker}
                    className="w-12 h-12 rounded-lg border-2 border-green-500/40 object-cover flex-shrink-0 shadow-lg"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="text-green-100 font-bold text-lg font-mono truncate">
                    {pairInfo
                      ? pairInfo.tokenName
                        ? `${pairInfo.tokenName} (${pairInfo.tokenTicker})`
                        : pairInfo.tokenTicker || (currentCoin === 'So11111111111111111111111111111112' ? 'SOL' : `${currentCoin.slice(0, 6)}...${currentCoin.slice(-6)}`)
                      : currentCoin === 'So11111111111111111111111111111112'
                        ? 'SOL /USD'
                        : `${currentCoin.slice(0, 6)}...${currentCoin.slice(-6)}`}
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
                      {currentCoin.slice(0, 6)}...{currentCoin.slice(-6)}
                    </button>
                    <a
                      href={
                        protocolType === 'amm'
                          ? `https://pump.fun/coin/${currentCoin}`
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
              src={`https://birdeye.so/tv-widget/${currentCoin}?chain=solana&viewMode=pair&chartInterval=1&chartType=Candle&chartTimezone=Etc%2FUTC&chartLeftToolbar=show&theme=dark`}
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
                      className={`px-4 py-2 text-xs font-mono font-semibold border-r border-green-500/20 transition-all duration-200 relative ${activeTab === tab.id
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
                {activeTab === 'wallets' && (
                  <div className="px-4">
                    {walletConnectionStatus === 'connected' && connectedWallets.length > 0 && (
                      <span className="ml-4 inline-flex items-center gap-1.5 text-xs font-mono text-green-300/80 whitespace-nowrap">
                        {(() => {
                          const totalWallets = connectedWallets.length;
                          const selectedCount = selectedWallets.length;
                          const totalSol = connectedWallets.reduce((sum, wallet) => sum + (wallet.solBalance || 0), 0);
                          const totalSpl = connectedWallets.reduce((sum, wallet) => sum + (wallet.splBalance || 0), 0);

                          return (
                            <>
                              <span>
                                {totalWallets} wallet{totalWallets !== 1 ? 's' : ''}
                                <span className="text-green-500/60">{' ('}</span>
                                {selectedCount > 0 ? (
                                  <>
                                    <span className="text-green-300">{selectedCount} selected</span>
                                    <span className="mx-1 text-green-500/40">/</span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedWallets([]); }}
                                      className="text-red-400 hover:text-red-300 underline hover:no-underline cursor-pointer"
                                    >
                                      Deselect
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-green-500/60">0 selected</span>
                                )}

                                {selectedCount < totalWallets && (
                                  <>
                                    <span className="mx-1 text-green-500/40">/</span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedWallets(connectedWallets.map(w => w?.id).filter(Boolean)); }}
                                      className="text-green-400 hover:text-green-300 underline hover:no-underline cursor-pointer"
                                    >
                                      All
                                    </button>
                                  </>
                                )}
                                <span className="text-green-500/60">{')'}</span>
                              </span>
                              <span className="text-green-500/40">|</span>
                              <span>{totalSol.toFixed(2)} SOL</span>
                              <span className="text-green-500/40">|</span>
                              <span>{totalSpl > 0 ? formatCompact(totalSpl, 1) : '0'} SPL</span>
                            </>
                          );
                        })()}
                      </span>
                    )}
                    <span className={`ml-2 text-xs font-mono ${walletConnectionStatus === 'connected' && connectedWallets.length > 0 ? 'text-green-400' :
                      walletConnectionStatus === 'connecting' ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                      ● {
                        walletConnectionStatus === 'connected' && connectedWallets.length > 0 ? 'UNLOCKED' :
                          walletConnectionStatus === 'connected' && connectedWallets.length === 0 ? 'LOCKED' :
                            walletConnectionStatus === 'connecting' ? 'CONNECTING' :
                              'DISCONNECTED'
                      }
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
                              className={`${trade.type === 'buy'
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
                              <td className={`px-3 py-2 whitespace-nowrap font-semibold ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'
                                }`}>
                                {formatCompact(trade.tokenAmount, 2)}
                              </td>
                              <td className={`px-3 py-2 whitespace-nowrap font-medium ${trade.type === 'buy' ? 'text-green-400' : 'text-red-400'
                                }`}>
                                {`${trade.solAmount.toFixed(4)} / $${trade.usdAmount.toFixed(2)}`}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-gray-200 hover:text-white cursor-pointer transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(trade.wallet);
                                      showToast('Wallet address copied to clipboard!');
                                    }}
                                    title="Click to copy full address"
                                  >
                                    {trade.wallet.slice(0, 6)}...{trade.wallet.slice(-4)}
                                  </span>
                                  <a
                                    href={`https://solscan.io/account/${trade.wallet}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-green-400 transition-colors"
                                    title="View on Solscan"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      <polyline points="15 3 21 3 21 9" />
                                      <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                  </a>
                                </div>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-gray-200 hover:text-white cursor-pointer transition-colors"
                                    onClick={() => {
                                      navigator.clipboard.writeText(trade.txId);
                                      showToast('Transaction ID copied to clipboard!');
                                    }}
                                    title="Click to copy full transaction ID"
                                  >
                                    {trade.txId.slice(0, 6)}...{trade.txId.slice(-4)}
                                  </span>
                                  <a
                                    href={`https://solscan.io/tx/${trade.txId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-green-400 transition-colors"
                                    title="View transaction on Solscan"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                      <polyline points="15 3 21 3 21 9" />
                                      <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                  </a>
                                </div>
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
                                    <td className="px-3 py-2 whitespace-nowrap text-white font-mono">
                                      <div className="flex items-center gap-1.5">
                                        <span
                                          className="cursor-pointer hover:text-green-400 transition-colors"
                                          onClick={() => {
                                            navigator.clipboard.writeText(holder.walletAddress);
                                            showToast("Address copied");
                                          }}
                                          title="Click to copy address"
                                        >
                                          {holder.walletAddress.slice(0, 6)}...{holder.walletAddress.slice(-4)}
                                        </span>
                                        <div className="flex items-center gap-1">
                                          <a
                                            href={`https://solscan.io/account/${holder.walletAddress}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-500 hover:text-green-400 transition-colors"
                                            title="View on Solscan"
                                          >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                              <polyline points="15 3 21 3 21 9" />
                                              <line x1="10" y1="14" x2="21" y2="3" />
                                            </svg>
                                          </a>
                                          {holder.isInsider && <span className="text-yellow-400 inline-block">{CustomIcons.insider}</span>}
                                          {holder.isBundler && <span className="text-red-400 inline-block">{CustomIcons.bundler}</span>}
                                        </div>
                                      </div>
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
                    <div className="flex-1 border border-green-500/20 rounded overflow-hidden bg-black/50 flex flex-col items-center justify-center p-6 text-center">
                      <div className="w-16 h-16 mb-4 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30">
                        <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-green-500">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                          <circle cx="8" cy="8" r="3" fill="currentColor" />
                          <circle cx="16" cy="14" r="4" fill="currentColor" opacity="0.7" />
                          <circle cx="10" cy="16" r="2" fill="currentColor" opacity="0.5" />
                          <path d="M8 8 L16 14 M16 14 L10 16 M10 16 L8 8" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                        </svg>
                      </div>
                      <h4 className="text-green-400 font-bold mb-2">BUBBLE MAP DATA</h4>
                      <p className="text-green-500/60 text-[10px] sm:text-xs mb-6 max-w-[200px] sm:max-w-xs">
                        Visualize holders and potential wallet clusters for this token on Bubblemaps.
                      </p>
                      <a
                        href={`https://v2.bubblemaps.io/map?address=${currentCoin}&chain=solana&limit=80`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-2.5 bg-green-500 text-black font-bold text-xs hover:bg-green-400 transition-all active:scale-95 flex items-center gap-2"
                      >
                        VIEW ON BUBBLEMAPS
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
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
                                <td className="px-3 py-2 whitespace-nowrap text-white font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="cursor-pointer hover:text-green-400 transition-colors"
                                      onClick={() => {
                                        navigator.clipboard.writeText(trader.walletAddress);
                                        showToast("Address copied");
                                      }}
                                      title="Click to copy address"
                                    >
                                      {trader.walletAddress.slice(0, 6)}...{trader.walletAddress.slice(-4)}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <a
                                        href={`https://solscan.io/account/${trader.walletAddress}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-gray-500 hover:text-green-400 transition-colors"
                                        title="View on Solscan"
                                      >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                          <polyline points="15 3 21 3 21 9" />
                                          <line x1="10" y1="14" x2="21" y2="3" />
                                        </svg>
                                      </a>
                                      {trader.isInsider && <span className="text-yellow-400 inline-block">{CustomIcons.insider}</span>}
                                      {trader.isBundler && <span className="text-red-400 inline-block">{CustomIcons.bundler}</span>}
                                      {trader.isSniper && <span className="text-red-400 inline-block">{CustomIcons.sniper}</span>}
                                    </div>
                                  </div>
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
                                <td className={`px-3 py-2 whitespace-nowrap font-semibold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'
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
                <div className="flex-1 flex flex-col min-h-0 relative">
                  {/* Login Required Overlay */}
                  {!operator && (
                    <div className="absolute inset-0 bg-gray-800/40 backdrop-blur-sm z-20 flex items-center justify-center border border-green-500/30 rounded">
                      <div className="text-center space-y-4 p-6 max-w-md">
                        <div className="text-green-400 font-mono text-xl">[ JOIN THE PLATFORM ]</div>
                        <div className="text-green-300/80 font-mono text-sm space-y-2">
                          <p>Welcome to the most advanced trading platform.</p>
                          <p>Sign in with Telegram to access all trading features.</p>
                        </div>
                        <a
                          href="https://t.me/a_trade_fun_bot"
                          className="inline-block px-6 py-3 border border-green-500/40 rounded bg-green-500/10 text-green-100 font-mono text-sm hover:bg-green-500/20 transition-colors"
                        >
                          Sign Up Now
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Wallets Table */}
                  <div className="flex-1 overflow-y-auto border border-green-500/20 rounded min-h-0 max-h-[60vh] p-0">
                    {connectedWallets.length === 0 ? (
                      <div className="text-center text-green-500/60 py-12 space-y-3">
                        <div className="text-green-300 font-mono text-lg mb-2">[ NO WALLETS ]</div>
                        <div className="text-green-500/40 font-mono text-sm space-y-2 max-w-md mx-auto">
                          <p>Connect your wallet client to see your wallets here.</p>
                          <p>Go to Settings → Wallet Client Connection to get started.</p>
                        </div>
                        <a
                          href="/settings"
                          className="inline-block px-4 py-2 border border-green-500/40 rounded bg-green-500/10 text-green-100 font-mono text-sm hover:bg-green-500/20 transition-colors"
                        >
                          Open Settings
                        </a>
                      </div>
                    ) : (
                      <table className="w-full text-xs font-mono">
                        <thead className="bg-green-500/10 sticky top-0 z-10 backdrop-blur-sm">
                          <tr className="text-left border-b border-green-500/30">
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2">Address</th>
                            <th className="px-3 py-2">SOL Balance</th>
                            <th className="px-3 py-2">SPL Balance</th>
                            <th className="px-3 py-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-green-500/20">
                          {connectedWallets.map((wallet) => {
                            const isSelected = selectedWallets.includes(wallet.id);
                            return (
                              <tr
                                key={wallet.id}
                                onClick={() => {
                                  setSelectedWallets(prev =>
                                    isSelected
                                      ? prev.filter(id => id !== wallet.id)
                                      : [...prev, wallet.id]
                                  );
                                }}
                                className={`cursor-pointer transition-colors ${isSelected
                                  ? 'bg-white/10 border-l-3 border-green-400 shadow-sm hover:bg-white/20'
                                  : 'hover:bg-white/5'
                                  }`}
                              >
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span className={isSelected ? "text-green-300" : "text-green-400"}>
                                      {isSelected ? "✓" : "🔑"}
                                    </span>
                                    <span className={`font-semibold ${isSelected ? "text-white" : "text-green-100"}`}>
                                      {wallet.name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-white font-mono">
                                  <span
                                    className="cursor-pointer hover:text-green-300 transition-colors select-none"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(wallet.publicKey);
                                      showToast('Wallet address copied!');
                                    }}
                                    title="Click to copy wallet address"
                                  >
                                    {wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-8)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-green-200 font-medium">
                                  {wallet.solBalance !== undefined ? `${wallet.solBalance.toFixed(4)} SOL` : '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-green-200 font-medium">
                                  {wallet.splBalance ? `${formatCompact(wallet.splBalance, 1)}` : '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div className="flex gap-1">
                                    <button
                                      className="px-2 py-1 text-xs font-mono bg-green-500/20 text-green-100 border border-green-500/40 rounded hover:bg-green-500/30 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedWallets([wallet.id]); // Set as single selected wallet for trading
                                        setTradeMode('buy');
                                        // Scroll to trading controls
                                        document.querySelector('[data-trading-controls]')?.scrollIntoView({ behavior: 'smooth' });
                                      }}
                                      title="Buy tokens with this wallet"
                                    >
                                      BUY
                                    </button>
                                    <button
                                      className="px-2 py-1 text-xs font-mono bg-red-500/20 text-red-100 border border-red-500/40 rounded hover:bg-red-500/30 transition-colors"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedWallets([wallet.id]); // Set as single selected wallet for trading
                                        setTradeMode('sell');
                                        // Scroll to trading controls
                                        document.querySelector('[data-trading-controls]')?.scrollIntoView({ behavior: 'smooth' });
                                      }}
                                      title="Sell tokens with this wallet"
                                    >
                                      SELL
                                    </button>
                                    <button
                                      className="px-2 py-1 text-xs font-mono bg-red-500/30 text-red-100 border border-red-500/50 rounded hover:bg-red-500/40 transition-colors"
                                      onClick={async (e) => {
                                        e.stopPropagation();

                                        // Check if wallet has tokens
                                        if (!wallet.splBalance || wallet.splBalance <= 0) {
                                          showToast('❌ No tokens to sell in this wallet');
                                          return;
                                        }

                                        try {
                                          showToast(`💥 Quick selling ${formatCompact(wallet.splBalance, 1)} tokens...`);

                                          const result = await buildPumpSellInstructions({
                                            mintAddress: currentCoin,
                                            tokenAmount: wallet.splBalance.toString(),
                                            walletPublicKey: wallet.publicKey,
                                            walletId: wallet.id,
                                            slippage: parseFloat(slippage) || 5,
                                            protocol: protocolType || 'v1',
                                            pairAddress: pairInfo?.pairAddress,
                                            useJito: useJito
                                          });

                                          if (!result.success) {
                                            showToast(`❌ Quick sell failed: ${result.error}`);
                                          }
                                          // Transaction sent to WSS, response handled by WebSocket listener

                                        } catch (error) {
                                          showToast(`❌ Quick sell failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                                        }
                                      }}
                                      disabled={!wallet.splBalance || wallet.splBalance <= 0}
                                      title="Quick sell 100% - INSTANT"
                                    >
                                      ☢︎
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
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
          className="bg-black/20 overflow-y-auto flex relative"
          style={{ width: `${rightPanelWidth}%` }}
        >
          {/* Login Required Overlay for Trading Panel */}
          {!operator && (
            <div className="absolute inset-0 bg-gray-800/40 backdrop-blur-sm z-20 flex items-center justify-center border border-green-500/30 rounded">
              <div className="text-center space-y-4 p-6 max-w-md">
                <div className="text-green-400 font-mono text-xl">[ START TRADING ]</div>
                <div className="text-green-300/80 font-mono text-sm space-y-2">
                  <p>Join thousands of traders using our advanced platform.</p>
                  <p>Create your account to access powerful trading tools and start building your portfolio.</p>
                </div>
                <a
                  href="https://t.me/a_trade_fun_bot"
                  className="inline-block px-6 py-3 border border-green-500/40 rounded bg-green-500/10 text-green-100 font-mono text-sm hover:bg-green-500/20 transition-colors"
                >
                  Get Started
                </a>
              </div>
            </div>
          )}

          <div className="p-4 space-y-4 relative flex-1">
            {selectedWallets.length > 0 && (
              <div className="text-xs text-green-300/80 font-mono mb-2 p-2 bg-green-500/5 rounded border border-green-500/20">
                Selected wallets: {selectedWallets.length === 1
                  ? connectedWallets.find(w => w.id === selectedWallets[0])?.name || 'Unknown Wallet'
                  : `${selectedWallets.length} wallets selected`
                }
              </div>
            )}
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
              {tradeMode === 'buy' ? (
                <div className="flex flex-col gap-2">
                  <label className="text-green-300/80">Amount (SOL)</label>
                  <div className="flex gap-2">
                    <input
                      value={tradeSolAmount}
                      onChange={(e) => setTradeSolAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-24 rounded border border-green-500/30 bg-black/60 px-3 py-2 text-green-100 placeholder:text-green-500/40 focus:outline-none focus:border-green-400"
                    />
                    <div className="flex gap-1">
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(25)}
                      >
                        25%
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(50)}
                      >
                        50%
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(75)}
                      >
                        75%
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(95)}
                      >
                        95%
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="text-green-300/80">Percentage (%)</label>
                  <div className="flex gap-2">
                    <input
                      value={tradePercentage}
                      onChange={(e) => setTradePercentage(e.target.value)}
                      placeholder="100"
                      className="w-24 rounded border border-green-500/30 bg-black/60 px-3 py-2 text-green-100 placeholder:text-green-500/40 focus:outline-none focus:border-green-400"
                    />
                    <div className="flex gap-1">
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(25)}
                      >
                        25%
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(50)}
                      >
                        50%
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(75)}
                      >
                        75%
                      </button>
                      <button
                        className="px-2 py-1 text-xs rounded border border-green-500/30 bg-green-500/5 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 font-mono text-green-300 hover:text-green-100"
                        onClick={() => handleQuickButton(100)}
                      >
                        100%
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Trade Settings */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 relative">
                    <div
                      className="text-green-300/80 flex items-center cursor-help"
                      onMouseEnter={() => setShowSlippageTooltip(true)}
                      onMouseLeave={() => setShowSlippageTooltip(false)}
                    >
                      {CustomIcons.slippage}
                    </div>
                    {showSlippageTooltip && (
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-black/90 text-green-100 text-xs rounded border border-green-500/30 whitespace-nowrap z-10">
                        Slippage Tolerance
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-green-500/30"></div>
                      </div>
                    )}
                    <select
                      value={slippage}
                      onChange={(e) => setSlippage(e.target.value)}
                      className="rounded border border-green-500/30 bg-black/60 px-2 py-1 text-green-100 focus:outline-none focus:border-green-400 text-xs"
                    >
                      <option value="0.5">0.5%</option>
                      <option value="1">1%</option>
                      <option value="2">2%</option>
                      <option value="5">5%</option>
                      <option value="10">10%</option>
                      <option value="15">15%</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useJito"
                      checked={useJito}
                      onChange={(e) => setUseJito(e.target.checked)}
                      className="w-3 h-3 rounded border border-green-500/30 bg-black/60 text-green-400 focus:ring-green-400 focus:ring-2"
                    />
                    <label htmlFor="useJito" className="text-green-300/80 text-xs font-mono cursor-pointer flex items-center gap-1">
                      Jito
                      {jitoTip && (
                        <span className="text-green-500/60 text-[10px] ml-1">
                          (Tips: {jitoTip.toFixed(4)} SOL)
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* Trade Summary */}
              {(tradeMode === 'buy' && tradeSolAmount) || (tradeMode === 'sell' && tradePercentage) ? (
                <div className="text-xs text-green-300/70">
                  {tradeMode === 'buy' ? (
                    <div className="flex items-center gap-1">
                      <span>Tokens:</span>
                      <span>~{formatCompact(calculateEstimatedTokens || 0, 2)} {pairInfo?.tokenTicker || 'tokens'}</span>
                      {recentTrades.length > 0 && (
                        <span className="text-green-400/60 text-[10px]">● LIVE</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span>Receive:</span>
                      <span>~{calculateEstimatedSolReceive ? calculateEstimatedSolReceive.toFixed(4) : '—'} SOL</span>
                      <span className="text-green-400/60 text-[10px]">(est. {slippage}% slippage)</span>
                      {recentTrades.length > 0 && (
                        <span className="text-green-400/60 text-[10px]">● LIVE</span>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Validation Error */}
              {(() => {
                const validation = validateTradeInputs();
                if (!validation.valid && (tradeSolAmount || tradePercentage)) {
                  return (
                    <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
                      {validation.error}
                    </div>
                  );
                }
                return null;
              })()}

              <button
                className={`w-full py-2 rounded border font-semibold transition-colors ${tradeMode === 'buy'
                  ? 'bg-green-500/20 border-green-400 text-green-100 hover:bg-green-500/30'
                  : 'bg-red-500/20 border-red-400 text-red-100 hover:bg-red-500/30'
                  }`}
                onClick={async () => {
                  if (tradeMode === 'buy') {
                    if (selectedWallets.length === 0) {
                      showToast('Please select a wallet to trade with.');
                      return;
                    }

                    const buyAmount = parseFloat(tradeSolAmount);
                    if (isNaN(buyAmount) || buyAmount <= 0) {
                      showToast('Please enter a valid SOL amount.');
                      return;
                    }

                    if (selectedWallets.length === 1) {
                      // Single wallet buying
                      const selectedWallet = connectedWallets.find(w => w.id === selectedWallets[0]);
                      if (!selectedWallet) {
                        showToast('Selected wallet not found.');
                        return;
                      }

                      try {
                        showToast(`Buying ${formatCompact(calculateEstimatedTokens || 0, 2)} tokens`);

                        const result = await buildPumpBuyInstructions({
                          mintAddress: currentCoin,
                          buyAmount: tradeSolAmount,
                          walletPublicKey: selectedWallet.publicKey,
                          walletId: selectedWallet.id,
                          slippage: parseFloat(slippage) || 5,
                          protocol: protocolType || 'v1',
                          pairAddress: pairInfo?.pairAddress,
                          useJito: useJito,
                          // @ts-ignore - Dynamic tip update
                          jitoTipAmount: jitoTip // Pass dynamic tip if available
                        });

                        if (!result.success) {
                          showToast(`❌ ${result.error}`);
                        }

                      } catch (error) {
                        console.error('❌ Error building Pump V1 buy instructions:', error);
                        showToast(`❌ Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                      }
                    } else {
                      // Multi-wallet sequential buying
                      await processMultiWalletBuy(selectedWallets, buyAmount);
                    }
                  } else {
                    // SELL MODE
                    if (selectedWallets.length === 0) {
                      showToast('Please select a wallet to trade with.');
                      return;
                    }

                    const percentage = parseFloat(tradePercentage);
                    if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
                      showToast('Please enter a valid percentage (1-100).');
                      return;
                    }

                    if (selectedWallets.length === 1) {
                      // Single wallet selling
                      const selectedWallet = connectedWallets.find(w => w.id === selectedWallets[0]);
                      if (!selectedWallet) {
                        showToast('Selected wallet not found.');
                        return;
                      }

                      try {
                        // Calculate token amount to sell based on percentage and wallet balance
                        const tokenBalance = selectedWallet.splBalance || 0;
                        const tokenAmountToSell = (tokenBalance * percentage) / 100;

                        if (tokenAmountToSell <= 0) {
                          showToast('No tokens to sell in selected wallet.');
                          return;
                        }

                        // Show selling notification
                        showToast(`Selling ${formatCompact(tokenAmountToSell, 2)} tokens`);

                        const result = await buildPumpSellInstructions({
                          mintAddress: currentCoin,
                          tokenAmount: tokenAmountToSell.toString(),
                          walletPublicKey: selectedWallet.publicKey,
                          walletId: selectedWallet.id,
                          slippage: parseFloat(slippage) || 5,
                          protocol: protocolType || 'v1',
                          pairAddress: pairInfo?.pairAddress,
                          useJito: useJito,
                          // @ts-ignore - Dynamic tip update
                          jitoTipAmount: jitoTip
                        });

                        if (!result.success) {
                          showToast(`❌ ${result.error}`);
                        }

                      } catch (error) {
                        console.error('❌ Error building Pump V1 sell instructions:', error);
                        showToast(`❌ Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                      }
                    } else {
                      // Multi-wallet sequential selling
                      await processMultiWalletSell(selectedWallets, percentage);
                    }
                  }
                }}
                disabled={selectedWallets.length === 0 || !validateTradeInputs().valid}
              >
                {selectedWallets.length === 0
                  ? 'Select wallet(s) to trade'
                  : tradeMode === 'buy'
                    ? `Buy ${tradeSolAmount || '0'} SOL`
                    : `Sell ${tradePercentage || '0'}%`
                }
              </button>

              {/* Multi-Wallet Progress Widget */}
              {multiWalletProcessing.active && (
                <div className="mt-3 p-3 bg-black/40 border border-green-500/30 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-green-100 font-mono text-sm">
                      Multi-Wallet {tradeMode === 'buy' ? 'Buying' : 'Selling'}
                    </span>
                    <button
                      onClick={() => {
                        setMultiWalletProcessing(prev => ({ ...prev, active: false }));
                        showToast(`❌ Multi-wallet ${tradeMode === 'buy' ? 'buying' : 'selling'} cancelled`);
                      }}
                      className="text-red-400 hover:text-red-300 text-sm px-2 py-1 rounded border border-red-500/30 hover:border-red-500/50"
                    >
                      ✕ Cancel
                    </button>
                  </div>

                  <div className="space-y-1 text-xs font-mono">
                    <div>Current: {multiWalletProcessing.currentWallet || '—'}</div>
                    <div>Remaining: {multiWalletProcessing.remainingWallets.length}</div>
                    <div className="text-green-400">Completed: {multiWalletProcessing.completedWallets.length}</div>
                    {multiWalletProcessing.failedWallets.length > 0 && (
                      <div className="text-red-400">Failed: {multiWalletProcessing.failedWallets.length}</div>
                    )}
                  </div>

                  <div className="mt-2 h-2 bg-green-500/20 rounded">
                    <div
                      className="h-full bg-green-500 rounded transition-all duration-300"
                      style={{
                        width: `${multiWalletProcessing.completedWallets.length + multiWalletProcessing.failedWallets.length > 0 ?
                          ((multiWalletProcessing.completedWallets.length + multiWalletProcessing.failedWallets.length) /
                            (multiWalletProcessing.completedWallets.length + multiWalletProcessing.failedWallets.length +
                              multiWalletProcessing.remainingWallets.length + (multiWalletProcessing.currentWallet ? 1 : 0))) * 100 : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Final Stats */}
              {finalStats && (
                <div className="mt-2 p-2 bg-green-500/10 border border-green-500/30 rounded text-xs font-mono text-center">
                  ✅ Multi-wallet completed successful!
                </div>
              )}
            </div>

            {/* Advanced & Extra Section - Separate Container */}
            <div className="border border-green-500/20 rounded-lg bg-black/40 p-4 space-y-4 mt-4">
              <div className="flex justify-center mb-2">
                <button
                  className="w-full py-1.5 rounded border-2 border-red-500/50 bg-red-500/10 hover:bg-red-500/20 hover:border-red-400 text-red-300 font-mono font-bold text-sm transition-all duration-200 hover:shadow-lg hover:shadow-red-500/20"
                  onClick={() => {
                    if (!wssConnection || wssConnection.readyState !== WebSocket.OPEN) {
                      showToast('❌ Not connected to server');
                      return;
                    }

                    if (selectedWallets.length === 0) {
                      showToast('❌ No wallets selected');
                      return;
                    }

                    if (currentCoin === 'So11111111111111111111111111111112') {
                      showToast('❌ Cannot nuke SOL token');
                      return;
                    }

                    const request = {
                      type: 'nuke_request',
                      // userId: operator?.userId?.toString() || 'unknown', // Removed
                      requestId: `nuke_${Date.now()}`,
                      mintAddress: currentCoin,
                      protocol: protocolType || 'v1', // Default to v1 if unknown
                      pairAddress: pairInfo?.pairAddress || pairInfo?.poolAddress || null,
                      slippage: parseFloat(slippage) || 5
                    };

                    wssConnection.send(JSON.stringify(request));
                    showToast('☢️ Nuke initiated...');
                  }}
                >
                  ☠︎ NUKE ☢︎
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className="p-3 rounded border border-green-500/30 bg-black/40 hover:bg-green-500/10 hover:border-green-400/60 transition-all duration-200 flex flex-col items-center gap-1 group"
                  onClick={() => setShowLadderBuyModal(true)}
                >
                  <div className="text-green-300/80 group-hover:text-green-200 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                      <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-green-100 text-xs font-mono font-medium">Ladder Buy</span>
                </button>

                <button
                  className="p-3 rounded border border-red-500/30 bg-black/40 hover:bg-red-500/10 hover:border-red-400/60 transition-all duration-200 flex flex-col items-center gap-1 group"
                  onClick={() => setShowLadderSellModal(true)}
                >
                  <div className="text-red-300/80 group-hover:text-red-200 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                      <path d="M21 6H3M21 10H7M21 14H11M21 18H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M3 12l3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-red-100 text-xs font-mono font-medium">Ladder Sell</span>
                </button>

                <button
                  className="p-3 rounded border border-amber-500/30 bg-black/40 hover:bg-amber-500/10 hover:border-amber-400/60 transition-all duration-200 flex flex-col items-center gap-1 group"
                  onClick={() => setShowBundleBuyModal(true)}
                >
                  <div className="text-amber-300/80 group-hover:text-amber-200 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                      <rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
                      <circle cx="9" cy="9" r="1" fill="currentColor" />
                      <circle cx="15" cy="9" r="1" fill="currentColor" />
                      <circle cx="9" cy="15" r="1" fill="currentColor" />
                      <circle cx="15" cy="15" r="1" fill="currentColor" />
                    </svg>
                  </div>
                  <span className="text-amber-100 text-xs font-mono font-medium">Bundle Buy</span>
                </button>

                <button
                  className="p-3 rounded border border-cyan-500/30 bg-black/40 hover:bg-cyan-500/10 hover:border-cyan-400/60 transition-all duration-200 flex flex-col items-center gap-1 group"
                  onClick={() => setShowGatherSolModal(true)}
                >
                  <div className="text-cyan-300/80 group-hover:text-cyan-200 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-cyan-100 text-xs font-mono font-medium">Gather SOL</span>
                </button>

                <button
                  className="p-3 rounded border border-purple-500/30 bg-black/40 hover:bg-purple-500/10 hover:border-purple-400/60 transition-all duration-200 flex flex-col items-center gap-1 group"
                  onClick={() => setShowDistributeSolModal(true)}
                >
                  <div className="text-purple-300/80 group-hover:text-purple-200 transition-colors">
                    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                      <path d="M12 9V3M12 21v-6M9 12H3M21 12h-6M15.5 8.5l4-4M15.5 15.5l4 4M8.5 8.5l-4-4M8.5 15.5l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  <span className="text-purple-100 text-xs font-mono font-medium">Distribute SOL</span>
                </button>



                <div className="relative group">
                  <button
                    disabled
                    className="w-full p-3 rounded border border-orange-500/10 bg-black/20 text-orange-300/40 cursor-not-allowed flex flex-col items-center gap-1 transition-all duration-200"
                  >
                    <div className="text-orange-500/20">
                      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-orange-100/30 text-xs font-mono font-medium">Warm Up Wallet</span>
                  </button>
                  <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-orange-500/20 border border-orange-500/30 rounded-sm text-[10px] text-orange-400 font-bold tracking-wider pointer-events-none">
                    Coming Soon
                  </div>
                </div>
              </div>
            </div>



            {/* Ladder Buy Modal */}
            <LadderBuyModal
              isOpen={showLadderBuyModal}
              onClose={() => setShowLadderBuyModal(false)}
              selectedWallets={selectedWallets}
              connectedWallets={connectedWallets}
              onToast={showToast}
              useJito={useJito}
              setUseJito={setUseJito}
              positionIndex={getPositionIndex('ladderBuy')}
              onMinimize={handleLadderBuyMinimize}
              onRestore={handleLadderBuyRestore}
              currentCoin={currentCoin}
              buildPumpBuyInstructions={buildPumpBuyInstructions}
              slippage={slippage}
              protocolType={protocolType}
              pairInfo={pairInfo}
              accountId={operator?.accountId?.toString() || ''}
              jitoTip={jitoTip}
            />

            {/* Ladder Sell Modal */}
            <LadderSellModal
              isOpen={showLadderSellModal}
              onClose={() => setShowLadderSellModal(false)}
              selectedWallets={selectedWallets}
              connectedWallets={connectedWallets}
              onToast={showToast}
              useJito={useJito}
              setUseJito={setUseJito}
              positionIndex={getPositionIndex('ladderSell')}
              onMinimize={handleLadderSellMinimize}
              onRestore={handleLadderSellRestore}
              currentCoin={currentCoin}
              buildPumpSellInstructions={buildPumpSellInstructions}
              slippage={slippage}
              protocolType={protocolType}
              pairInfo={pairInfo}
              accountId={operator?.accountId?.toString() || ''}
              jitoTip={jitoTip}
            />

            {/* Bundle Buy Modal */}
            <BundleBuyModal
              isOpen={showBundleBuyModal}
              onClose={() => setShowBundleBuyModal(false)}
              selectedWallets={selectedWallets}
              connectedWallets={connectedWallets}
              onToast={showToast}
              useJito={useJito}
              setUseJito={setUseJito}
              positionIndex={getPositionIndex('bundleBuy')}
              onMinimize={handleBundleBuyMinimize}
              onRestore={handleBundleBuyRestore}
              mintAddress={currentCoin}
              wssConnection={wssConnection}
              accountId={operator?.accountId?.toString() || ''}
              slippage={slippage}
              protocolType={protocolType}
              pairAddress={pairInfo?.pairAddress}
              jitoTip={jitoTip}
            />

            {/* Gather SOL Modal */}
            <GatherSolModal
              isOpen={showGatherSolModal}
              onClose={() => setShowGatherSolModal(false)}
              selectedWallets={selectedWallets}
              connectedWallets={connectedWallets}
              onToast={showToast}
              positionIndex={getPositionIndex('gatherSol')}
              onMinimize={handleGatherSolMinimize}
              onRestore={handleGatherSolRestore}
              wssConnection={wssConnection}
              accountId={operator?.accountId?.toString() || ''}
            />

            {/* Distribute SOL Modal */}
            <DistributeSolModal
              isOpen={showDistributeSolModal}
              onClose={() => setShowDistributeSolModal(false)}
              selectedWallets={selectedWallets}
              connectedWallets={connectedWallets}
              onToast={showToast}
              positionIndex={getPositionIndex('distributeSol')}
              onMinimize={handleDistributeSolMinimize}
              onRestore={handleDistributeSolRestore}
              wssConnection={wssConnection}
              accountId={operator?.accountId?.toString() || ''}
            />

            {/* Warm Up Wallet Modal */}
            <WarmUpWalletModal
              isOpen={showWarmUpWalletModal}
              onClose={() => setShowWarmUpWalletModal(false)}
              selectedWallets={selectedWallets}
              connectedWallets={connectedWallets}
              onToast={showToast}
              useJito={useJito}
              setUseJito={setUseJito}
              positionIndex={getPositionIndex('warmUpWallet')}
              onMinimize={handleWarmUpWalletMinimize}
              onRestore={handleWarmUpWalletRestore}
            />

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

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-500 ease-out ${showLadderBuyModal || showLadderSellModal ? 'left-4' : 'right-4'
          }`}>
          <div className="bg-green-500/20 text-green-50 px-5 py-3 rounded-md shadow-lg border border-green-400/30 font-mono text-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="text-green-200/80">✓</span>
              <span dangerouslySetInnerHTML={{ __html: toastMessage }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingTerminal;