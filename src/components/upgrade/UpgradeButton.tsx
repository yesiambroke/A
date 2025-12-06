"use client";

import React, { useState } from "react";

type OperatorProps = {
  userId: number;
  tier: string;
  is2faEnabled: boolean;
};

type UpgradeButtonProps = {
  operator: OperatorProps | null;
};

const UpgradeButton = ({ operator }: UpgradeButtonProps) => {
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = async () => {
    if (!operator) {
      // Redirect to login if not authenticated
      window.location.href = '/auth/login';
      return;
    }

    if (operator.tier === 'pro') {
      alert('You are already a Pro member!');
      return;
    }

    setIsUpgrading(true);

    try {
      // TODO: Implement actual upgrade flow with Solana payment
      alert('Pro upgrade coming soon! Payment integration will be available shortly.');
    } catch (error) {
      console.error('Upgrade failed:', error);
      alert('Upgrade failed. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  if (!operator) {
    return (
      <button
        onClick={handleUpgrade}
        className="w-full border border-green-500 px-6 py-3 text-green-200 hover:bg-green-500/10 transition-colors duration-200"
      >
        Login to Upgrade
      </button>
    );
  }

  if (operator.tier === 'pro') {
    return (
      <div className="w-full border border-green-500/50 bg-green-500/10 px-6 py-3 text-green-300 text-center">
        ✓ You are a Pro Member
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleUpgrade}
        disabled={isUpgrading}
        className="w-full border border-green-500 px-6 py-3 text-green-200 hover:bg-green-500/10 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isUpgrading ? 'Processing...' : 'Upgrade to Pro (Coming Soon)'}
      </button>

      <p className="text-[11px] text-green-500/80 text-center">
        Payment will be processed via Solana. One-time purchase with lifetime access.
        Your support funds R&D for innovative trading tools and platform improvements.
      </p>
    </div>
  );
};

export default UpgradeButton;