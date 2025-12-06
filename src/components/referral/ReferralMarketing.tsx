"use client";

import React from "react";
import PageHeader from "@/components/shared/PageHeader";

const ReferralMarketing = () => {
  const [telegramUrl, setTelegramUrl] = React.useState('https://t.me/a_trade_dot_fun_bot');
  const [currentSuit, setCurrentSuit] = React.useState(0);

  const suits = [
    { symbol: '♠', color: 'text-green-400', name: 'spades' },
    { symbol: '♥', color: 'text-green-400', name: 'hearts' },
    { symbol: '♣', color: 'text-green-400', name: 'clubs' },
    { symbol: '♦', color: 'text-green-400', name: 'diamonds' }
  ];

  // Set Telegram URL with referral code on client side
  React.useEffect(() => {
    const refCode = localStorage.getItem('referralCode');
    const baseUrl = 'https://t.me/a_trade_dot_fun_bot';
    setTelegramUrl(refCode ? `${baseUrl}?start=${refCode}` : baseUrl);
  }, []);

  // Spinning card animation (exactly like landing page - cycle suits every 4 seconds)
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSuit((prev) => (prev + 1) % suits.length);
    }, 4000); // Every 4 seconds (one full rotation)
    return () => clearInterval(interval);
  }, [suits.length]);

  return (
    <div className="h-full flex flex-col">
      <style jsx>{`
        @keyframes cardSpin {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
      <PageHeader currentPage="referral" operator={null} />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          {/* 360 Rotating Ace Card Animation (exactly like landing page) */}
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
                      <div className={`text-sm sm:text-base md:text-lg font-bold ${suits[currentSuit].color} leading-none`}>A</div>
                      <div className={`text-xs sm:text-sm ${suits[currentSuit].color} leading-none`}>{suits[currentSuit].symbol}</div>
                    </div>
                    <div className={`text-2xl sm:text-3xl md:text-4xl ${suits[currentSuit].color} flex items-center justify-center flex-1`}>{suits[currentSuit].symbol}</div>
                    <div className="absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 transform rotate-180">
                      <div className={`text-sm sm:text-base md:text-lg font-bold ${suits[currentSuit].color} leading-none`}>A</div>
                      <div className={`text-xs sm:text-sm ${suits[currentSuit].color} leading-none`}>{suits[currentSuit].symbol}</div>
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
            A-TRADE REFERRAL PROGRAM
          </h1>
          <p className="text-sm text-green-200 max-w-xl mx-auto leading-relaxed">
            Earn 25% commission when your referrals upgrade to Pro membership. Future revenue sharing from trading fees available.
          </p>
        </div>

        {/* Referral Program Section */}
        <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
          <h2 className="text-lg font-bold text-green-300 text-center">How It Works</h2>

          <div className="text-center space-y-4">
            <p className="text-green-200">
              Earn 25% commission when your referrals upgrade to Pro membership.
              Future revenue sharing from trading fees available.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-green-500/10 border border-green-500/30 rounded p-4 text-center">
                  <div className="text-2xl mb-2 text-green-500">◎</div>
                  <div className="text-green-400 font-bold mb-1">25% Commission</div>
                  <div className="text-green-300/70 text-xs">From referral Pro upgrades</div>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded p-4 text-center">
                  <div className="text-2xl mb-2 text-green-500">▊</div>
                  <div className="text-green-400 font-bold mb-1">Real-time Stats</div>
                  <div className="text-green-300/70 text-xs">Track your earnings</div>
                </div>
                <div className="bg-green-500/10 border border-green-500/30 rounded p-4 text-center">
                  <div className="text-2xl mb-2 text-green-500">⟲</div>
                  <div className="text-green-400 font-bold mb-1">Easy Sharing</div>
                  <div className="text-green-300/70 text-xs">One-click referral links</div>
                </div>
              </div>

              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-green-500 text-black font-bold text-lg px-8 py-3 rounded hover:bg-green-400 transition-colors duration-200 shadow-lg shadow-green-500/30"
              >
                ▶ START TRADING & EARN
              </a>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};

export default ReferralMarketing;