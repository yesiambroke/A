'use client';

import React, { useState } from 'react';

interface Wallet {
  id: string;
  name: string;
  publicKey: string;
  solBalance: number;
  splBalance: number;
  lastUpdated?: number;
}

interface LadderSellModalProps {
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
  currentCoin: string;
  buildPumpSellInstructions: (params: {
    mintAddress: string;
    tokenAmount: string;
    walletPublicKey: string;
    walletId: string;
    slippage?: number;
    protocol?: 'v1' | 'amm';
    pairAddress?: string;
  }) => Promise<{
    success: boolean;
    instructions?: any[];
    tokenAmount?: string;
    solAmount?: string;
    error?: string;
  }>;
  slippage: string;
  protocolType: 'v1' | 'amm' | null;
  pairInfo: any;
}

const LadderSellModal: React.FC<LadderSellModalProps> = ({
  isOpen,
  onClose,
  selectedWallets,
  connectedWallets,
  onToast,
  useJito,
  setUseJito,
  positionIndex = 1,
  onMinimize,
  onRestore,
  currentCoin,
  buildPumpSellInstructions,
  slippage,
  protocolType,
  pairInfo
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
  const [ladderSellAmounts, setLadderSellAmounts] = useState<Record<string, string>>({});
  const [ladderSellAmount, setLadderSellAmount] = useState('');
  const [ladderSellDelay, setLadderSellDelay] = useState('1');

  // Randomization state
  const [ladderSellRandomPercentage, setLadderSellRandomPercentage] = useState(60);
  const [ladderSellMinPercentage, setLadderSellMinPercentage] = useState(20);
  const [ladderSellTargetAmount, setLadderSellTargetAmount] = useState('');
  const [useTargetAmountSell, setUseTargetAmountSell] = useState(false);

  // Ladder sell execution state
  const [isLadderSellRunning, setIsLadderSellRunning] = useState(false);
  const [isLadderSellCancelled, setIsLadderSellCancelled] = useState(false);
  const [ladderSellAbortController, setLadderSellAbortController] = useState<AbortController | null>(null);
  const [ladderSellQueue, setLadderSellQueue] = useState<string[]>([]);
  const [processedLadderSellWallets, setProcessedLadderSellWallets] = useState<string[]>([]);

  // Modal minimize state
  const [isMinimized, setIsMinimized] = useState(false);

  // Initialize modal when opened
  React.useEffect(() => {
    if (isOpen) {
      setLadderSellAmounts({});
      setLadderSellAmount('');
      setLadderSellDelay('1');

      // Reset execution state
      setIsLadderSellRunning(false);
      setIsLadderSellCancelled(false);
      setLadderSellAbortController(null);
      setLadderSellQueue([]);
      setProcessedLadderSellWallets([]);
      setIsMinimized(false);
      onRestore?.();
    }
  }, [isOpen]);

  // Calculate randomized percentage for a wallet
  const calculateRandomizedPercentage = (walletId: string) => {
    const wallet = connectedWallets.find(w => w.id === walletId);
    if (!wallet) return '';

    if (useTargetAmountSell && ladderSellTargetAmount) {
      // Distribute target percentage proportionally across wallets based on their token balance
      const targetPercentage = parseFloat(ladderSellTargetAmount);
      if (!isNaN(targetPercentage) && targetPercentage > 0) {
        // Calculate total token balance across all selected wallets
        const totalBalance = selectedWallets.reduce((total, id) => {
          const w = connectedWallets.find(w => w.id === id);
          return total + (w?.splBalance || 0);
        }, 0);

        if (totalBalance > 0) {
          // Calculate proportional share for this wallet
          const proportionalShare = (wallet.splBalance / totalBalance) * targetPercentage;

          // Apply randomization within min/max percentage range
          const minPercent = ladderSellMinPercentage / 100;
          const maxPercent = ladderSellRandomPercentage / 100;
          const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;

          const randomizedPercentage = proportionalShare * randomPercent;

          // Cap at 100% - never exceed available tokens
          const finalPercentage = Math.min(randomizedPercentage, 100);

          // Only return percentage if wallet has balance, otherwise return empty string
          return wallet.splBalance > 0 ? Math.min(Math.max(finalPercentage, 1), 100).toFixed(1) : '';
        }
      }
      return '';
    } else {
      // Use randomized percentage between min and max
      const minPercent = ladderSellMinPercentage / 100;
      const maxPercent = ladderSellRandomPercentage / 100;
      const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;
      const percentage = randomPercent * 100; // Convert back to percentage
      return Math.min(Math.max(percentage, 1), 100).toFixed(1); // Between 1-100%
    }
  };

  // Handle main percentage input change - supports comma-separated values
  const handleMainAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLadderSellAmount(value);

    // Update individual amounts
    const amounts = value.split(',').map(amount => amount.trim());
    const newAmounts: Record<string, string> = {};

    // If only one amount is entered, apply it to all wallets
    if (amounts.length === 1 && amounts[0] !== '') {
      selectedWallets.forEach(walletId => {
        newAmounts[walletId] = amounts[0];
      });
    } else {
      // Otherwise, apply amounts in order
      selectedWallets.forEach((walletId, i) => {
        newAmounts[walletId] = amounts[i] || '';
      });
    }

    setLadderSellAmounts(newAmounts);
  };

  // Handle individual amount change
  const handleIndividualAmountChange = (walletId: string, value: string) => {
    const newAmounts = { ...ladderSellAmounts };
    newAmounts[walletId] = value;
    setLadderSellAmounts(newAmounts);
  };

  // Ladder sell execution
  const startLadderSell = async (walletsToProcess?: string[]) => {
    const queueToUse = walletsToProcess || ladderSellQueue;
    if (queueToUse.length === 0 || isLadderSellRunning) return;

    setIsLadderSellRunning(true);
    setIsLadderSellCancelled(false);
    setLadderSellQueue(queueToUse); // Ensure queue is set

    const abortController = new AbortController();
    setLadderSellAbortController(abortController);

    onToast(`Starting ladder sell for ${queueToUse.length} remaining wallets...`);

    try {
      for (const walletId of queueToUse) {
        if (abortController.signal.aborted) {
          // Silently exit without showing toast when paused
          return;
        }

        const percentage = parseFloat(ladderSellAmounts[walletId] || '0');
        if (percentage <= 0 || percentage > 100) {
          setProcessedLadderSellWallets(prev => [...prev, walletId]);
          continue;
        }

        // Get wallet info
        const wallet = connectedWallets.find(w => w.id === walletId);
        if (!wallet) {
          onToast(`❌ Wallet ${walletId} not found`);
          setProcessedLadderSellWallets(prev => [...prev, walletId]);
          continue;
        }

        const walletName = wallet.name || `Wallet ${walletId.slice(-4)}`;

        // Calculate token amount from percentage
        const tokenAmount = (wallet.splBalance * percentage) / 100;

        // Skip if no tokens to sell
        if (!wallet.splBalance || tokenAmount <= 0) {
          onToast(`⚠️ ${walletName}: No tokens to sell`);
          setProcessedLadderSellWallets(prev => [...prev, walletId]);
          continue;
        }

        try {
          // Execute actual sell trade via WSS
          onToast(`💥 ${walletName}: Selling ${percentage}% (${tokenAmount.toFixed(2)} tokens)...`);

          const result = await buildPumpSellInstructions({
            mintAddress: currentCoin,
            tokenAmount: tokenAmount.toString(),
            walletPublicKey: wallet.publicKey,
            walletId: walletId,
            slippage: parseFloat(slippage) || 5,
            protocol: protocolType || 'v1',
            pairAddress: pairInfo?.pairAddress
          });

          if (!result.success) {
            onToast(`❌ ${walletName}: ${result.error || 'Trade failed'}`);
          }
          // Success notification will come from WebSocket listener

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          onToast(`❌ ${walletName}: ${errorMsg}`);
        }

        // Mark as processed
        setProcessedLadderSellWallets(prev => [...prev, walletId]);

        // Delay before next wallet (with cancellation checks)
        const delayMs = (parseFloat(ladderSellDelay) || 1) * 1000;
        const checkInterval = 50; // Check every 50ms

        for (let elapsed = 0; elapsed < delayMs; elapsed += checkInterval) {
          if (abortController.signal.aborted) {
            // Silently exit without showing toast when paused
            return;
          }
          const remainingDelay = Math.min(checkInterval, delayMs - elapsed);
          await new Promise(resolve => setTimeout(resolve, remainingDelay));
        }
      }

      // Remove processed wallets from queue
      setLadderSellQueue(prev => prev.filter(id => !processedLadderSellWallets.includes(id)));

      onToast('✅ Ladder sell completed successfully!');

      setIsLadderSellRunning(false);
      setLadderSellAbortController(null);
    } catch (error) {
      console.error('Ladder sell error:', error);
      onToast('❌ Ladder sell failed');
      setIsLadderSellRunning(false);
      setLadderSellAbortController(null);
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
          className="bg-black/90 border border-red-500/30 rounded-lg p-3 shadow-2xl hover:border-red-400/50 transition-all duration-200 group"
          style={{
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 40px rgba(239, 68, 68, 0.1)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-red-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-red-400">
                <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-red-100 font-mono text-xs font-medium">Ladder Sell</div>
              <div className="text-red-500/70 font-mono text-[10px]">
                {isLadderSellRunning ? `${processedLadderSellWallets.length}/${selectedWallets.length}` : 'Minimized'}
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M7 14l5-5 5 5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]" onClick={handleBackdropClick}>
      <div className="bg-black/90 border border-red-500/30 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(239, 68, 68, 0.3), 0 0 60px rgba(239, 68, 68, 0.2), 0 0 100px rgba(239, 68, 68, 0.1)',
          filter: 'drop-shadow(0 10px 25px rgba(0, 0, 0, 0.5))'
        }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-red-500/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-red-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-red-400">
                <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-red-300 font-mono font-semibold text-sm">Ladder Sell</h2>
              <span className="text-red-500/60 text-xs font-mono">• Sequential processing</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setIsMinimized(true);
                onMinimize?.();
              }}
              className="text-red-400 hover:text-red-300 transition-colors p-1.5 rounded hover:bg-red-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-red-400 hover:text-red-300 transition-colors p-1.5 rounded hover:bg-red-500/10"
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
          <div className="flex-1 p-6 border-r border-red-500/20 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-red-300 font-mono font-medium text-sm">
                  Selected Wallets ({selectedWallets.length})
                </div>
              </div>

              {/* Wallet Grid - All wallets, 4x3 viewport (9-12 visible), scrollable */}
              <div className="max-h-[420px] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {selectedWallets.map((walletId, index) => {
                    const wallet = connectedWallets.find(w => w.id === walletId);
                    const amount = ladderSellAmounts[walletId] || '';
                    const isProcessed = processedLadderSellWallets.includes(walletId);
                    const isQueued = ladderSellQueue.includes(walletId);

                    return (
                      <div
                        key={walletId}
                        className="bg-black/40 border border-red-500/30 rounded-lg p-3 hover:border-red-400/50 transition-colors min-h-[100px]"
                      >
                        {/* Compact Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-red-100 font-mono text-[11px] font-medium truncate">
                              {wallet?.name || `Wallet ${index + 1}`}
                            </div>
                            <div className="text-red-500/60 font-mono text-[10px] truncate">
                              {wallet?.publicKey.slice(0, 4)}...{wallet?.publicKey.slice(-4)}
                            </div>
                          </div>

                          {isProcessed ? (
                            <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-red-500/20 text-red-300 text-[10px] font-mono flex-shrink-0">
                              ✓
                            </span>
                          ) : isQueued ? (
                            <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-[10px] font-mono flex-shrink-0">
                              ○
                            </span>
                          ) : null}
                        </div>

                        {/* Compact Balances - Single Line */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            <span className="text-red-500/70 font-mono text-[10px]">SOL</span>
                            <span className="text-red-100 font-mono text-[11px]">{wallet?.solBalance?.toFixed(3) || '0.000'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-red-500/70 font-mono text-[10px]">SPL</span>
                            <span className="text-red-100 font-mono text-[11px]">{wallet?.splBalance ? formatCompact(wallet.splBalance, 2) : '0'}</span>
                          </div>
                        </div>

                        {/* Percentage Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={amount}
                            onChange={(e) => handleIndividualAmountChange(walletId, e.target.value)}
                            placeholder="100"
                            className="w-14 rounded border border-red-500/30 bg-black/60 px-1.5 py-1 text-red-100 placeholder:text-red-500/40 focus:outline-none focus:border-red-400 text-[11px] text-center"
                            disabled={isLadderSellRunning}
                          />
                          <span className="text-red-500/60 text-[10px] font-mono">%</span>
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
              {/* Amount Input */}
              <div className="space-y-2">
                <div>
                  <label className="block text-red-300/80 font-mono text-xs font-medium mb-1">Sell Percentages (%)</label>
                  <input
                    type="text"
                    value={ladderSellAmount}
                    onChange={handleMainAmountChange}
                    placeholder="100 or 50,75,100"
                    className="w-full rounded border border-red-500/30 bg-black/60 px-3 py-1.5 text-red-100 placeholder:text-red-500/40 focus:outline-none focus:border-red-400 text-xs"
                    disabled={isLadderSellRunning}
                  />
                  <div className="text-red-500/60 text-xs font-mono mt-1">
                    Single percentage for all, or comma-separated for individual
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-3">
                <h4 className="text-red-300 font-mono font-medium text-sm">Settings</h4>

                <div className="space-y-2">
                  {/* Randomization Controls */}
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <label className="block text-red-300/80 font-mono text-xs font-medium">Random Percentages</label>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-red-300/80 font-mono text-xs mb-1">Min %</label>
                          <input
                            type="number"
                            value={ladderSellMinPercentage}
                            onChange={(e) => setLadderSellMinPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
                            className="w-full rounded border border-red-500/30 bg-black/60 px-2 py-1.5 text-red-100 focus:outline-none focus:border-red-400 text-xs"
                            disabled={isLadderSellRunning}
                            min="1"
                            max="100"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-red-300/80 font-mono text-xs mb-1">Max %</label>
                          <input
                            type="number"
                            value={ladderSellRandomPercentage}
                            onChange={(e) => setLadderSellRandomPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 60)))}
                            className="w-full rounded border border-red-500/30 bg-black/60 px-2 py-1.5 text-red-100 focus:outline-none focus:border-red-400 text-xs"
                            disabled={isLadderSellRunning}
                            min="1"
                            max="100"
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newAmounts: Record<string, string> = {};
                            selectedWallets.forEach(walletId => {
                              newAmounts[walletId] = calculateRandomizedPercentage(walletId);
                            });
                            setLadderSellAmounts(newAmounts);

                            // Update main input to show all calculated percentages
                            const amountsArray = selectedWallets.map(walletId => newAmounts[walletId] || '');
                            setLadderSellAmount(amountsArray.join(','));
                          }}
                          className="px-3 py-1.5 rounded border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-100 text-xs font-mono transition-colors whitespace-nowrap"
                          disabled={isLadderSellRunning}
                        >
                          🎲 Randomize
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="useTargetAmountSell"
                        checked={useTargetAmountSell}
                        onChange={(e) => setUseTargetAmountSell(e.target.checked)}
                        disabled={isLadderSellRunning}
                        className="rounded border border-red-500/30 bg-black/60 text-red-400 focus:outline-none focus:border-red-400"
                      />
                      <label htmlFor="useTargetAmountSell" className="text-red-300/80 font-mono text-xs">Use proportional target percentage</label>
                    </div>

                    {useTargetAmountSell && (
                      <div className="flex items-center gap-2">
                        <label className="text-red-300/80 font-mono text-xs font-medium whitespace-nowrap">Target</label>
                        <input
                          type="text"
                          value={ladderSellTargetAmount}
                          onChange={(e) => setLadderSellTargetAmount(e.target.value)}
                          placeholder="100"
                          className="w-20 rounded border border-red-500/30 bg-black/60 px-2 py-1 text-red-100 placeholder:text-red-500/40 focus:outline-none focus:border-red-400 text-xs"
                          disabled={isLadderSellRunning}
                        />
                        <span className="text-red-300/80 font-mono text-xs">%</span>
                        <span
                          className="text-red-400/70 hover:text-red-300 text-xs cursor-help"
                          title="Distributed proportionally by token balance + randomized within min/max %"
                        >
                          (?)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-red-500/20">
                    <div className="flex items-center gap-3">
                      <label className="text-red-300/80 font-mono text-xs font-medium whitespace-nowrap">Delay</label>
                      <input
                        type="text"
                        value={ladderSellDelay}
                        onChange={(e) => setLadderSellDelay(e.target.value)}
                        placeholder="1"
                        className="w-10 rounded border border-red-500/30 bg-black/60 px-2 py-1 text-red-100 placeholder:text-red-500/40 focus:outline-none focus:border-red-400 text-xs"
                        disabled={isLadderSellRunning}
                      />
                      <span className="text-red-500/60 text-xs font-mono">sec</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          id="useJitoSell"
                          checked={useJito}
                          onChange={(e) => setUseJito(e.target.checked)}
                          disabled={isLadderSellRunning}
                          className="rounded border border-red-500/30 bg-black/60 text-red-400 focus:outline-none focus:border-red-400"
                        />
                        <label htmlFor="useJitoSell" className="text-red-300/80 font-mono text-xs cursor-pointer">Jito</label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {selectedWallets.length > 0 && (
                <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                  <h5 className="text-red-300 font-mono font-medium text-xs mb-2">Process Summary</h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-red-500/70 font-mono">Wallets</span>
                      <span className="text-red-100 font-mono">{selectedWallets.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500/70 font-mono">Est. Avg %</span>
                      <span className="text-red-100 font-mono">
                        {Object.values(ladderSellAmounts).length > 0
                          ? (Object.values(ladderSellAmounts).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0) / Object.values(ladderSellAmounts).length).toFixed(1)
                          : '0'}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500/70 font-mono">Duration</span>
                      <span className="text-red-100 font-mono">
                        ~{Math.max(1, (selectedWallets.length - 1) * parseFloat(ladderSellDelay || '1'))}s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-500/70 font-mono">Jito</span>
                      <span className="text-red-100 font-mono">{useJito ? 'On' : 'Off'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-red-500/20 p-4">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLadderSellRunning}
              className="flex-1 py-2 px-3 rounded-lg border border-red-500/30 bg-black/60 text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm"
            >
              {isLadderSellRunning ? 'Running...' : 'Cancel'}
            </button>
            {isLadderSellRunning ? (
              <button
                onClick={async () => {
                  // Pause - cancel current process but keep progress
                  setIsLadderSellCancelled(true);
                  if (ladderSellAbortController) {
                    ladderSellAbortController.abort();
                  }
                  // Wait a bit for the abort to take effect
                  await new Promise(resolve => setTimeout(resolve, 100));
                  setIsLadderSellRunning(false);
                  onToast('Ladder sell paused');
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-yellow-400 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M6 4h4v16H6V4zM14 4h4v16h-4V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pause
              </button>
            ) : processedLadderSellWallets.length > 0 ? (
              <button
                onClick={() => {
                  // Resume - start with remaining wallets, reset cancelled state
                  const remainingWallets = selectedWallets.filter(id => !processedLadderSellWallets.includes(id));
                  setIsLadderSellCancelled(false); // Reset cancelled state
                  setLadderSellAbortController(null); // Reset abort controller
                  startLadderSell(remainingWallets); // Pass wallets directly
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-red-400 bg-red-500/20 text-red-100 hover:bg-red-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Resume ({selectedWallets.filter(id => !processedLadderSellWallets.includes(id)).length})
              </button>
            ) : (
              <button
                onClick={() => {
                  startLadderSell(selectedWallets.slice());
                }}
                disabled={selectedWallets.length === 0 || !Object.values(ladderSellAmounts).some(amount => amount && parseFloat(amount) > 0 && parseFloat(amount) <= 100)}
                className="flex-1 py-2 px-3 rounded-lg border border-red-400 bg-red-500/20 text-red-100 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Start Ladder Sell
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LadderSellModal;