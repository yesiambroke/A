'use client';

import React, { useState, useEffect } from 'react';

interface Wallet {
  id: string;
  name: string;
  publicKey: string;
  solBalance: number;
  splBalance: number;
  lastUpdated?: number;
  index: number;
}



interface WarmUpWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWallets: string[];
  connectedWallets: Wallet[];
  onToast: (message: string) => void;
  useJito: boolean;
  setUseJito: (useJito: boolean) => void;
  positionIndex?: number;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const WarmUpWalletModal: React.FC<WarmUpWalletModalProps> = ({
  isOpen,
  onClose,
  selectedWallets,
  connectedWallets,
  onToast,
  useJito,
  setUseJito,
  positionIndex = 0,
  onMinimize,
  onRestore
}) => {
  // Utility function for formatting numbers
  const formatCompact = (value: number | null | undefined, decimals = 1) => {
    if (value == null || isNaN(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(decimals)}b`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(decimals)}m`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(decimals)}k`;
    return value.toFixed(decimals);
  };

  // Modal state
  const [warmUpTrades, setWarmUpTrades] = useState<Record<string, string>>({});
  const [warmUpTradesInput, setWarmUpTradesInput] = useState('');
  const [minTrades, setMinTrades] = useState(5);
  const [maxTrades, setMaxTrades] = useState(10);
  const [buyAmountType, setBuyAmountType] = useState<'fixed' | 'random'>('fixed');
  const [fixedBuyAmount, setFixedBuyAmount] = useState('0.02');


  // Execution state
  const [isWarmUpRunning, setIsWarmUpRunning] = useState(false);
  const [isWarmUpCancelled, setIsWarmUpCancelled] = useState(false);
  const [warmUpAbortController, setWarmUpAbortController] = useState<AbortController | null>(null);
  const [warmUpQueue, setWarmUpQueue] = useState<string[]>([]);
  const [processedWarmUpWallets, setProcessedWarmUpWallets] = useState<string[]>([]);
  const [currentWarmUpWallet, setCurrentWarmUpWallet] = useState<string | null>(null);

  // Modal minimize state
  const [isMinimized, setIsMinimized] = useState(false);

  // Initialize modal when opened
  useEffect(() => {
    if (isOpen) {
      setWarmUpTrades({});
      setWarmUpTradesInput('');
      setMinTrades(5);
      setMaxTrades(10);
      setBuyAmountType('fixed');
      setFixedBuyAmount('0.02');

      // Reset execution state
      setIsWarmUpRunning(false);
      setIsWarmUpCancelled(false);
      setWarmUpAbortController(null);
      setWarmUpQueue([]);
      setProcessedWarmUpWallets([]);
      setCurrentWarmUpWallet(null);
      setIsMinimized(false);
      onRestore?.();
    }
  }, [isOpen]);



  // Handle main trades input change
  const handleMainTradesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setWarmUpTradesInput(value);

    // Update individual trades
    const trades = value.split(',').map(trade => trade.trim());
    const newTrades: Record<string, string> = {};

    // If only one number is entered, apply it to all wallets
    if (trades.length === 1 && trades[0] !== '') {
      selectedWallets.forEach(walletId => {
        newTrades[walletId] = trades[0];
      });
    } else {
      // Otherwise, apply amounts in order
      selectedWallets.forEach((walletId, i) => {
        newTrades[walletId] = trades[i] || '';
      });
    }

    setWarmUpTrades(newTrades);
  };

  // Handle individual trades change
  const handleIndividualTradesChange = (walletId: string, value: string) => {
    const newTrades = { ...warmUpTrades };
    newTrades[walletId] = value;
    setWarmUpTrades(newTrades);
  };



  // Execute a warm up trade cycle (buy + sell) for a wallet
  // TODO: Replace with WebSocket call to light WSS server
  const executeWarmUpTrade = async (walletId: string, amount: string) => {
    // Simulate trade execution (replace with actual WSS call later)
    console.log(`[SIMULATION] Executing warm up trade for wallet ${walletId}: ${amount} SOL`);

    // Simulate random delay (1-3 seconds to mimic real trade processing)
    const delay = Math.random() * 2000 + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Simulate success (95% success rate)
    const success = Math.random() > 0.05;

    if (success) {
      return {
        success: true,
        txId: `sim_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
    } else {
      return {
        success: false,
        error: 'Simulated trade failure'
      };
    }

    // TODO: Replace simulation with actual WebSocket call:
    // const wallet = connectedWallets.find(w => w.id === walletId);
    // const wsMessage = {
    //   type: 'warmUpTrade',
    //   walletId: walletId, // or wallet.publicKey, depending on your WSS protocol
    //   amount: parseFloat(amount),
    //   useJito,
    //   slippageBps: 700
    // };
    // wssConnection.send(JSON.stringify(wsMessage));
  };

  // Add a random delay between transactions
  const randomDelay = (minSec = 1, maxSec = 3) => {
    const delay = Math.random() * (maxSec - minSec) + minSec;
    return new Promise(resolve => setTimeout(resolve, delay * 1000));
  };

  // Process warm up for a single wallet
  const processWalletWarmUp = async (walletId: string, numTrades: number) => {
    try {
      setCurrentWarmUpWallet(walletId);
      const wallet = connectedWallets.find(w => w.id === walletId);
      if (!wallet) return false;

      onToast(`🔄 ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Starting ${numTrades} trades...`);

      // Process each trade sequentially
      for (let i = 0; i < numTrades; i++) {
        // Check if cancelled before starting a new trade
        if (!isWarmUpRunning && i > 0) {
          onToast(`⚠️ ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Warm Up cancelled, stopping after current trade`);
          return true;
        }

        // Determine buy amount (fixed or random)
        let tradeAmount: string;
        if (buyAmountType === 'fixed') {
          tradeAmount = fixedBuyAmount;
        } else {
          tradeAmount = (Math.random() * (0.03 - 0.012) + 0.012).toFixed(3);
        }

        // Execute the trade cycle (server handles coin selection, buy + sell)
        onToast(`🔄 ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Executing trade ${i + 1}/${numTrades}...`);
        const tradeResult = await executeWarmUpTrade(walletId, tradeAmount);

        if (!tradeResult.success) {
          onToast(`❌ ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Trade ${i + 1} failed after max retries`);
          continue;
        }

        onToast(`✅ ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Trade ${i + 1} completed successfully`);

        // Random delay between trades (2-8 seconds) unless it's the last trade
        if (i < numTrades - 1 && isWarmUpRunning) {
          await randomDelay(2, 8);
        }
      }

      if (!isWarmUpRunning) {
        onToast(`✅ ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Warm Up cancelled after completing current trade`);
      } else {
        onToast(`✅ ${wallet.name || `Wallet ${walletId.slice(-4)}`}: Completed all ${numTrades} trades`);
      }
      setCurrentWarmUpWallet(null);
      return true;
    } catch (error) {
      const wallet = connectedWallets.find(w => w.id === walletId);
      onToast(`❌ ${wallet?.name || `Wallet ${walletId.slice(-4)}`}: Error - ${error instanceof Error ? error.message : 'Unknown error'}`);
      setCurrentWarmUpWallet(null);
      return false;
    }
  };

  // Start the warm up process for all selected wallets
  const startWarmUp = async (walletsToProcess?: string[]) => {
    const queueToUse = walletsToProcess || warmUpQueue;
    if (queueToUse.length === 0 || isWarmUpRunning) return;

    setIsWarmUpRunning(true);
    setIsWarmUpCancelled(false);
    setWarmUpQueue(queueToUse);

    const abortController = new AbortController();
    setWarmUpAbortController(abortController);

    onToast(`Starting Warm Up Wallet process for ${queueToUse.length} remaining wallets...`);

    try {
      // Process each wallet sequentially
      for (const walletId of queueToUse) {
        if (abortController.signal.aborted) {
          return;
        }

        const numTrades = parseInt(warmUpTrades[walletId] || '5');
        const wallet = connectedWallets.find(w => w.id === walletId);

        if (!wallet) {
          onToast(`⚠️ Wallet ${walletId} not found, skipping...`);
          continue;
        }

        if (wallet.solBalance < 0.01) {
          onToast(`⚠️ ${wallet.name || `Wallet ${walletId.slice(-4)}`} has insufficient SOL balance (${wallet.solBalance.toFixed(3)} SOL), skipping...`);
          continue;
        }

        onToast(`🔄 Processing ${wallet.name || `Wallet ${walletId.slice(-4)}`} - ${numTrades} coins...`);

        // Process the wallet
        const success = await processWalletWarmUp(walletId, numTrades);

        if (success) {
          setProcessedWarmUpWallets(prev => [...prev, walletId]);
        }

        // Remove from queue regardless of success to prevent getting stuck
        setWarmUpQueue(prev => prev.filter(id => id !== walletId));

        // Add delay between wallets (3-10 seconds) unless it's the last wallet or we're cancelled
        if (queueToUse.indexOf(walletId) !== queueToUse.length - 1 && isWarmUpRunning) {
          const delaySeconds = Math.floor(Math.random() * 7) + 3;
          onToast(`⏱️ Waiting ${delaySeconds} seconds before processing next wallet...`);
          await randomDelay(3, 10);
        }
      }

      if (isWarmUpRunning) {
        onToast('✅ Warm Up Wallet process completed successfully');
      }
    } catch (error) {
      console.error('Warm Up error:', error);
      onToast('❌ Warm Up Wallet failed');
    } finally {
      setIsWarmUpRunning(false);
      setWarmUpAbortController(null);
      setCurrentWarmUpWallet(null);
    }
  };

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Render minimized widget or full modal
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 z-[9999]" style={{ right: `${1 + (positionIndex * 7)}rem` }}>
        <button
          onClick={() => {
            setIsMinimized(false);
            onRestore?.();
          }}
          className="bg-black/90 border border-orange-500/30 rounded-lg p-3 shadow-2xl hover:border-orange-400/50 transition-all duration-200 group"
          style={{
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 40px rgba(249, 115, 22, 0.1)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-orange-400">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-orange-100 font-mono text-xs font-medium">Warm Up Wallet</div>
              <div className="text-orange-500/70 font-mono text-[10px]">
                {isWarmUpRunning ? `${processedWarmUpWallets.length}/${selectedWallets.length}` : 'Minimized'}
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-orange-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M7 14l5-5 5 5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]" onClick={handleBackdropClick}>
      <div className="bg-black/90 border border-orange-500/30 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(249, 115, 22, 0.3), 0 0 60px rgba(249, 115, 22, 0.2), 0 0 100px rgba(249, 115, 22, 0.1)',
          filter: 'drop-shadow(0 10px 25px rgba(0, 0, 0, 0.5))'
        }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-orange-500/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-orange-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-orange-400">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-orange-300 font-mono font-semibold text-sm">Warm Up Wallet</h2>
              <span className="text-orange-500/60 text-xs font-mono">• Create trading history</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setIsMinimized(true);
                onMinimize?.();
              }}
              className="text-orange-400 hover:text-orange-300 transition-colors p-1.5 rounded hover:bg-orange-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-orange-400 hover:text-orange-300 transition-colors p-1.5 rounded hover:bg-orange-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex min-h-0">

          {/* Left Section - Wallet Grid */}
          <div className="flex-1 p-6 border-r border-orange-500/20 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-orange-300 font-mono font-medium text-sm">
                  Selected Wallets ({selectedWallets.length})
                </div>

              </div>



              {/* Wallet Grid - All wallets, 4x3 viewport (9-12 visible), scrollable */}
              <div className="max-h-[420px] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {selectedWallets.map((walletId, index) => {
                    const wallet = connectedWallets.find(w => w.id === walletId);
                    const numTrades = warmUpTrades[walletId] || '';
                    const isProcessed = processedWarmUpWallets.includes(walletId);
                    const isQueued = warmUpQueue.includes(walletId);
                    const isCurrent = currentWarmUpWallet === walletId;

                    return (
                      <div
                        key={walletId}
                        className="bg-black/40 border border-orange-500/30 rounded-lg p-3 hover:border-orange-400/50 transition-colors min-h-[100px]"
                      >
                        {/* Compact Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-orange-100 font-mono text-[11px] font-medium truncate">
                              {wallet?.name || `Wallet ${index + 1}`}
                            </div>
                            <div className="text-orange-500/60 font-mono text-[10px] truncate">
                              {wallet?.publicKey.slice(0, 4)}...{wallet?.publicKey.slice(-4)}
                            </div>
                          </div>

                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-mono flex-shrink-0">
                              ◯
                            </span>
                          ) : isProcessed ? (
                            <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-mono flex-shrink-0">
                              ✓
                            </span>
                          ) : isQueued ? (
                            <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-mono flex-shrink-0">
                              ◯
                            </span>
                          ) : null}
                        </div>

                        {/* Compact Balances - Single Line */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            <span className="text-orange-500/70 font-mono text-[10px]">SOL</span>
                            <span className="text-orange-100 font-mono text-[11px]">{wallet?.solBalance?.toFixed(3) || '0.000'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-orange-500/70 font-mono text-[10px]">SPL</span>
                            <span className="text-orange-100 font-mono text-[11px]">{wallet?.splBalance ? formatCompact(wallet.splBalance, 2) : '0'}</span>
                          </div>
                        </div>

                        {/* Trades Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={numTrades}
                            onChange={(e) => handleIndividualTradesChange(walletId, e.target.value)}
                            placeholder="5"
                            className="w-14 rounded border border-orange-500/30 bg-black/60 px-1.5 py-1 text-orange-100 placeholder:text-orange-500/40 focus:outline-none focus:border-orange-400 text-[11px] text-center"
                            disabled={isWarmUpRunning}
                          />
                          <span className="text-orange-500/60 text-[10px] font-mono">trades</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Section - Controls */}
          <div className="w-80 p-6 overflow-y-auto">
            <div className="space-y-6">
              {/* Trades Input */}
              <div className="space-y-2">
                <div>
                  <label className="block text-orange-300/80 font-mono text-xs font-medium mb-1">Number of Trades</label>
                  <input
                    type="text"
                    value={warmUpTradesInput}
                    onChange={handleMainTradesChange}
                    placeholder="5 or 5,8,3"
                    className="w-full rounded border border-orange-500/30 bg-black/60 px-3 py-1.5 text-orange-100 placeholder:text-orange-500/40 focus:outline-none focus:border-orange-400 text-xs"
                    disabled={isWarmUpRunning}
                  />
                  <div className="text-orange-500/60 text-xs font-mono mt-1">
                    Single number for all, or comma-separated for individual
                  </div>
                </div>
              </div>

              {/* Trades Randomizer */}
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-orange-300/80 font-mono text-xs mb-1">Min Trades</label>
                    <input
                      type="number"
                      value={minTrades}
                      onChange={(e) => setMinTrades(Math.max(1, Math.min(50, parseInt(e.target.value) || 5)))}
                      className="w-full rounded border border-orange-500/30 bg-black/60 px-2 py-1.5 text-orange-100 focus:outline-none focus:border-orange-400 text-xs"
                      disabled={isWarmUpRunning}
                      min="1"
                      max="50"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-orange-300/80 font-mono text-xs mb-1">Max Trades</label>
                    <input
                      type="number"
                      value={maxTrades}
                      onChange={(e) => setMaxTrades(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
                      className="w-full rounded border border-orange-500/30 bg-black/60 px-2 py-1.5 text-orange-100 focus:outline-none focus:border-orange-400 text-xs"
                      disabled={isWarmUpRunning}
                      min="1"
                      max="50"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const newTrades: Record<string, string> = {};
                      selectedWallets.forEach(walletId => {
                        const randomTrades = Math.floor(Math.random() * (maxTrades - minTrades + 1)) + minTrades;
                        newTrades[walletId] = randomTrades.toString();
                      });
                      setWarmUpTrades(newTrades);

                      // Update main input to show all calculated amounts
                      const tradesArray = selectedWallets.map(walletId => newTrades[walletId]);
                      setWarmUpTradesInput(tradesArray.join(','));
                    }}
                    className="px-3 py-1.5 rounded border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 text-orange-100 text-xs font-mono transition-colors whitespace-nowrap"
                    disabled={isWarmUpRunning}
                  >
                    🎲 Randomize
                  </button>
                </div>
              </div>

              {/* Buy Amount Settings */}
              <div className="space-y-3">
                <h4 className="text-orange-300 font-mono font-medium text-sm">Buy Amount Settings</h4>

                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="buyAmountType"
                        value="fixed"
                        checked={buyAmountType === 'fixed'}
                        onChange={(e) => setBuyAmountType(e.target.value as 'fixed' | 'random')}
                        disabled={isWarmUpRunning}
                        className="rounded border border-orange-500/30 bg-black/60 text-orange-400 focus:outline-none focus:border-orange-400"
                      />
                      <span className="text-orange-300/80 font-mono text-xs">Fixed Amount</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="buyAmountType"
                        value="random"
                        checked={buyAmountType === 'random'}
                        onChange={(e) => setBuyAmountType(e.target.value as 'fixed' | 'random')}
                        disabled={isWarmUpRunning}
                        className="rounded border border-orange-500/30 bg-black/60 text-orange-400 focus:outline-none focus:border-orange-400"
                      />
                      <span className="text-orange-300/80 font-mono text-xs">Random (0.012-0.03 SOL)</span>
                    </label>
                  </div>

                  {buyAmountType === 'fixed' && (
                    <div className="flex items-center gap-2">
                      <label className="text-orange-300/80 font-mono text-xs font-medium whitespace-nowrap">Amount</label>
                      <input
                        type="text"
                        value={fixedBuyAmount}
                        onChange={(e) => setFixedBuyAmount(e.target.value)}
                        placeholder="0.02"
                        className="w-20 rounded border border-orange-500/30 bg-black/60 px-2 py-1 text-orange-100 placeholder:text-orange-500/40 focus:outline-none focus:border-orange-400 text-xs"
                        disabled={isWarmUpRunning}
                      />
                      <span className="text-orange-300/80 font-mono text-xs">SOL</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <div className="pt-2 border-t border-orange-500/20">
                  <div className="flex items-center gap-3">
                    <label className="text-orange-300/80 font-mono text-xs font-medium whitespace-nowrap">Options</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        id="useJitoWarmUp"
                        checked={useJito}
                        onChange={(e) => setUseJito(e.target.checked)}
                        disabled={isWarmUpRunning}
                        className="rounded border border-orange-500/30 bg-black/60 text-orange-400 focus:outline-none focus:border-orange-400"
                      />
                      <label htmlFor="useJitoWarmUp" className="text-orange-300/80 font-mono text-xs cursor-pointer">Jito</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {selectedWallets.length > 0 && (
                <div className="p-3 bg-orange-500/5 rounded-lg border border-orange-500/20">
                  <h5 className="text-orange-300 font-mono font-medium text-xs mb-2">Process Summary</h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-orange-500/70 font-mono">Wallets</span>
                      <span className="text-orange-100 font-mono">{selectedWallets.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-500/70 font-mono">Avg Trades</span>
                      <span className="text-orange-100 font-mono">
                        {Math.round(Object.values(warmUpTrades).reduce((sum, trades) => sum + (parseInt(trades) || 5), 0) / selectedWallets.length) || 5}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-orange-500/70 font-mono">Jito</span>
                      <span className="text-orange-100 font-mono">{useJito ? 'On' : 'Off'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-orange-500/20 p-4">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isWarmUpRunning}
              className="flex-1 py-2 px-3 rounded-lg border border-orange-500/30 bg-black/60 text-orange-300 hover:bg-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm"
            >
              {isWarmUpRunning ? 'Running...' : 'Cancel'}
            </button>
            {isWarmUpRunning ? (
              <button
                onClick={async () => {
                  setIsWarmUpCancelled(true);
                  if (warmUpAbortController) {
                    warmUpAbortController.abort();
                  }
                  await new Promise(resolve => setTimeout(resolve, 100));
                  setIsWarmUpRunning(false);
                  onToast('Warm Up Wallet paused');
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-yellow-400 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M6 4h4v16H6V4zM14 4h4v16h-4V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pause
              </button>
            ) : processedWarmUpWallets.length > 0 ? (
              <button
                onClick={() => {
                  const remainingWallets = selectedWallets.filter(id => !processedWarmUpWallets.includes(id));
                  setIsWarmUpCancelled(false);
                  setWarmUpAbortController(null);
                  startWarmUp(remainingWallets);
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-orange-400 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Resume ({selectedWallets.filter(id => !processedWarmUpWallets.includes(id)).length})
              </button>
            ) : (
              <button
                onClick={() => {
                  startWarmUp(selectedWallets.slice());
                }}
                disabled={selectedWallets.length === 0 || !Object.values(warmUpTrades).some(trades => trades && parseInt(trades) > 0)}
                className="flex-1 py-2 px-3 rounded-lg border border-orange-400 bg-orange-500/20 text-orange-100 hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Start Warm Up Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarmUpWalletModal;