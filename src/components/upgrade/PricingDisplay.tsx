"use client";

import React, { useState, useEffect } from "react";

type OperatorProps = {
  userId: number;
  tier: string;
  is2faEnabled: boolean;
};

type PricingDisplayProps = {
  operator: OperatorProps | null;
};

const PricingDisplay = ({ operator }: PricingDisplayProps) => {
  const [discountEligible, setDiscountEligible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkDiscountEligibility = async () => {
      if (!operator) {
        setDiscountEligible(false);
        setLoading(false);
        return;
      }

      try {
        // Check if user has successful referrals or was referred
        const res = await fetch("/api/referrals");
        const data = await res.json();

        if (data.success) {
          // User is eligible for discount if they have successful referrals OR were referred
          const hasSuccessfulReferrals = data.successfulReferrals > 0;
          const wasReferred = data.referrals.some((r: any) => r.status === 'completed' || r.status === 'paid');

          setDiscountEligible(hasSuccessfulReferrals || wasReferred);
        }
      } catch (error) {
        console.error("Failed to check discount eligibility:", error);
      } finally {
        setLoading(false);
      }
    };

    checkDiscountEligibility();
  }, [operator]);

  if (loading) {
    return (
      <div className="border border-green-500/40 p-4 space-y-3">
        <div className="animate-pulse">
          <div className="h-4 bg-green-500/20 rounded mb-2"></div>
          <div className="h-4 bg-green-500/20 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
      <h3 className="text-lg font-bold text-green-300 text-center">Pricing</h3>

      <div className="space-y-3 text-sm text-green-200">
        <div className="flex justify-between text-base font-semibold">
          <span className="text-green-300">Pro Price</span>
          <span className="text-green-100">TBD</span>
        </div>
        <p className="text-xs text-green-400/80 leading-relaxed">
          We&rsquo;re finalizing public beta pricing. Early supporters will receive preferred rates.
          Connect with the Telegram bot to get notified when plans go live.
        </p>
        {discountEligible && (
          <div className="text-[11px] text-green-300/70 border-t border-green-500/20 pt-2">
            Referral perks will be honored when pricing is announced.
          </div>
        )}
      </div>
    </div>
  );
};

export default PricingDisplay;
