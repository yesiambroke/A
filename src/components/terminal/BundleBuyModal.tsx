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

// ... imports
// Assuming existing imports are fine for now

interface BundleBuyModalProps {
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
  mintAddress: string;
  wssConnection: WebSocket | null;
  accountId?: string;
  slippage: string;
  protocolType: 'v1' | 'amm' | null;
  pairAddress?: string;
  jitoTip: number | null;
}

const BundleBuyModal: React.FC<BundleBuyModalProps> = ({
  isOpen,
  onClose,
  selectedWallets,
  connectedWallets,
  onToast,
  useJito,
  setUseJito,
  positionIndex = 2,
  onMinimize,
  onRestore,
  mintAddress,
  wssConnection,
  accountId,
  slippage,
  protocolType,
  pairAddress,
  jitoTip
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
  const [bundleBuyAmounts, setBundleBuyAmounts] = useState<Record<string, string>>({});
  const [bundleBuyAmount, setBundleBuyAmount] = useState('');
  const [bundleBuyDelay, setBundleBuyDelay] = useState('1');

  // Launch strategy and execution
  const [launchStrategy, setLaunchStrategy] = useState<'pentad' | 'ignis'>('pentad');
  const [executionMode, setExecutionMode] = useState<'turbo' | 'safe'>('safe');

  // Randomization state
  const [bundleBuyRandomPercentage, setBundleBuyRandomPercentage] = useState(60);
  const [bundleBuyMinPercentage, setBundleBuyMinPercentage] = useState(20);
  const [bundleBuyTargetAmount, setBundleBuyTargetAmount] = useState('');
  const [useTargetAmount, setUseTargetAmount] = useState(false);

  // Bundle buy execution state
  const [isBundleBuyRunning, setIsBundleBuyRunning] = useState(false);
  const [isBundleBuyCancelled, setIsBundleBuyCancelled] = useState(false);
  const [bundleBuyAbortController, setBundleBuyAbortController] = useState<AbortController | null>(null);
  const [bundleBuyBatches, setBundleBuyBatches] = useState<string[][]>([]);
  const [processedBatches, setProcessedBatches] = useState<number[]>([]);

  // Modal minimize state
  const [isMinimized, setIsMinimized] = useState(false);

  // Initialize modal when opened
  React.useEffect(() => {
    if (isOpen) {
      setBundleBuyAmounts({});
      setBundleBuyAmount('');
      setBundleBuyDelay('1');

      // Reset execution state
      setIsBundleBuyRunning(false);
      setIsBundleBuyCancelled(false);
      setBundleBuyAbortController(null);
      setBundleBuyBatches([]);
      setProcessedBatches([]);
      setIsMinimized(false);
      onRestore?.();
    }
  }, [isOpen]);

  // Calculate randomized amount for a wallet
  const calculateRandomizedAmount = (walletId: string) => {
    const wallet = connectedWallets.find(w => w.id === walletId);
    if (!wallet) return '';

    if (useTargetAmount && bundleBuyTargetAmount) {
      // Distribute target amount proportionally across wallets based on their SOL balance
      const targetAmount = parseFloat(bundleBuyTargetAmount);
      if (!isNaN(targetAmount) && targetAmount > 0) {
        // Calculate total SOL balance across all selected wallets
        const totalBalance = selectedWallets.reduce((total, id) => {
          const w = connectedWallets.find(w => w.id === id);
          return total + (w?.solBalance || 0);
        }, 0);

        if (totalBalance > 0) {
          // Apply randomization within min/max percentage range directly to wallet balance
          const minPercent = bundleBuyMinPercentage / 100;
          const maxPercent = bundleBuyRandomPercentage / 100;
          const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;

          const randomizedAmount = wallet.solBalance * randomPercent;

          // Cap at wallet balance
          const finalAmount = Math.min(randomizedAmount, wallet.solBalance);

          // Only return amount if wallet has balance, otherwise return empty string
          return wallet.solBalance > 0 ? Math.max(finalAmount, 0.000001).toFixed(3) : '';
        }
      }
      return '';
    } else {
      // Use randomized percentage of SOL balance
      const minPercent = bundleBuyMinPercentage / 100;
      const maxPercent = bundleBuyRandomPercentage / 100;
      const randomPercent = Math.random() * (maxPercent - minPercent) + minPercent;
      const amount = wallet.solBalance * randomPercent;
      return Math.max(amount, 0.000001).toFixed(3); // Minimum 0.000001 SOL, capped at 3 decimals
    }
  };

  // Handle main amount input change - supports comma-separated values
  const handleMainAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setBundleBuyAmount(value);

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

    setBundleBuyAmounts(newAmounts);
  };

  // Handle individual amount change
  const handleIndividualAmountChange = (walletId: string, value: string) => {
    const newAmounts = { ...bundleBuyAmounts };
    newAmounts[walletId] = value;
    setBundleBuyAmounts(newAmounts);
  };


  // Bundle buy execution
  const startBundleBuy = async () => {
    if (isBundleBuyRunning) return;

    if (!wssConnection || wssConnection.readyState !== WebSocket.OPEN) {
      onToast('❌ Not connected to server');
      return;
    }

    if (!mintAddress || mintAddress === 'So11111111111111111111111111111112') {
      onToast('❌ Invalid token selected');
      return;
    }

    setIsBundleBuyRunning(true);
    setIsBundleBuyCancelled(false);

    const abortController = new AbortController();
    setBundleBuyAbortController(abortController);

    try {
      if (executionMode === 'safe') {
        // SAFE MODE: Batch-by-batch with server confirmation
        await executeSafeMode(abortController);
      } else {
        // TURBO MODE: All wallets at once
        await executeTurboMode(abortController);
      }
    } catch (error) {
      console.error('Bundle buy error:', error);
      onToast('Bundle buy failed');
    } finally {
      setIsBundleBuyRunning(false);
      setBundleBuyAbortController(null);
    }
  };

  // Safe Mode: Send batches sequentially, wait for confirmation
  const executeSafeMode = async (abortController: AbortController) => {
    // Determine batch size based on strategy
    const currentBatchSize = launchStrategy === 'ignis'
      ? Math.floor(Math.random() * 4) + 2 // Random 2-5 for Ignis
      : 5; // Fixed 5 for Pentad

    // Create batches
    const batches: string[][] = [];
    for (let i = 0; i < selectedWallets.length; i += currentBatchSize) {
      batches.push(selectedWallets.slice(i, i + currentBatchSize));
    }

    if (batches.length === 0) return;

    setBundleBuyBatches(batches);
    setProcessedBatches([]);

    onToast(`🛡️ Safe Mode: ${batches.length} batches of max ${currentBatchSize} wallets`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      if (abortController.signal.aborted) {
        onToast('❌ Bundle buy cancelled');
        return;
      }

      const batch = batches[batchIndex];

      // Check if batch has valid amounts
      const validBatch = batch.filter(walletId => {
        const amount = parseFloat(bundleBuyAmounts[walletId] || '0');
        return amount > 0;
      });

      if (validBatch.length === 0) {
        setProcessedBatches(prev => [...prev, batchIndex]);
        continue;
      }

      onToast(`📦 Batch ${batchIndex + 1}/${batches.length}: ${validBatch.length} wallets`);

      // Send batch and wait for confirmation
      const success = await sendBatchAndWaitForConfirmation(validBatch, batchIndex);

      if (!success) {
        onToast(`❌ Batch ${batchIndex + 1} failed. Stopping.`);
        return;
      }

      setProcessedBatches(prev => [...prev, batchIndex]);
      onToast(`✅ Batch ${batchIndex + 1}/${batches.length} confirmed!`);
    }

    onToast('✅ All batches completed!');
  };

  // Turbo Mode: Send all wallets at once
  const executeTurboMode = async (abortController: AbortController) => {
    // Filter valid wallets
    const validWallets = selectedWallets.filter(walletId => {
      const amount = parseFloat(bundleBuyAmounts[walletId] || '0');
      return amount > 0;
    });

    if (validWallets.length === 0) {
      onToast('❌ No valid wallets with amounts');
      return;
    }

    onToast(`⚡ Turbo Mode: ${validWallets.length} wallets at once`);

    // Send all wallets in single request
    const requestId = `bundle_buy_${Date.now()}`;
    const batchRequest = {
      type: 'bundle_buy_request',
      requestId,
      mintAddress: mintAddress,
      wallets: validWallets.map(walletId => ({
        walletId,
        amount: parseFloat(bundleBuyAmounts[walletId] || '0').toFixed(6)
      })),
      slippage: parseFloat(slippage) || 5,
      protocol: protocolType || 'v1',
      pairAddress,
      useJito,
      strategy: launchStrategy,
      executionMode: executionMode,
      // @ts-ignore - Dynamic tip update
      jitoTipAmount: jitoTip
    };

    console.log('📤 Sending Turbo Bundle Buy Request:', batchRequest);
    wssConnection?.send(JSON.stringify(batchRequest));

    // Wait for response (handled by existing message listener)
    onToast('⏳ Processing all wallets...');
  };

  // Helper: Send batch and wait for server confirmation
  const sendBatchAndWaitForConfirmation = (validBatch: string[], batchIndex: number): Promise<boolean> => {
    return new Promise((resolve) => {
      const requestId = `bundle_buy_${Date.now()}_${batchIndex}`;
      const timeout = setTimeout(() => {
        console.error(`⏰ Batch ${batchIndex} timed out`);
        resolve(false);
      }, 120000); // 2 minute timeout

      // Set up one-time listener for this batch
      const handleBatchSuccess = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'bundle_buy_batch_success' && message.requestId === requestId) {
            clearTimeout(timeout);
            wssConnection?.removeEventListener('message', handleBatchSuccess);
            console.log(`✅ Batch ${batchIndex} confirmed:`, message);
            resolve(true);
          } else if (message.type === 'error' && message.requestId === requestId) {
            clearTimeout(timeout);
            wssConnection?.removeEventListener('message', handleBatchSuccess);
            console.error(`❌ Batch ${batchIndex} error:`, message);
            resolve(false);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      wssConnection?.addEventListener('message', handleBatchSuccess);

      // Send the batch request
      const batchRequest = {
        type: 'bundle_buy_request',
        requestId,
        mintAddress: mintAddress,
        wallets: validBatch.map(walletId => ({
          walletId,
          amount: parseFloat(bundleBuyAmounts[walletId] || '0').toFixed(6)
        })),
        slippage: parseFloat(slippage) || 5,
        protocol: protocolType || 'v1',
        pairAddress,
        useJito,
        strategy: launchStrategy,
        executionMode: executionMode,
        // @ts-ignore - Dynamic tip update
        jitoTipAmount: jitoTip
      };

      console.log(`📤 Sending Batch ${batchIndex}:`, batchRequest);
      wssConnection?.send(JSON.stringify(batchRequest));
    });
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
          className="bg-black/90 border border-amber-500/30 rounded-lg p-3 shadow-2xl hover:border-amber-400/50 transition-all duration-200 group"
          style={{
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 40px rgba(245, 158, 11, 0.1)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-amber-400">
                <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-amber-100 font-mono text-xs font-medium">Bundle Buy</div>
              <div className="text-amber-500/70 font-mono text-[10px]">
                {isBundleBuyRunning ? `${processedBatches.length}/${bundleBuyBatches.length}` : 'Minimized'}
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M7 14l5-5 5 5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]" onClick={handleBackdropClick}>
      <div className="bg-black/90 border border-amber-500/30 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(245, 158, 11, 0.3), 0 0 60px rgba(245, 158, 11, 0.2), 0 0 100px rgba(245, 158, 11, 0.1)',
          filter: 'drop-shadow(0 10px 25px rgba(0, 0, 0, 0.5))'
        }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-amber-500/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-amber-400">
                <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-amber-300 font-mono font-semibold text-sm">Bundle Buy</h2>
              <span className="text-amber-500/60 text-xs font-mono">• Batch processing</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setIsMinimized(true);
                onMinimize?.();
              }}
              className="text-amber-400 hover:text-amber-300 transition-colors p-1.5 rounded hover:bg-amber-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-amber-400 hover:text-amber-300 transition-colors p-1.5 rounded hover:bg-amber-500/10"
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
          <div className="flex-1 p-6 border-r border-amber-500/20 flex flex-col">
            <div className="flex flex-col space-y-4 flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3">
                <div className="text-amber-300 font-mono font-medium text-sm">
                  Selected Wallets ({selectedWallets.length})
                </div>
              </div>

              {/* Wallet Grid - All wallets, dynamic height, scrollable */}
              <div className="flex-1 overflow-y-auto min-h-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {selectedWallets.map((walletId, index) => {
                    const wallet = connectedWallets.find(w => w.id === walletId);
                    const amount = bundleBuyAmounts[walletId] || '';
                    const isProcessed = bundleBuyBatches.some((batch, batchIndex) =>
                      batch.includes(walletId) && processedBatches.includes(batchIndex)
                    );

                    return (
                      <div
                        key={walletId}
                        className="bg-black/40 border border-amber-500/30 rounded-lg p-3 hover:border-amber-400/50 transition-colors min-h-[100px]"
                      >
                        {/* Compact Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-green-100 font-mono text-[11px] font-medium truncate">
                              {wallet?.name || `Wallet ${index + 1}`}
                            </div>
                            <div className="text-green-500/60 font-mono text-[10px] truncate">
                              {wallet?.publicKey.slice(0, 4)}...{wallet?.publicKey.slice(-4)}
                            </div>
                          </div>

                          {isProcessed ? (
                            <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-green-500/20 text-green-300 text-[10px] font-mono flex-shrink-0">
                              ✓
                            </span>
                          ) : null}
                        </div>

                        {/* Compact Balances - Single Line */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            <span className="text-amber-500/70 font-mono text-[10px]">SOL</span>
                            <span className="text-amber-100 font-mono text-[11px]">{wallet?.solBalance?.toFixed(3) || '0.000'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-amber-500/70 font-mono text-[10px]">SPL</span>
                            <span className="text-amber-100 font-mono text-[11px]">{wallet?.splBalance ? formatCompact(wallet.splBalance, 2) : '0'}</span>
                          </div>
                        </div>

                        {/* Amount Input */}
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={amount}
                            onChange={(e) => handleIndividualAmountChange(walletId, e.target.value)}
                            placeholder="0.00"
                            className="w-14 rounded border border-amber-500/30 bg-black/60 px-1.5 py-1 text-amber-100 placeholder:text-amber-500/40 focus:outline-none focus:border-amber-400 text-[11px] text-center"
                            disabled={isBundleBuyRunning}
                          />
                          <span className="text-amber-500/60 text-[10px] font-mono">SOL</span>
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
              <div className="space-y-4">
                {/* Strategy Selector */}
                <div className="space-y-2">
                  <label className="block text-amber-300/80 font-mono text-[10px] uppercase font-bold tracking-wider mb-1 px-1">Strategy</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-amber-500/5 rounded-lg border border-amber-500/10">
                    <button
                      type="button"
                      onClick={() => setLaunchStrategy('pentad')}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-md font-mono text-[10px] uppercase font-bold transition-all ${launchStrategy === 'pentad'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        : 'text-amber-500/40 hover:text-amber-400/60 hover:bg-amber-500/5'
                        }`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 5V19M10 5V19M14 5V19M18 5V19" strokeLinecap="round" />
                        <path d="M3 17L21 7" strokeLinecap="round" opacity="0.8" />
                      </svg>
                      Pentad
                    </button>
                    <button
                      type="button"
                      onClick={() => setLaunchStrategy('ignis')}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-md font-mono text-[10px] uppercase font-bold transition-all ${launchStrategy === 'ignis'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        : 'text-amber-500/40 hover:text-amber-400/60 hover:bg-amber-500/5'
                        }`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 16c3.314 0 6-2 6-5.5 0-1.5-.5-4-2.5-6 .25 1.5-1.25 2-1.25 2C11 4 9 .5 6 0c.357 2 .5 4-2 6-1.25 1-2 2.729-2 4.5C2 14 4.686 16 8 16m0-1c-1.657 0-3-1-3-2.75 0-.75.25-2 1.25-3C6.125 10 7 10.5 7 10.5c-.375-1.25.5-3.25 2-3.5-.179 1-.25 2 1 3 .625.5 1 1.364 1 2.25C11 14 9.657 15 8 15" />
                      </svg>
                      Ignis
                    </button>
                  </div>
                </div>

                {/* Execution Mode Selector */}
                <div className="space-y-2">
                  <label className="block text-amber-300/80 font-mono text-[10px] uppercase font-bold tracking-wider mb-1 px-1">Execution Mode</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-amber-500/5 rounded-lg border border-amber-500/10">
                    <button
                      type="button"
                      onClick={() => setExecutionMode('turbo')}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-md font-mono text-[10px] uppercase font-bold transition-all ${executionMode === 'turbo'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        : 'text-amber-500/40 hover:text-amber-400/60 hover:bg-amber-500/5'
                        }`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
                      </svg>
                      Turbo
                    </button>
                    <button
                      type="button"
                      onClick={() => setExecutionMode('safe')}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-md font-mono text-[10px] uppercase font-bold transition-all ${executionMode === 'safe'
                        ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30'
                        : 'text-amber-500/40 hover:text-amber-400/60 hover:bg-amber-500/5'
                        }`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
                        <path d="M9 11L11 13L15 9" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Safe
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-amber-300/80 font-mono text-xs font-medium mb-1 px-1">Buy Amounts (SOL)</label>
                  <input
                    type="text"
                    value={bundleBuyAmount}
                    onChange={handleMainAmountChange}
                    placeholder="0.1 or 0.1,0.2,0.3"
                    className="w-full rounded border border-amber-500/30 bg-black/60 px-3 py-1.5 text-amber-100 placeholder:text-amber-500/40 focus:outline-none focus:border-amber-400 text-xs shadow-inner"
                    disabled={isBundleBuyRunning}
                  />
                  <div className="text-amber-500/40 text-[10px] font-mono mt-1.5 px-1 leading-relaxed">
                    Specify a fixed amount for all wallets, or use commas for individual control.
                  </div>
                </div>
              </div>


              {/* Settings */}
              <div className="space-y-3">
                <h4 className="text-amber-300 font-mono font-medium text-sm">Randomization</h4>

                <div className="space-y-2">
                  {/* Randomization Controls */}
                  <div className="space-y-2">
                    <label className="block text-amber-300/80 font-mono text-xs font-medium">Random Amounts</label>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="block text-amber-300/80 font-mono text-xs mb-1">Min %</label>
                        <input
                          type="number"
                          value={bundleBuyMinPercentage}
                          onChange={(e) => setBundleBuyMinPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 20)))}
                          className="w-full rounded border border-amber-500/30 bg-black/60 px-2 py-1.5 text-amber-100 focus:outline-none focus:border-amber-400 text-xs"
                          disabled={isBundleBuyRunning}
                          min="1"
                          max="100"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-amber-300/80 font-mono text-xs mb-1">Max %</label>
                        <input
                          type="number"
                          value={bundleBuyRandomPercentage}
                          onChange={(e) => setBundleBuyRandomPercentage(Math.max(1, Math.min(100, parseInt(e.target.value) || 60)))}
                          className="w-full rounded border border-amber-500/30 bg-black/60 px-2 py-1.5 text-amber-100 focus:outline-none focus:border-amber-400 text-xs"
                          disabled={isBundleBuyRunning}
                          min="1"
                          max="100"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const newAmounts: Record<string, string> = {};
                          selectedWallets.forEach(walletId => {
                            newAmounts[walletId] = calculateRandomizedAmount(walletId);
                          });
                          setBundleBuyAmounts(newAmounts);

                          // Update main input to show all calculated amounts
                          const amountsArray = selectedWallets.map(walletId => newAmounts[walletId] || '');
                          setBundleBuyAmount(amountsArray.join(','));
                        }}
                        className="px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-100 text-xs font-mono transition-colors whitespace-nowrap"
                        disabled={isBundleBuyRunning}
                      >
                        🎲 Randomize
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useTargetAmount"
                      checked={useTargetAmount}
                      onChange={(e) => setUseTargetAmount(e.target.checked)}
                      disabled={isBundleBuyRunning}
                      className="rounded border border-amber-500/30 bg-black/60 text-amber-400 focus:outline-none focus:border-amber-400"
                    />
                    <label htmlFor="useTargetAmount" className="text-amber-300/80 font-mono text-xs">Use proportional target amount</label>
                  </div>

                  {useTargetAmount && (
                    <div className="flex items-center gap-2">
                      <label className="text-amber-300/80 font-mono text-xs font-medium whitespace-nowrap">Target</label>
                      <input
                        type="text"
                        value={bundleBuyTargetAmount}
                        onChange={(e) => setBundleBuyTargetAmount(e.target.value)}
                        placeholder="5.0"
                        className="w-20 rounded border border-amber-500/30 bg-black/60 px-2 py-1 text-amber-100 placeholder:text-amber-500/40 focus:outline-none focus:border-amber-400 text-xs"
                        disabled={isBundleBuyRunning}
                      />
                      <span className="text-amber-300/80 font-mono text-xs">SOL</span>
                      <span
                        className="text-amber-400/70 hover:text-amber-300 text-xs cursor-help"
                        title="Distributed proportionally by wallet balance + randomized within min/max %"
                      >
                        (?)
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-amber-500/20">
                  <div className="flex items-center gap-3">
                    <label className="text-amber-300/80 font-mono text-xs font-medium whitespace-nowrap">Delay</label>
                    <input
                      type="text"
                      value={bundleBuyDelay}
                      onChange={(e) => setBundleBuyDelay(e.target.value)}
                      placeholder="1"
                      className="w-10 rounded border border-amber-500/30 bg-black/60 px-2 py-1 text-amber-100 placeholder:text-amber-500/40 focus:outline-none focus:border-amber-400 text-xs"
                      disabled={isBundleBuyRunning}
                    />
                    <span className="text-amber-500/60 text-xs font-mono">sec</span>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {selectedWallets.length > 0 && (
                <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/20">
                  <h5 className="text-amber-300 font-mono font-medium text-xs mb-2">Process Summary</h5>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-amber-500/70 font-mono">Wallets</span>
                      <span className="text-amber-100 font-mono">{selectedWallets.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-500/70 font-mono">Est. Total</span>
                      <span className="text-amber-100 font-mono">
                        {Object.values(bundleBuyAmounts).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0).toFixed(3)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-500/70 font-mono">Batches</span>
                      <span className="text-amber-100 font-mono">
                        {launchStrategy === 'ignis'
                          ? `~${Math.ceil(selectedWallets.length / 3)}`
                          : Math.ceil(selectedWallets.length / 5)
                        }
                      </span>
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-amber-500/20 p-4">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isBundleBuyRunning}
              className="flex-1 py-2 px-3 rounded-lg border border-amber-500/30 bg-black/60 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm"
            >
              {isBundleBuyRunning ? 'Running...' : 'Cancel'}
            </button>
            {isBundleBuyRunning ? (
              <button
                onClick={async () => {
                  setIsBundleBuyCancelled(true);
                  if (bundleBuyAbortController) {
                    bundleBuyAbortController.abort();
                  }
                  await new Promise(resolve => setTimeout(resolve, 100));
                  setIsBundleBuyRunning(false);
                  onToast('Bundle buy paused');
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-yellow-400 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M6 4h4v16H6V4zM14 4h4v16h-4V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pause
              </button>
            ) : processedBatches.length > 0 ? (
              <button
                onClick={() => {
                  const remainingBatches = bundleBuyBatches.slice(processedBatches.length);
                  const remainingWallets = remainingBatches.flat();
                  setIsBundleBuyCancelled(false);
                  setBundleBuyAbortController(null);
                  startBundleBuy(); // Restart with remaining batches
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-amber-400 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Resume ({bundleBuyBatches.slice(processedBatches.length).flat().length})
              </button>
            ) : (
              <button
                onClick={() => startBundleBuy()}
                disabled={selectedWallets.length === 0 || !Object.values(bundleBuyAmounts).some(amount => amount && parseFloat(amount) > 0)}
                className="flex-1 py-2 px-3 rounded-lg border border-amber-400 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M3 6h18M3 10h14M3 14h10M3 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M21 12l-3 3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Start Bundle Buy
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BundleBuyModal;