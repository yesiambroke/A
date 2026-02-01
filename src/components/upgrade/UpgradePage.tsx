"use client";

import React from "react";
import PageHeader from "@/components/shared/PageHeader";
import ProBenefits from "@/components/upgrade/ProBenefits";
import PricingDisplay from "@/components/upgrade/PricingDisplay";

type OperatorProps = {
  accountId: string;
  userTier: string;
  is2faEnabled: boolean;
};

type UpgradePageProps = {
  operator: OperatorProps | null;
};

const UpgradePage = ({ operator }: UpgradePageProps) => {
  return (
    <div className="h-full flex flex-col">
      <style jsx>{`
        @keyframes cardSpin {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
      <PageHeader currentPage="upgrade" operator={operator} />

      {/* Main Content */}
      <div className="flex-1 p-4 space-y-6">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          {/* 360 Rotating Ace Card Animation */}
          <div className="flex justify-center">
            <div className="relative h-28 w-20 sm:h-36 sm:w-24 md:h-40 md:w-28 mx-auto" style={{ perspective: '1000px' }}>
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  animation: `cardSpin 4s linear infinite`,
                  transformStyle: 'preserve-3d'
                }}
              >
                <div
                  className="relative w-20 h-28 sm:w-24 sm:h-36 md:w-28 md:h-40"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  {/* Front Face */}
                  <div
                    className="absolute inset-0 bg-black rounded-lg shadow-xl shadow-green-500/40 p-1.5 sm:p-2 flex flex-col justify-between border-2 border-green-500"
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(0deg)'
                    }}
                  >
                    <div className="absolute top-0.5 left-0.5 sm:top-1 sm:left-1">
                      <div className={`text-sm sm:text-base md:text-lg font-bold text-green-400 leading-none`}>A</div>
                      <div className={`text-xs sm:text-sm text-green-400 leading-none`}>♠</div>
                    </div>
                    <div className={`text-2xl sm:text-3xl md:text-4xl text-green-400 flex items-center justify-center flex-1`}>♠</div>
                    <div className="absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 transform rotate-180">
                      <div className={`text-sm sm:text-base md:text-lg font-bold text-green-400 leading-none`}>A</div>
                      <div className={`text-xs sm:text-sm text-green-400 leading-none`}>♠</div>
                    </div>
                    <div className="absolute bottom-2 sm:bottom-3 left-1/2 transform -translate-x-1/2">
                      <div className="text-green-500/70 font-mono text-[5px] sm:text-[6px] text-center tracking-wider">
                        a-trade.fun
                      </div>
                    </div>
                  </div>

                  {/* Back Face */}
                  <div
                    className="absolute inset-0 bg-black rounded-lg shadow-xl shadow-green-500/40 p-1.5 sm:p-2 flex flex-col items-center justify-center border-2 border-green-500"
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)'
                    }}
                  >
                    <div className="text-green-500/80 font-mono text-[10px] sm:text-xs text-center mb-0.5">
                      A-TRADE
                    </div>
                    <div className="flex items-center justify-center gap-0.5">
                      <span className="text-green-500 text-xs sm:text-sm">♠</span>
                      <span className="text-green-500 text-xs sm:text-sm">♥</span>
                      <span className="text-green-500 text-xs sm:text-sm">♣</span>
                      <span className="text-green-500 text-xs sm:text-sm">♦</span>
                    </div>
                    <div className="text-green-500/60 font-mono text-[4px] sm:text-[5px] text-center mt-0.5">
                      a-trade.fun
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-green-300">
            UPGRADE TO PRO MEMBERSHIP
          </h1>
          <p className="text-sm text-green-200 max-w-xl mx-auto leading-relaxed">
            Unlock advanced trading features and support the development of innovative trading tools.
          </p>
        </div>

        {/* Pro Benefits */}
        <ProBenefits />

        {/* Pricing and Upgrade */}
        <div className="max-w-md mx-auto space-y-4">
          <PricingDisplay operator={operator} />
        </div>
      </div>
    </div>
  );
};

export default UpgradePage;