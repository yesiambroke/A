'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ConnectionState, MarketData, NormalizedToken } from '@/types/market';

export interface TradeData {
  txId: string;
  wallet: string;
  timestamp: number;
  type: 'buy' | 'sell';
  spotPriceSol: number;
  usdPricePerToken: number;
  solAmount: number;
  usdAmount: number;
  tokenAmount: number;
  virtualSolReserves: number;
  virtualTokenReserves: number;
}

export interface UseMarketDataReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  marketData: MarketData;
  lastError: string | null;
  clearError: () => void;
  reconnect: () => void;
  refreshTrending: () => Promise<void>;
  subscribeToTrades: (tokenMint: string, callback: (trade: TradeData) => void) => () => void;
  fetchRecentTrades: (tokenMint: string) => Promise<TradeData[]>;
}

const MARKET_RELAY_WS_URL =
  process.env.NEXT_PUBLIC_MARKET_RELAY_WS_URL ||
  (process.env.NODE_ENV === 'production' ? 'wss://market-data.a-trade.fun' : 'ws://localhost:8081');

const MARKET_RELAY_API_URL =
  process.env.NEXT_PUBLIC_MARKET_RELAY_API_URL ||
  (process.env.NODE_ENV === 'production' ? 'https://token-api.a-trade.fun' : 'http://localhost:8082');
const RECONNECT_INTERVAL = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

const dedupeTokens = (tokens: NormalizedToken[]) => {
  const seen = new Set<string>();
  return tokens.filter((token) => {
    if (seen.has(token.tokenAddress)) {
      return false;
    }
    seen.add(token.tokenAddress);
    return true;
  });
};

export const useMarketData = (): UseMarketDataReturn => {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [marketData, setMarketData] = useState<MarketData>({
    trending: [],
    finalStretch: [],
    migrated: [],
    newMint: [],
    solPrice: null,
    lastUpdate: null,
  });
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const tradeSubscriptionsRef = useRef<Map<string, Set<(trade: TradeData) => void>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const initialDataLoadedRef = useRef(false);
  const lastUpdateTimestampRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCachedDataRef = useRef(false);
  const pendingUpdatesRef = useRef<NormalizedToken[]>([]);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isConnected = connectionState === 'connected';

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const refreshTrending = useCallback(async () => {
    try {
      const [trendingResponse, marketDataResponse] = await Promise.all([
        fetch(`${MARKET_RELAY_API_URL}/api/trending`),
        fetch(`${MARKET_RELAY_API_URL}/api/market-data`),
      ]);

      if (!trendingResponse.ok) {
        throw new Error(`Trending HTTP ${trendingResponse.status}: ${trendingResponse.statusText}`);
      }
      if (!marketDataResponse.ok) {
        throw new Error(`Market data HTTP ${marketDataResponse.status}: ${marketDataResponse.statusText}`);
      }

      const [trendingResult, marketDataResult] = await Promise.all([
        trendingResponse.json(),
        marketDataResponse.json(),
      ]);

      if (trendingResult.success && trendingResult.data && marketDataResult.success) {
        setMarketData((prev) => ({
          ...prev,
          trending: dedupeTokens(trendingResult.data),
          solPrice: marketDataResult.data.solPrice,
          lastUpdate: trendingResult.lastUpdate || new Date().toISOString(),
        }));
        setConnectionState('connected');
        clearError();
      } else {
        throw new Error(trendingResult.error || marketDataResult.error || 'Failed to fetch trending data');
      }
    } catch (error) {
      setLastError(`Failed to load trending coins: ${(error as Error).message}`);
      setConnectionState('error');
    }
  }, [clearError]);

  const fetchRecentTrades = useCallback(async (tokenMint: string) => {
    if (tokenMint === 'So11111111111111111111111111111112') return [];
    const resp = await fetch(`${MARKET_RELAY_API_URL}/api/trades?mint=${tokenMint}`);
    if (!resp.ok) {
      throw new Error(`Trades HTTP ${resp.status}`);
    }
    const result = await resp.json();
    if (result?.success && Array.isArray(result.trades)) {
      return result.trades as TradeData[];
    }
    return [];
  }, []);

  const debouncedUpdateTokens = useCallback((updates: NormalizedToken[] = []) => {
    if (!mountedRef.current) return;

    const tokensToUpdate = updates.length > 0 ? updates : [...pendingUpdatesRef.current];
    if (tokensToUpdate.length === 0) return;

    pendingUpdatesRef.current = [];

    setMarketData((prev) => {
      const updated = { ...prev };
      let changed = false;

      updates.forEach((token) => {
        if (token.status === 'migrated') {
          const migratedIdx = updated.migrated.findIndex((t) => t.tokenAddress === token.tokenAddress);
          if (migratedIdx !== -1) {
            updated.migrated[migratedIdx] = {
              ...updated.migrated[migratedIdx],
              ...token,
            };
            changed = true;
          } else if (updated.migrated.length < 20) {
            updated.migrated.push(token);
            changed = true;
          } else {
            const lowestMC = updated.migrated[updated.migrated.length - 1]?.marketCapUSD || 0;
            if ((token.marketCapUSD || 0) > lowestMC) {
              updated.migrated[updated.migrated.length - 1] = token;
              changed = true;
            }
          }
        }

        const fsIdx = updated.finalStretch.findIndex((t) => t.tokenAddress === token.tokenAddress);
        if (fsIdx !== -1 && token.status === 'final_stretch') {
          updated.finalStretch[fsIdx] = {
            ...updated.finalStretch[fsIdx],
            ...token,
          };
          changed = true;
        } else if (fsIdx === -1 && token.status === 'final_stretch' && updated.finalStretch.length < 20) {
          updated.finalStretch.push(token);
          changed = true;
        } else if (fsIdx === -1 && token.status === 'final_stretch' && updated.finalStretch.length >= 20) {
          const lowestProgress = updated.finalStretch[updated.finalStretch.length - 1]?.bondingCurveProgress || 0;
          if ((token.bondingCurveProgress || 0) > lowestProgress) {
            updated.finalStretch[updated.finalStretch.length - 1] = token;
            changed = true;
          }
        }

        if (fsIdx !== -1 && token.status === 'migrated') {
          updated.finalStretch.splice(fsIdx, 1);
          if (updated.migrated.length < 20) {
            updated.migrated.push(token);
          } else {
            const lowestMC = updated.migrated[updated.migrated.length - 1]?.marketCapUSD || 0;
            if ((token.marketCapUSD || 0) > lowestMC) {
              updated.migrated[updated.migrated.length - 1] = token;
            }
          }
          changed = true;
        }

        // Handle new mint token updates
        const nmIdx = updated.newMint.findIndex((t) => t.tokenAddress === token.tokenAddress);
        if (nmIdx !== -1) {
          updated.newMint[nmIdx] = {
            ...updated.newMint[nmIdx],
            ...token,
          };
          changed = true;
        } else if (token.status === 'new' && updated.newMint.length < 20) {
          updated.newMint.push(token);
          changed = true;
        } else if (token.status === 'new' && updated.newMint.length >= 20) {
          const oldestTime = new Date(updated.newMint[updated.newMint.length - 1]?.createdAt || 0).getTime();
          const tokenTime = new Date(token.createdAt || 0).getTime();
          if (tokenTime > oldestTime) {
            updated.newMint[updated.newMint.length - 1] = token;
            changed = true;
          }
        }
      });

      if (changed) {
        // Keep existing order to avoid jumps - server sends sorted data
        updated.lastUpdate = new Date().toISOString();
        hasCachedDataRef.current =
          updated.migrated.length > 0 || updated.finalStretch.length > 0 || updated.trending.length > 0 || updated.newMint.length > 0;
      }

      return changed ? updated : prev;
    });
  }, []);

  const setError = useCallback((error: string) => {
    if (hasCachedDataRef.current && error.includes('cached data')) {
      return;
    }

    setLastError((prev) => {
      if (prev === error) {
        return prev;
      }
      return error;
    });
  }, []);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'market_data':
            if (message.data) {
              const newTimestamp = message.data.lastUpdate || new Date().toISOString();

              setMarketData((prev) => {
                const newData = {
                  trending: initialDataLoadedRef.current ? prev.trending : dedupeTokens(message.data.trending || []),
                  finalStretch: dedupeTokens(message.data.finalStretch || []),
                  migrated: dedupeTokens(message.data.migrated || []),
                  newMint: dedupeTokens(message.data.newMint || []),
                  solPrice: message.data.solPrice || prev.solPrice,
                  lastUpdate: newTimestamp,
                };

                hasCachedDataRef.current =
                  newData.trending.length > 0 || newData.migrated.length > 0 || newData.finalStretch.length > 0 || newData.newMint.length > 0;

                if (!initialDataLoadedRef.current) {
                  initialDataLoadedRef.current = true;
                  lastUpdateTimestampRef.current = newTimestamp;
                }

                return newData;
              });
            }
            break;

          case 'new_token':
            if (message.data && initialDataLoadedRef.current) {
              const token: NormalizedToken = message.data;

              setMarketData((prev) => {
                const updated = { ...prev };
                let changed = false;

                if (token.status === 'migrated') {
                  if (!updated.migrated.some((t) => t.tokenAddress === token.tokenAddress)) {
                    const tokenMC = token.marketCapUSD || 0;
                    const lowestMC =
                      updated.migrated.length >= 20
                        ? updated.migrated[updated.migrated.length - 1]?.marketCapUSD || 0
                        : 0;

                    if (updated.migrated.length < 20 || tokenMC > lowestMC) {
                      updated.migrated.push(token);
                      updated.migrated.sort((a, b) => (b.marketCapUSD || 0) - (a.marketCapUSD || 0));
                      updated.migrated = updated.migrated.slice(0, 20);
                      changed = true;
                    }
                  }
                } else if (token.status === 'final_stretch') {
                  if (!updated.finalStretch.some((t) => t.tokenAddress === token.tokenAddress)) {
                    const tokenProgress = token.bondingCurveProgress || 0;
                    const lowestProgress =
                      updated.finalStretch.length >= 20
                        ? updated.finalStretch[updated.finalStretch.length - 1]?.bondingCurveProgress || 0
                        : 0;

                    if (updated.finalStretch.length < 20 || tokenProgress > lowestProgress) {
                      updated.finalStretch.push(token);
                      updated.finalStretch.sort(
                        (a, b) => (b.bondingCurveProgress || 0) - (a.bondingCurveProgress || 0)
                      );
                      updated.finalStretch = updated.finalStretch.slice(0, 20);
                      changed = true;
                    }
                  }
                }

                if (changed) {
                  updated.lastUpdate = new Date().toISOString();
                  hasCachedDataRef.current =
                    updated.migrated.length > 0 || updated.finalStretch.length > 0 || updated.trending.length > 0 || updated.newMint.length > 0;
                }

                return changed ? updated : prev;
              });
            }
            break;

          case 'token_update':
            if (message.data && initialDataLoadedRef.current) {
              const token: NormalizedToken = message.data;
              pendingUpdatesRef.current.push(token);

              if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
              }

              debouncedUpdateTokens();
            }
            break;

           case 'trending_update':
             if (message.data && Array.isArray(message.data) && initialDataLoadedRef.current) {
               setMarketData((prev) => ({
                 ...prev,
                 trending: dedupeTokens(message.data),
                 lastUpdate: new Date().toISOString(),
               }));
               hasCachedDataRef.current = true;
             }
             break;

           case 'new_mint_update':
             if (message.data && initialDataLoadedRef.current) {
               const token: NormalizedToken = message.data;

               setMarketData((prev) => {
                 const updated = { ...prev };
                 let changed = false;

                 if (token.status === 'new') {
                   if (!updated.newMint.some((t) => t.tokenAddress === token.tokenAddress)) {
                     const tokenTime = new Date(token.createdAt || 0).getTime();
                     const oldestTime =
                       updated.newMint.length >= 20
                         ? new Date(updated.newMint[updated.newMint.length - 1]?.createdAt || 0).getTime()
                         : 0;

                     if (updated.newMint.length < 20 || tokenTime > oldestTime) {
                       updated.newMint.push(token);
                       updated.newMint.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
                       updated.newMint = updated.newMint.slice(0, 20);
                       changed = true;
                     }
                   }
                 }

                 if (changed) {
                   updated.lastUpdate = new Date().toISOString();
                   hasCachedDataRef.current =
                     updated.migrated.length > 0 || updated.finalStretch.length > 0 || updated.trending.length > 0 || updated.newMint.length > 0;
                 }

                 return changed ? updated : prev;
               });
             }
             break;

           case 'sol_price':
              if (message.data && message.data.price) {
                setMarketData((prev) => ({
                  ...prev,
                  solPrice: message.data.price,
                  lastUpdate: new Date().toISOString(),
                }));
              }
              break;

           case 'trade_update':
             if (message.mint && message.trade) {
               const callbacks = tradeSubscriptionsRef.current.get(message.mint);
               if (callbacks) {
                 for (const callback of callbacks) {
                   try {
                     callback(message.trade);
                   } catch (error) {
                     console.error('Error in trade callback:', error);
                   }
                 }
               }
             }
             break;

           case 'trade_subscribed':
             console.log(`✅ Subscribed to trades for ${message.mint}`);
             break;

           case 'trade_unsubscribed':
             console.log(`✅ Unsubscribed from trades for ${message.mint}`);
             break;

           case 'trade_error':
             console.error(`❌ Trade subscription error for ${message.mint}:`, message.error);
             break;

           default:
             break;
        }
      } catch (error) {
        console.error('Error parsing market data message:', error);
        setError('Invalid message received');
      }
    },
    [debouncedUpdateTokens, setError]
  );

  const connect = useCallback(() => {
    if (connectingRef.current) {
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (error) {
        console.warn('Error closing previous market relay socket:', error);
      }
      wsRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    try {
      connectingRef.current = true;
      setConnectionState('connecting');
      clearError();

      const ws = new WebSocket(MARKET_RELAY_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        connectingRef.current = false;
        reconnectAttemptsRef.current = 0;
        if (mountedRef.current) {
          setConnectionState('connected');
          clearError();
        }

        // Re-send any pending trade subscriptions after reconnect/open
        tradeSubscriptionsRef.current.forEach((_callbacks, mint) => {
          try {
            ws.send(JSON.stringify({
              type: 'join',
              room: 'trades',
              mint
            }));
            console.log(`📤 Frontend: Re-sent trade subscription for ${mint} after reconnect`);
          } catch (error) {
            console.warn('Error re-sending trade subscription', mint, error);
          }
        });

        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          } else {
            if (pingIntervalRef.current) {
              clearInterval(pingIntervalRef.current);
              pingIntervalRef.current = null;
            }
          }
        }, 30000);
      };

      ws.onmessage = handleMessage;

      ws.onclose = (event) => {
        connectingRef.current = false;

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (mountedRef.current) {
          setConnectionState('disconnected');

          if (event.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current++;
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && !connectingRef.current) {
                connect();
              }
            }, RECONNECT_INTERVAL);
          } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            if (!hasCachedDataRef.current) {
              setError('Failed to reconnect to market relay. Please refresh the page.');
            }
          }
        }
      };

      ws.onerror = (error) => {
        connectingRef.current = false;
        console.warn('Market relay WebSocket error:', error);

        if (!hasCachedDataRef.current) {
          setLastError('Market relay unavailable. Using cached data.');
        } else {
          setLastError(null);
        }

        if (mountedRef.current) {
          setConnectionState('error');
        }
      };
    } catch (error) {
      connectingRef.current = false;
      console.warn('Market relay connection attempt failed:', error);

      if (!hasCachedDataRef.current) {
        setLastError('Market relay server not available');
      } else {
        setLastError(null);
      }

      setConnectionState('error');
    }
  }, [clearError, handleMessage, setError]);

  const reconnect = useCallback(() => {
  reconnectAttemptsRef.current = 0;
  if (wsRef.current) {
    wsRef.current.close();
  }
  connect();
  }, [connect]);

  const disconnect = useCallback(() => {
    connectingRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    pendingUpdatesRef.current = [];

    if (wsRef.current) {
      try {
        wsRef.current.close(1000, 'Intentional disconnect');
      } catch (error) {
        console.warn('Error closing market relay socket during disconnect:', error);
      }
      wsRef.current = null;
    }

    setConnectionState('disconnected');
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Rely on WebSocket data for initial load - no need for API call

    return () => {
      mountedRef.current = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
      pendingUpdatesRef.current = [];
      disconnect();
    };
  }, [connect, disconnect]);

  const subscribeToTrades = useCallback((tokenMint: string, callback: (trade: TradeData) => void) => {
    console.log(`🎯 Frontend: Subscribing to trades for token: ${tokenMint}`);

    // Initialize subscription set for this token if not exists
    if (!tradeSubscriptionsRef.current.has(tokenMint)) {
      tradeSubscriptionsRef.current.set(tokenMint, new Set());
    }

    // Add callback
    tradeSubscriptionsRef.current.get(tokenMint)!.add(callback);

    // Send subscription message if WebSocket is connected
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({
        type: 'join',
        room: 'trades',
        mint: tokenMint
      });
      console.log(`📤 Frontend: Sending trade subscription message: ${message}`);
      wsRef.current.send(message);
    } else {
      console.log(`⚠️ Frontend: WebSocket not connected, cannot subscribe to trades for ${tokenMint}`);
    }

    // Return unsubscribe function
    return () => {
      console.log(`🎯 Frontend: Unsubscribing from trades for token: ${tokenMint}`);
      const callbacks = tradeSubscriptionsRef.current.get(tokenMint);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          tradeSubscriptionsRef.current.delete(tokenMint);

          // Send unsubscription message
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
              type: 'leave',
              room: 'trades',
              mint: tokenMint
            });
            console.log(`📤 Frontend: Sending trade unsubscription message: ${message}`);
            wsRef.current.send(message);
          }
        }
      }
    };
  }, []);

  return {
    connectionState,
    isConnected,
    marketData,
    lastError,
    clearError,
  reconnect,
  refreshTrending,
  subscribeToTrades,
  fetchRecentTrades,
};
};
