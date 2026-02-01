"use client";

import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    pricing: {
        netPriceSol: number;
        discountAmountSol: number;
        basePriceSol: number;
        commissionPercent: number;
        hasDiscount: boolean;
        referralCode?: string;
    };
    onSuccess: () => void;
}

const PaymentModal = ({ isOpen, onClose, pricing, onSuccess }: PaymentModalProps) => {
    const [step, setStep] = useState<'create' | 'payment' | 'success'>('create');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [invoice, setInvoice] = useState<{
        invoiceId: string;
        paymentAddress: string;
        amount: number;
        qrCodeData: string;
        expiresAt: string;
    } | null>(null);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setStep('create');
            setLoading(false);
            setError(null);
            setInvoice(null);
        }
    }, [isOpen]);

    // Poll for status when in payment step
    useEffect(() => {
        let pollTimer: NodeJS.Timeout;

        if (step === 'payment' && invoice) {
            pollTimer = setInterval(async () => {
                try {
                    const res = await fetch(`/api/upgrade/status/${invoice.invoiceId}`);
                    const data = await res.json();

                    if (data.success) {
                        if (data.invoice.status === 'confirmed' || data.invoice.status === 'paid') {
                            setStep('success');
                            if (data.invoice.status === 'confirmed') {
                                clearInterval(pollTimer);
                                // Wait a moment before calling onSuccess to let user see success message
                                setTimeout(() => {
                                    onSuccess();
                                }, 2000);
                            }
                        } else if (data.invoice.status === 'expired' || data.invoice.status === 'cancelled') {
                            setError('Invoice expired or cancelled. Please try again.');
                            setStep('create');
                            clearInterval(pollTimer);
                        }
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 5000); // Poll every 5 seconds
        }

        return () => {
            if (pollTimer) clearInterval(pollTimer);
        };
    }, [step, invoice, onSuccess]);

    const handleCreateInvoice = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/upgrade/create-invoice', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    referralCode: pricing.referralCode
                })
            });

            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to create invoice');
            }

            setInvoice({
                invoiceId: data.invoice.invoiceId,
                paymentAddress: data.invoice.paymentAddress,
                amount: data.invoice.netPriceSol,
                qrCodeData: data.invoice.qrCodeData,
                expiresAt: data.invoice.expiresAt
            });
            setStep('payment');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-green-500/30 rounded-lg max-w-md w-full p-6 shadow-2xl shadow-green-900/20 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    ✕
                </button>

                <h2 className="text-xl font-bold text-green-400 mb-4 text-center">
                    {step === 'success' ? 'Upgrade Successful!' : 'Upgrade to Pro'}
                </h2>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/50 text-red-200 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                {step === 'create' && (
                    <div className="space-y-4">
                        <div className="bg-black/40 p-4 rounded border border-green-500/20">
                            <div className="flex justify-between mb-2">
                                <span className="text-gray-400">Base Price:</span>
                                <span className="text-gray-200">{pricing.basePriceSol} SOL</span>
                            </div>
                            {pricing.hasDiscount && (
                                <div className="flex justify-between mb-2 text-green-400">
                                    <span>Referral Discount ({pricing.commissionPercent}%):</span>
                                    <span>-{pricing.discountAmountSol} SOL</span>
                                </div>
                            )}
                            <div className="border-t border-green-500/20 my-2 pt-2 flex justify-between font-bold text-lg">
                                <span className="text-white">Total:</span>
                                <span className="text-green-300">{pricing.netPriceSol} SOL</span>
                            </div>
                        </div>

                        <button
                            onClick={handleCreateInvoice}
                            disabled={loading}
                            className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-3 rounded transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Creating Invoice...' : 'Pay with SOL'}
                        </button>

                        <p className="text-xs text-center text-gray-500 mt-2">
                            Secure payment via Solana Gateway
                        </p>
                    </div>
                )}

                {step === 'payment' && invoice && (
                    <div className="space-y-6 text-center">
                        <div className="bg-white p-4 rounded-lg inline-block mx-auto">
                            <QRCodeSVG value={invoice.qrCodeData} size={180} />
                        </div>

                        <div className="space-y-2 text-left bg-black/40 p-3 rounded border border-green-500/10">
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Send Amount</div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xl font-mono font-bold text-green-300">{invoice.amount} SOL</span>
                                    <button
                                        onClick={() => copyToClipboard(invoice.amount.toString())}
                                        className="text-xs bg-green-900/30 px-2 py-1 rounded text-green-400 hover:text-green-300"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-gray-800">
                                <div className="text-xs text-gray-500 mb-1">To Address</div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-mono text-gray-300 break-all mr-2">{invoice.paymentAddress}</span>
                                    <button
                                        onClick={() => copyToClipboard(invoice.paymentAddress)}
                                        className="text-xs bg-green-900/30 px-2 py-1 rounded text-green-400 hover:text-green-300 shrink-0"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-center space-x-2 text-sm text-yellow-500 animate-pulse">
                            <span className="block w-2 h-2 bg-yellow-500 rounded-full"></span>
                            <span>Waiting for transaction...</span>
                        </div>

                        <p className="text-xs text-gray-500">
                            Invoice expires in 1 hour.
                        </p>
                    </div>
                )}

                {step === 'success' && (
                    <div className="text-center space-y-4 py-4">
                        <div className="text-4xl">🎉</div>
                        <p className="text-green-300">
                            Payment confirmed! You are now a Pro member.
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-2 rounded mt-4"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentModal;
