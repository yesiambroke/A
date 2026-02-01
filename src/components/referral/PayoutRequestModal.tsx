"use client";

import React, { useState } from "react";
import { PublicKey } from "@solana/web3.js";

interface PayoutRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    balance: number;
    onSuccess: () => void;
}

const PayoutRequestModal = ({ isOpen, onClose, balance, onSuccess }: PayoutRequestModalProps) => {
    const [amount, setAmount] = useState<string>('');
    const [walletAddress, setWalletAddress] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // 1. Validation
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount) || numAmount < 1) {
                throw new Error("Minimum payout is 1 SOL");
            }
            if (numAmount > balance) {
                throw new Error("Insufficient balance");
            }

            try {
                new PublicKey(walletAddress);
            } catch {
                throw new Error("Invalid Solana wallet address");
            }

            // 2. Submit Request
            const res = await fetch('/api/referrals/payout/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: numAmount,
                    walletAddress
                })
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to request payout');
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-green-500/30 rounded-lg max-w-md w-full p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    ✕
                </button>

                <h2 className="text-xl font-bold text-green-400 mb-4">Request Payout</h2>

                <div className="mb-4 text-sm text-gray-300">
                    Available Balance: <span className="text-green-300 font-bold">{balance} SOL</span>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Amount (SOL)</label>
                        <input
                            type="number"
                            step="0.0001"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full bg-black/50 border border-green-500/30 rounded p-2 text-white focus:outline-none focus:border-green-500"
                            placeholder="Min 1.0 SOL"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Wallet Address</label>
                        <input
                            type="text"
                            value={walletAddress}
                            onChange={(e) => setWalletAddress(e.target.value)}
                            className="w-full bg-black/50 border border-green-500/30 rounded p-2 text-white focus:outline-none focus:border-green-500 font-mono text-sm"
                            placeholder="Solana wallet address"
                            required
                        />
                    </div>

                    <div className="bg-yellow-900/10 border border-yellow-500/20 p-3 rounded text-xs text-yellow-500/80">
                        Payout requests are processed manually within 24 hours.
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-2 rounded transition-colors disabled:opacity-50"
                    >
                        {loading ? 'Submitting...' : 'Request Withdrawal'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PayoutRequestModal;
