"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import PaymentModal from "./PaymentModal";

type OperatorProps = {
  accountId: string;
  userTier: string;
  is2faEnabled: boolean;
};

type PricingDisplayProps = {
  operator: OperatorProps | null;
};

const PricingDisplay = ({ operator }: PricingDisplayProps) => {
  const searchParams = useSearchParams();
  const [pricing, setPricing] = useState<{
    basePriceSol: number;
    commissionPercent: number;
    discountAmountSol: number;
    netPriceSol: number;
    hasDiscount: boolean;
    referralCode?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    const fetchPricing = async () => {
      if (!operator) {
        setLoading(false);
        return;
      }

      try {
        const referralCode = searchParams.get("ref") || undefined;
        const query = referralCode ? `?referralCode=${referralCode}` : '';
        const res = await fetch(`/api/upgrade/pricing${query}`);
        const data = await res.json();

        if (data.success) {
          setPricing(data.pricing);
        }
      } catch (error) {
        console.error("Failed to fetch pricing:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPricing();
  }, [operator, searchParams]);

  if (loading || !pricing) {
    return (
      <div className="border border-green-500/40 p-4 space-y-3">
        <div className="animate-pulse">
          <div className="h-4 bg-green-500/20 rounded mb-2"></div>
          <div className="h-4 bg-green-500/20 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  const isPro = operator?.userTier === 'pro';

  return (
    <>
      <div className="border border-green-500/40 bg-black/50 p-4 space-y-4">
        <h3 className="text-lg font-bold text-green-300 text-center">
          {isPro ? 'Pro Membership Active' : 'Upgrade to Pro'}
        </h3>

        {!isPro ? (
          <div className="space-y-3 text-sm text-green-200">
            <div className="flex justify-between items-center text-base">
              <span className="text-gray-400">Base Price:</span>
              <span>{pricing.basePriceSol} SOL</span>
            </div>

            {pricing.hasDiscount && (
              <div className="flex justify-between items-center text-green-400">
                <span>Referral Discount:</span>
                <span>-{pricing.discountAmountSol} SOL</span>
              </div>
            )}

            <div className="border-t border-green-500/20 pt-2 flex justify-between items-center font-bold text-lg">
              <span className="text-white">Price:</span>
              <span className="text-green-300">{pricing.netPriceSol} SOL</span>
            </div>

            <button
              onClick={() => setShowPaymentModal(true)}
              className="w-full bg-green-600 hover:bg-green-500 text-black font-bold py-2 rounded mt-2 transition-colors shadow-[0_0_15px_rgba(22,163,74,0.3)] hover:shadow-[0_0_20px_rgba(22,163,74,0.5)]"
            >
              Upgrade Now
            </button>

            <p className="text-[10px] text-center text-gray-500">
              One-time payment for lifetime access
            </p>
          </div>
        ) : (
          <div className="text-center space-y-2">
            <div className="text-green-400 text-sm">
              You have full access to all Pro features.
            </div>
          </div>
        )}
      </div>

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        pricing={pricing}
        onSuccess={() => {
          // Refresh page or update state to reflect Pro status
          window.location.reload();
        }}
      />
    </>
  );
};

export default PricingDisplay;
