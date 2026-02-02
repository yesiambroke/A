"use client";

import React from "react";

const ProBenefits = () => {
  const benefits = [
    {
      icon: "◎",
      title: "Lower Trading Fees",
      description: "0.222% vs 0.444% on all transactions",
      color: "text-green-500"
    },
    {
      icon: "▊",
      title: "More Active Wallets",
      description: "Up to 100 wallets simultaneously",
      color: "text-green-500"
    },
    {
      icon: "⟲",
      title: "Early Access",
      description: "Be first to try new features and products",
      color: "text-green-500"
    },
    {
      icon: "▲",
      title: "Support Innovation",
      description: "Fund R&D for advanced trading tools",
      color: "text-green-500"
    }
  ];

  return (
    <div className="border border-green-500/40 bg-black/50 p-4 space-y-4">
      <h2 className="text-lg font-bold text-green-300 text-center">Pro Membership Benefits</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {benefits.map((benefit, index) => (
          <div key={index} className="flex items-start space-x-3 p-3 border border-green-500/20 rounded">
            <div className={`text-xl ${benefit.color} mt-0.5`}>{benefit.icon}</div>
            <div className="flex-1">
              <h3 className="text-green-300 font-semibold text-sm">{benefit.title}</h3>
              <p className="text-green-200/70 text-xs mt-1">{benefit.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProBenefits;