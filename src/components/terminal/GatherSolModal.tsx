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

interface GatherSolModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWallets: string[];
  connectedWallets: Wallet[];
  onToast: (message: string) => void;
  positionIndex?: number;
  onMinimize?: () => void;
  onRestore?: () => void;
}

const GatherSolModal: React.FC<GatherSolModalProps> = ({
  isOpen,
  onClose,
  selectedWallets,
  connectedWallets,
  onToast,
  positionIndex = 3,
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

  // Gather SOL state
  const [receiverWalletId, setReceiverWalletId] = useState<string>('');
  const [isGatheringSol, setIsGatheringSol] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [gatherSolAbortController, setGatherSolAbortController] = useState<AbortController | null>(null);
  const [gatheredWallets, setGatheredWallets] = useState<string[]>([]);
  const [gatherSolQueue, setGatherSolQueue] = useState<string[]>([]);

  // Modal minimize state
  const [isMinimized, setIsMinimized] = useState(false);

  // Initialize modal when opened
  React.useEffect(() => {
    if (isOpen) {
      setReceiverWalletId('');
      setIsGatheringSol(false);
      setIsCancelled(false);
      setGatherSolAbortController(null);
      setGatheredWallets([]);
      setGatherSolQueue([]);
      setIsMinimized(false);
    }
  }, [isOpen]);

  // Get available sender wallets (all selected except receiver)
  const getSenderWallets = () => {
    return selectedWallets.filter(id => id !== receiverWalletId);
  };

  // Calculate total SOL that can be gathered
  const getTotalGatherableSOL = () => {
    return getSenderWallets().reduce((total, walletId) => {
      const wallet = connectedWallets.find(w => w.id === walletId);
      return total + (wallet?.solBalance || 0);
    }, 0);
  };

  // Gather SOL execution
  const startGatherSol = async () => {
    if (isGatheringSol) return;

    if (selectedWallets.length < 2) {
      onToast('Please select at least 2 wallets for gathering');
      return;
    }

    const senderWallets = getSenderWallets();
    if (senderWallets.length === 0) {
      onToast('Please select at least one sender wallet');
      return;
    }

    if (!receiverWalletId) {
      onToast('Please select a receiver wallet');
      return;
    }

    setIsGatheringSol(true);
    setIsCancelled(false);

    // Reset queues for fresh execution (allows retries)
    setGatherSolQueue(senderWallets);
    setGatheredWallets([]);

    const abortController = new AbortController();
    setGatherSolAbortController(abortController);

    const receiverWallet = connectedWallets.find(w => w.id === receiverWalletId);
    const receiverName = receiverWallet?.name || `Wallet ${receiverWalletId.slice(-4)}`;

    // Create batches of 5 wallets each
    const batches: string[][] = [];
    for (let i = 0; i < senderWallets.length; i += 5) {
      batches.push(senderWallets.slice(i, i + 5));
    }

    onToast(`Starting SOL gathering to ${receiverName} (${batches.length} batches, ${senderWallets.length} transfers)...`);

    try {
      for (const batch of batches) {
        if (abortController.signal.aborted) {
          return;
        }

        // Process batch of up to 5 wallets
        const batchTransfers = batch.map(senderWalletId => {
          const senderWallet = connectedWallets.find(w => w.id === senderWalletId);
          if (!senderWallet) return null;

          const amount = senderWallet.solBalance;
          if (amount <= 0.001) return null; // Skip wallets with very low balance

          return {
            senderWalletId,
            senderName: senderWallet.name || `Wallet ${senderWalletId.slice(-4)}`,
            amount
          };
        }).filter(Boolean);

        if (batchTransfers.length > 0) {
          // Send batch transfer request
          onToast(`Processing batch: ${batchTransfers.length} transfers to ${receiverName}`);

          // TODO: Send actual batch SOL transfer request via WSS
          // const batchTransferRequest = {
          //   type: 'batch_sol_transfer_request',
          //   userId: operator?.userId?.toString() || 'unknown',
          //   requestId: `batch_transfer_${Date.now()}`,
          //   transfers: batchTransfers.map(transfer => ({
          //     fromWalletId: transfer.senderWalletId,
          //     toWalletId: receiverWalletId,
          //     amount: transfer.amount
          //   }))
          // };
          // wssConnection.send(JSON.stringify(batchTransferRequest));

          // Simulate processing delay for batch
          await new Promise(resolve => setTimeout(resolve, 1500));

          // Mark batch wallets as processed
          setGatheredWallets(prev => [...prev, ...batchTransfers.map(t => t!.senderWalletId)]);
        }
      }

      const totalTransfers = senderWallets.filter(id => {
        const wallet = connectedWallets.find(w => w.id === id);
        return wallet && wallet.solBalance > 0.001;
      }).length;

      onToast(`SOL gathering completed! ${totalTransfers} transfers processed in ${batches.length} batches.`);
      setIsGatheringSol(false);
      setGatherSolAbortController(null);
    } catch (error) {
      console.error('Gather SOL error:', error);
      onToast('SOL gathering failed');
      setIsGatheringSol(false);
      setGatherSolAbortController(null);
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
          className="bg-black/90 border border-cyan-500/30 rounded-lg p-3 shadow-2xl hover:border-cyan-400/50 transition-all duration-200 group"
          style={{
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 40px rgba(6, 182, 212, 0.1)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-cyan-400">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="text-left">
              <div className="text-cyan-100 font-mono text-xs font-medium">Gather SOL</div>
              <div className="text-cyan-500/70 font-mono text-[10px]">
                {isGatheringSol ? `${Math.ceil(gatheredWallets.length / 5)}/${Math.ceil(gatherSolQueue.length / 5)} batches` : 'Minimized'}
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M7 14l5-5 5 5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]" onClick={handleBackdropClick}>
      <div className="bg-black/90 border border-cyan-500/30 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(6, 182, 212, 0.3), 0 0 60px rgba(6, 182, 212, 0.2), 0 0 100px rgba(6, 182, 212, 0.1)',
              filter: 'drop-shadow(0 10px 25px rgba(0, 0, 0, 0.5))'
            }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-cyan-500/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-cyan-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-cyan-400">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-cyan-300 font-mono font-semibold text-sm">Gather SOL</h2>
              <span className="text-cyan-500/60 text-xs font-mono">• Consolidate funds</span>
            </div>
           </div>
           <div className="flex items-center gap-0.5">
             <button
               onClick={() => {
                 setIsMinimized(true);
                 onMinimize?.();
               }}
               className="text-cyan-400 hover:text-cyan-300 transition-colors p-1.5 rounded hover:bg-cyan-500/10"
             >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
               </svg>
             </button>
             <button
               onClick={onClose}
               className="text-cyan-400 hover:text-cyan-300 transition-colors p-1.5 rounded hover:bg-cyan-500/10"
             >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
               </svg>
             </button>
           </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left Section - Wallet Selection */}
          <div className="flex-1 p-6 border-r border-cyan-500/20 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-cyan-300 font-mono font-medium text-sm">
                  Select Wallets ({selectedWallets.length})
                </div>
              </div>

              {/* Wallet Grid - All wallets, 4x3 viewport (9-12 visible), scrollable */}
              <div className="max-h-[420px] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {selectedWallets.map((walletId, index) => {
                    const wallet = connectedWallets.find(w => w.id === walletId);
                    const isReceiver = receiverWalletId === walletId;

                    return (
                      <div
                        key={walletId}
                        className={`bg-black/40 border rounded-lg p-3 hover:border-cyan-400/50 transition-colors min-h-[100px] cursor-pointer ${
                          isReceiver ? 'border-cyan-400 shadow-lg shadow-cyan-500/20' : 'border-cyan-500/30'
                        }`}
                        onClick={() => setReceiverWalletId(isReceiver ? '' : walletId)}
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-cyan-100 font-mono text-[11px] font-medium truncate">
                              {wallet?.name || `Wallet ${index + 1}`}
                            </div>
                            <div className="text-cyan-500/60 font-mono text-[10px] truncate">
                              {wallet?.publicKey.slice(0, 4)}...{wallet?.publicKey.slice(-4)}
                            </div>
                          </div>
                        </div>

                        {/* Balances */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            <span className="text-cyan-500/70 font-mono text-[10px]">SOL</span>
                            <span className="text-cyan-100 font-mono text-[11px]">{wallet?.solBalance?.toFixed(3) || '0.000'}</span>
                          </div>
                        </div>

                        {/* Role Indicator */}
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            isReceiver
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'bg-gray-500/20 text-gray-400'
                          }`}>
                            {isReceiver ? '🎯 Receiver' : 'Sender'}
                          </span>
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
              {/* Instructions */}
              <div className="space-y-2">
                <h4 className="text-cyan-300 font-mono font-medium text-sm">How it works</h4>
                <div className="text-cyan-300/80 font-mono text-xs space-y-1">
                  <p>1. Select a wallet to be the <strong>receiver</strong> (marked with 🎯)</p>
                  <p>2. All other selected wallets will send their SOL to the receiver</p>
                  <p>3. Only wallets with SOL balance {'>'} 0.001 will be processed</p>
                </div>
              </div>

              {/* Summary */}
              {selectedWallets.length > 0 && receiverWalletId && (
                <div className="p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/20">
                  <h5 className="text-cyan-300 font-mono font-medium text-xs mb-2">Gather Summary</h5>
                  <div className="grid grid-cols-1 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-cyan-500/70 font-mono">Receiver</span>
                      <span className="text-cyan-100 font-mono">
                        {connectedWallets.find(w => w.id === receiverWalletId)?.name || `Wallet ${receiverWalletId.slice(-4)}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyan-500/70 font-mono">Sender Wallets</span>
                      <span className="text-cyan-100 font-mono">{getSenderWallets().length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyan-500/70 font-mono">Batches (5 wallets each)</span>
                      <span className="text-cyan-100 font-mono">{Math.ceil(getSenderWallets().length / 5)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-cyan-500/70 font-mono">Est. Total SOL</span>
                      <span className="text-cyan-100 font-mono">{getTotalGatherableSOL().toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-cyan-500/20 p-4">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isGatheringSol}
              className="flex-1 py-2 px-3 rounded-lg border border-cyan-500/30 bg-black/60 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm"
            >
              {isGatheringSol ? 'Running...' : 'Cancel'}
            </button>
            {isGatheringSol ? (
              <button
                onClick={async () => {
                  setIsCancelled(true);
                  if (gatherSolAbortController) {
                    gatherSolAbortController.abort();
                  }
                  await new Promise(resolve => setTimeout(resolve, 100));
                  setIsGatheringSol(false);
                  onToast('SOL gathering paused');
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-yellow-400 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M6 4h4v16H6V4zM14 4h4v16h-4V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Pause
              </button>
            ) : (
              <button
                onClick={() => startGatherSol()}
                disabled={selectedWallets.length < 2 || !receiverWalletId || isGatheringSol}
                className="flex-1 py-2 px-3 rounded-lg border border-cyan-400 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {isGatheringSol ? 'Gathering...' : 'Start Gather SOL'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GatherSolModal;