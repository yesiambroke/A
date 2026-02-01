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

interface DistributeSolModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWallets: string[];
  connectedWallets: Wallet[];
  onToast: (message: string) => void;
  positionIndex?: number;
  onMinimize?: () => void;
  onRestore?: () => void;
  wssConnection: WebSocket | null;
  accountId?: string;
}

const DistributeSolModal: React.FC<DistributeSolModalProps> = ({
  isOpen,
  onClose,
  selectedWallets,
  connectedWallets,
  onToast,
  positionIndex = 4,
  onMinimize,
  onRestore,
  wssConnection,
  accountId
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

  // Distribute SOL state
  const [senderWalletId, setSenderWalletId] = useState<string>('');
  const [distributeAmounts, setDistributeAmounts] = useState<Record<string, string>>({});
  const [distributeAmount, setDistributeAmount] = useState('');
  const [isDistributing, setIsDistributing] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [distributeAbortController, setDistributeAbortController] = useState<AbortController | null>(null);
  const [distributedWallets, setDistributedWallets] = useState<string[]>([]);
  const [distributionQueue, setDistributionQueue] = useState<string[]>([]);

  // Modal minimize state
  const [isMinimized, setIsMinimized] = useState(false);

  // Initialize modal when opened
  React.useEffect(() => {
    if (isOpen) {
      setSenderWalletId('');
      setDistributeAmounts({});
      setDistributeAmount('');
      setIsDistributing(false);
      setIsCancelled(false);
      setDistributeAbortController(null);
      setDistributedWallets([]);
      setDistributionQueue([]);
      setIsMinimized(false);
    }
  }, [isOpen]);

  // Get available recipient wallets (all selected except sender)
  const getRecipientWallets = () => {
    return selectedWallets.filter(id => id !== senderWalletId);
  };

  // Handle main amount input change - supports comma-separated values
  const handleMainAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDistributeAmount(value);

    // Update individual amounts
    const amounts = value.split(',').map(amount => amount.trim());
    const newAmounts: Record<string, string> = {};

    const recipients = getRecipientWallets();
    // If only one amount is entered, apply it to all recipient wallets
    if (amounts.length === 1 && amounts[0] !== '') {
      recipients.forEach(walletId => {
        newAmounts[walletId] = amounts[0];
      });
    } else {
      // Otherwise, apply amounts in order
      recipients.forEach((walletId, i) => {
        newAmounts[walletId] = amounts[i] || '';
      });
    }

    setDistributeAmounts(newAmounts);
  };

  // Handle individual amount change
  const handleIndividualAmountChange = (walletId: string, value: string) => {
    const newAmounts = { ...distributeAmounts };
    newAmounts[walletId] = value;
    setDistributeAmounts(newAmounts);

    // Update the bulk input field to reflect individual changes
    const recipients = getRecipientWallets();
    const bulkAmounts = recipients.map(recipientId => newAmounts[recipientId] || '');
    setDistributeAmount(bulkAmounts.join(','));
  };

  // Calculate total SOL to be distributed
  const getTotalDistributionSOL = () => {
    return Object.values(distributeAmounts).reduce((total, amount) => {
      return total + (parseFloat(amount) || 0);
    }, 0);
  };

  // Distribute SOL execution
  const startDistributeSol = async () => {
    if (isDistributing) return;

    if (selectedWallets.length < 2) {
      onToast('Please select at least 2 wallets for distribution');
      return;
    }

    const recipients = getRecipientWallets();
    if (recipients.length === 0) {
      onToast('Please select at least one recipient wallet');
      return;
    }

    if (!senderWalletId) {
      onToast('Please select a sender wallet');
      return;
    }

    // Validate that all recipients have amounts set
    const missingAmounts = recipients.filter(walletId => !distributeAmounts[walletId] || parseFloat(distributeAmounts[walletId]) <= 0);
    if (missingAmounts.length > 0) {
      onToast('Please set valid SOL amounts for all recipient wallets');
      return;
    }

    // Validate that sender has enough SOL
    const senderWallet = connectedWallets.find(w => w.id === senderWalletId);
    if (!senderWallet) {
      onToast('Sender wallet not found');
      return;
    }

    const totalToDistribute = getTotalDistributionSOL();
    if (senderWallet.solBalance < totalToDistribute) {
      onToast(`Sender wallet has insufficient SOL balance (${senderWallet.solBalance.toFixed(3)} < ${totalToDistribute.toFixed(3)})`);
      return;
    }

    setIsDistributing(true);
    setIsCancelled(false);
    setDistributionQueue(recipients);
    setDistributedWallets([]);

    const abortController = new AbortController();
    setDistributeAbortController(abortController);

    const senderName = senderWallet.name || `Wallet ${senderWalletId.slice(-4)}`;

    onToast(`Broadcasting Distribute SOL request to backend...`);

    try {
      const requestId = `distribute_sol_${Date.now()}`;

      const payload = {
        type: 'distribute_sol_request',
        requestId: requestId,
        senderId: senderWalletId,
        recipients: recipients.map(id => ({
          walletId: id,
          amount: parseFloat(distributeAmounts[id] || '0')
        }))
      };

      if (wssConnection && wssConnection.readyState === WebSocket.OPEN) {
        wssConnection.send(JSON.stringify(payload));
        onToast('Distribution request sent. The server will coordinate the sequential magic transfers. 🪄');
      } else {
        throw new Error('WebSocket not connected');
      }

      // Reset local state
      setTimeout(() => {
        setIsDistributing(false);
      }, 2000);

    } catch (error) {
      onToast(`Distribution failed!`);
      setIsDistributing(false);
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
          className="bg-black/90 border border-purple-500/30 rounded-lg p-3 shadow-2xl hover:border-purple-400/50 transition-all duration-200 group"
          style={{
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 40px rgba(147, 51, 234, 0.1)',
          }}
        >
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-purple-400">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M12 9V3M12 21v-6M9 12H3M21 12h-6M15.5 8.5l4-4M15.5 15.5l4 4M8.5 8.5l-4-4M8.5 15.5l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-purple-100 font-mono text-xs font-medium">Distribute SOL</div>
              <div className="text-purple-500/70 font-mono text-[10px]">
                {isDistributing ? `${distributedWallets.length}/${distributionQueue.length}` : 'Minimized'}
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
              <path d="M7 14l5-5 5 5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-[9999]" onClick={handleBackdropClick}>
      <div className="bg-black/90 border border-purple-500/30 rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(147, 51, 234, 0.3), 0 0 60px rgba(147, 51, 234, 0.2), 0 0 100px rgba(147, 51, 234, 0.1)',
          filter: 'drop-shadow(0 10px 25px rgba(0, 0, 0, 0.5))'
        }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-purple-500/20">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-500/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-purple-400">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M12 9V3M12 21v-6M9 12H3M21 12h-6M15.5 8.5l4-4M15.5 15.5l4 4M8.5 8.5l-4-4M8.5 15.5l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-purple-300 font-mono font-semibold text-sm">Distribute SOL</h2>
              <span className="text-purple-500/60 text-xs font-mono">• Send to multiple wallets</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setIsMinimized(true);
                onMinimize?.();
              }}
              className="text-purple-400 hover:text-purple-300 transition-colors p-1.5 rounded hover:bg-purple-500/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-purple-400 hover:text-purple-300 transition-colors p-1.5 rounded hover:bg-purple-500/10"
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
          <div className="flex-1 p-6 border-r border-purple-500/20 flex flex-col">
            <div className="flex flex-col space-y-4 flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3">
                <div className="text-purple-300 font-mono font-medium text-sm">
                  Select Wallets ({selectedWallets.length})
                </div>
              </div>

              {/* Wallet Grid - All wallets, 4x3 viewport (9-12 visible), scrollable */}
              <div className="max-h-[420px] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {selectedWallets.map((walletId, index) => {
                    const wallet = connectedWallets.find(w => w.id === walletId);
                    const isSender = senderWalletId === walletId;

                    return (
                      <div
                        key={walletId}
                        className={`bg-black/40 border rounded-lg p-3 hover:border-purple-400/50 transition-colors min-h-[100px] cursor-pointer ${isSender ? 'border-purple-400 shadow-lg shadow-purple-500/20' : 'border-purple-500/30'
                          }`}
                        onClick={() => setSenderWalletId(isSender ? '' : walletId)}
                      >
                        {/* Compact Header */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-purple-100 font-mono text-[11px] font-medium truncate">
                              {wallet?.name || `Wallet ${index + 1}`}
                            </div>
                            <div className="text-purple-500/60 font-mono text-[10px] truncate">
                              {wallet?.publicKey.slice(0, 4)}...{wallet?.publicKey.slice(-4)}
                            </div>
                          </div>
                        </div>

                        {/* Balances */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            <span className="text-purple-500/70 font-mono text-[10px]">SOL</span>
                            <span className="text-purple-100 font-mono text-[11px]">{wallet?.solBalance?.toFixed(3) || '0.000'}</span>
                          </div>
                        </div>

                        {/* Amount Input for Recipients */}
                        {!isSender && senderWalletId && (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={distributeAmounts[walletId] || ''}
                              onChange={(e) => handleIndividualAmountChange(walletId, e.target.value)}
                              placeholder="0.00"
                              className="w-12 rounded border border-purple-500/30 bg-black/60 px-1 py-1 text-purple-100 placeholder:text-purple-500/40 focus:outline-none focus:border-purple-400 text-[10px] text-center"
                              disabled={isDistributing}
                            />
                            <span className="text-purple-500/60 text-[10px] font-mono">SOL</span>
                          </div>
                        )}

                        {/* Role Indicator */}
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isSender
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-gray-500/20 text-gray-400'
                            }`}>
                            {isSender ? 'Sender' : 'Recipient'}
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
                <h4 className="text-purple-300 font-mono font-medium text-sm">How it works</h4>
                <div className="text-purple-300/80 font-mono text-xs space-y-1">
                  <p>1. Select a wallet to be the <strong>sender</strong> (marked with purple border)</p>
                  <p>2. Input amounts will appear on recipient wallets - set SOL amounts for each</p>
                  <p>3. Or use the bulk input above for quick assignment</p>
                  <p>4. Sender wallet will distribute SOL sequentially to all recipients</p>
                </div>
              </div>

              {/* Amount Input */}
              {senderWalletId && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-purple-300/80 font-mono text-xs font-medium mb-1">Distribution Amounts (SOL)</label>
                    <input
                      type="text"
                      value={distributeAmount}
                      onChange={handleMainAmountChange}
                      placeholder="0.1 or 0.1,0.2,0.3"
                      className="w-full rounded border border-purple-500/30 bg-black/60 px-3 py-1.5 text-purple-100 placeholder:text-purple-500/40 focus:outline-none focus:border-purple-400 text-xs"
                      disabled={isDistributing}
                    />
                    <div className="text-purple-500/60 text-xs font-mono mt-1">
                      Single amount for all recipients, or comma-separated for individual amounts
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              {selectedWallets.length > 0 && senderWalletId && getRecipientWallets().length > 0 && (
                <div className="p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
                  <h5 className="text-purple-300 font-mono font-medium text-xs mb-2">Distribution Summary</h5>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-purple-500/70 font-mono">Sender</span>
                      <span className="text-purple-100 font-mono">
                        {connectedWallets.find(w => w.id === senderWalletId)?.name || `Wallet ${senderWalletId.slice(-4)}`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-500/70 font-mono">Recipients</span>
                      <span className="text-purple-100 font-mono">{getRecipientWallets().length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-500/70 font-mono">Total SOL</span>
                      <span className="text-purple-100 font-mono">{getTotalDistributionSOL().toFixed(3)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-purple-500/20 p-4">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isDistributing}
              className="flex-1 py-2 px-3 rounded-lg border border-purple-500/30 bg-black/60 text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm"
            >
              {isDistributing ? 'Running...' : 'Cancel'}
            </button>
            {isDistributing ? (
              <button
                onClick={async () => {
                  setIsCancelled(true);
                  if (distributeAbortController) {
                    distributeAbortController.abort();
                  }
                  await new Promise(resolve => setTimeout(resolve, 100));
                  setIsDistributing(false);
                  onToast('SOL distribution paused');
                }}
                className="flex-1 py-2 px-3 rounded-lg border border-yellow-400 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30 transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <path d="M6 4h4v16H6V4zM14 4h4v16h-4V4z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pause
              </button>
            ) : (
              <button
                onClick={() => startDistributeSol()}
                disabled={
                  selectedWallets.length < 2 ||
                  !senderWalletId ||
                  getRecipientWallets().some(walletId => !distributeAmounts[walletId] || parseFloat(distributeAmounts[walletId]) <= 0)
                }
                className="flex-1 py-2 px-3 rounded-lg border border-purple-400 bg-purple-500/20 text-purple-100 hover:bg-purple-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-mono text-sm font-medium flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 9V3M12 21v-6M9 12H3M21 12h-6M15.5 8.5l4-4M15.5 15.5l4 4M8.5 8.5l-4-4M8.5 15.5l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                Start Distribute SOL
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DistributeSolModal;