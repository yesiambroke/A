'use client';

import React from "react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import PayoutRequestModal from "./PayoutRequestModal";

// Custom SVG Icons
const RocketIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <path d="M4.5 16.5c0 1.38 1.12 2.5 2.5 2.5h10c1.38 0 2.5-1.12 2.5-2.5V12c0-1.38-1.12-2.5-2.5-2.5H7c-1.38 0-2.5 1.12-2.5 2.5v4.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8.5 12V8.5c0-1.38 1.12-2.5 2.5-2.5h2c1.38 0 2.5 1.12 2.5 2.5V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="18" r="1" fill="currentColor" />
    <path d="M9 21l3-3 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DiamondIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <rect x="3" y="8" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M19 12v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 8a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 12l4-4 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WalletIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
    <circle cx="16" cy="14" r="2" stroke="currentColor" strokeWidth="2" />
    <path d="M6 10h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CrownIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <path d="M5 16L3 5l5.5 4L12 2l3.5 7L21 5l-2 11H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 16c0 1.5-1.5 3-3.5 3S12 17.5 12 16s1.5-3 3.5-3 3.5 1.5 3.5 3z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const SolIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <text x="12" y="16" textAnchor="middle" fontSize="8" fill="currentColor" fontFamily="monospace">SOL</text>
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" strokeWidth="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const CodeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MoneyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
    <path d="M12 6v12M8 8h8M8 12h8M8 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const PresentIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
    <rect x="3" y="8" width="18" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
    <path d="M12 8V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M19 12v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 8a2.5 2.5 0 0 1 5 0 2.5 2.5 0 0 1 5 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m16.24-3.76l-4.24 4.24m-6-6L3.76 7.76m16.24 6.24l-4.24-4.24m-6 6L7.76 20.24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChartBarIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
    <path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 12l4-4 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type UserInfo = {
  accountId: string;
  userTier: string;
  is2faEnabled: boolean;
};

type OperatorProps = {
  accountId: string;
  userTier: string;
  is2faEnabled: boolean;
};

type ReferralData = {
  referralCode: string | null;
  referralBalance: number;
  successfulReferrals: number;
  totalReferrals: number;
  referrals: Array<{
    referral_id: number;
    status: string;
    created_at: string;
    completed_at: string | null;
    reward_amount: number;
    referee_account_id: string;
    referee_tier: string;
  }>;
  proPurchasedAt: string | null;
  commissionPercent: number;
};

type PayoutRequest = {
  payoutId: number;
  amount: number;
  status: string;
  requestedAt: string;
  processedAt?: string;
  solTxHash?: string;
  rejectionReason?: string;
};

const ReferralAdvertising = ({ user, operator }: { user: UserInfo; operator: OperatorProps | null }) => {
  const [referralData, setReferralData] = React.useState<ReferralData | null>(null);
  const [payoutHistory, setPayoutHistory] = React.useState<PayoutRequest[]>([]);
  const [showPayoutModal, setShowPayoutModal] = React.useState(false);
  const [generatingCode, setGeneratingCode] = React.useState(false);
  const [currentSuit, setCurrentSuit] = React.useState(0);

  const suits = [
    { symbol: '♠', color: 'text-green-400', name: 'spades' },
    { symbol: '♥', color: 'text-green-400', name: 'hearts' },
    { symbol: '♣', color: 'text-green-400', name: 'clubs' },
    { symbol: '♦', color: 'text-green-400', name: 'diamonds' }
  ];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSuit((prev) => (prev + 1) % suits.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Spinning card animation (exactly like landing page - cycle suits every 4 seconds)
  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSuit((prev) => (prev + 1) % suits.length);
    }, 4000); // Every 4 seconds (one full rotation)
    return () => clearInterval(interval);
  }, [suits.length]);

  React.useEffect(() => {
    const fetchReferralData = async () => {
      try {
        const res = await fetch("/api/referrals");
        const data = await res.json();
        if (data.success) {
          setReferralData(data);
        }
      } catch (error) {
        console.error("Failed to fetch referral data:", error);
      }
    };

    const fetchPayoutHistory = async () => {
      try {
        const res = await fetch("/api/referrals/payout/history");
        const data = await res.json();
        if (data.success) {
          setPayoutHistory(data.payouts);
        }
      } catch (error) {
        console.error("Failed to fetch payout history:", error);
      }
    };

    fetchReferralData();
    fetchPayoutHistory();
  }, []);

  const generateReferralCode = async () => {
    if (generatingCode) return;
    try {
      setGeneratingCode(true);
      const res = await fetch("/api/referrals/generate", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setReferralData((prev) => prev ? { ...prev, referralCode: data.referralCode } : null);
      } else {
        alert(data.error || "Failed to generate referral code");
      }
    } catch (error) {
      console.error("Failed to generate referral code:", error);
      alert("Failed to generate referral code");
    } finally {
      setGeneratingCode(false);
    }
  };

  const referralLink = referralData?.referralCode ? `https://t.me/a_trade_fun_bot?start=${referralData.referralCode}` : '';

  return (
    <div className="h-full flex flex-col">
      <style jsx>{`
        @keyframes cardSpin {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>
      <PageHeader currentPage="referral" operator={operator} />

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
            Earn {referralData?.commissionPercent || 20}% commission when your referrals upgrade to Pro membership. Your friends also get {referralData?.commissionPercent || 20}% discount! Future revenue sharing from trading fees available.
          </p>
        </div>

        {/* Referral Link Section - Moved below hero */}
        <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
          <h2 className="text-lg font-bold text-green-300 text-center">Your Referral Link</h2>

          {referralData ? (
            <>
              {referralData.referralCode ? (
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="bg-black border border-green-500/40 p-3 rounded-lg">
                      <code className="block text-green-200 font-mono text-sm break-all">
                        {referralLink}
                      </code>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        referralData.referralCode && navigator.clipboard.writeText(referralLink);
                        const btn = event?.target as HTMLButtonElement;
                        if (btn) {
                          const originalHTML = btn.innerHTML;
                          btn.innerHTML = '<span class="flex items-center gap-2"><svg viewBox="0 0 24 24" fill="none" class="w-4 h-4"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Copied!</span>';
                          setTimeout(() => btn.innerHTML = originalHTML, 2000);
                        }
                      }}
                      className="flex items-center gap-2 border px-4 py-2 text-green-200 hover:bg-green-500/10 transition-all duration-200"
                    >
                      <CopyIcon />
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        referralData.referralCode && navigator.clipboard.writeText(referralData.referralCode);
                        const btn = event?.target as HTMLButtonElement;
                        if (btn) {
                          const originalHTML = btn.innerHTML;
                          btn.innerHTML = '<span class="flex items-center gap-2"><svg viewBox="0 0 24 24" fill="none" class="w-4 h-4"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Copied!</span>';
                          setTimeout(() => btn.innerHTML = originalHTML, 2000);
                        }
                      }}
                      className="flex items-center gap-2 border px-4 py-2 text-green-200 hover:bg-green-500/10 transition-all duration-200"
                    >
                      <CodeIcon />
                      Copy Code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={generateReferralCode}
                    disabled={generatingCode}
                    className="border border-green-500 px-6 py-2 text-green-200 hover:bg-green-500/10 disabled:opacity-50 text-sm transition-all duration-200"
                  >
                    {generatingCode ? (
                      <span className="flex items-center gap-2">
                        <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full"></div>
                        Generating...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <RocketIcon />
                        Generate Referral Code
                      </span>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-green-400/80 py-4">
              <div className="animate-pulse">Loading...</div>
            </div>
          )}
        </div>

        {/* Stats & Benefits Combined */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Your Stats */}
          <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
            <h2 className="text-lg font-bold text-green-300 text-center flex items-center justify-center gap-2">
              <ChartIcon />
              Your Stats
            </h2>

            {referralData ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center border border-green-500/20 p-3 rounded">
                  <div>
                    <div className="text-xl font-bold text-green-300">{referralData.totalReferrals}</div>
                    <div className="text-xs text-green-400/80">Total Referrals</div>
                  </div>
                  <div className="text-green-500/60">▓</div>
                </div>
                <div className="flex justify-between items-center border border-green-500/20 p-3 rounded">
                  <div>
                    <div className="text-xl font-bold text-green-300">{referralData.successfulReferrals}</div>
                    <div className="text-xs text-green-400/80">Successful</div>
                  </div>
                  <div className="text-green-500/60">✓</div>
                </div>
                <div className="flex justify-between items-center border border-green-500/20 p-3 rounded">
                  <div>
                    <div className="text-xl font-bold text-green-300">{referralData.referralBalance}</div>
                    <div className="text-xs text-green-400/80">SOL Earned</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowPayoutModal(true)}
                      disabled={referralData.referralBalance < 1}
                      className="text-[10px] bg-green-600 hover:bg-green-500 text-black px-3 py-1 rounded font-bold disabled:opacity-50 transition-colors"
                    >
                      Withdraw
                    </button>
                    <div className="text-green-500/60">◎</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-green-400/80 py-4">
                <div className="animate-pulse">Loading...</div>
              </div>
            )}
          </div>

          {/* Pro Benefits */}
          <div className="border border-green-500/40 bg-green-500/5 p-4 space-y-3">
            <h2 className="text-lg font-bold text-green-300 text-center flex items-center justify-center gap-2">
              <DiamondIcon />
              Pro Benefits
            </h2>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <ChartIcon />
                <span className="text-green-200">Lower fees (0.222% vs 0.444%)</span>
              </div>
              <div className="flex items-center gap-2">
                <WalletIcon />
                <span className="text-green-200">100 active wallets</span>
              </div>
              <div className="flex items-center gap-2">
                <CrownIcon />
                <span className="text-green-200">Early access to new features</span>
              </div>
            </div>

            <div className="pt-2 border-t border-green-500/20">
              <p className="text-xs text-green-300/80 text-center">
                Support small developer of innovative trading tools
              </p>
            </div>
          </div>
        </div>

        {/* How It Works removed */}
        {/* History Sections */}
        {referralData && (
          <div className="space-y-4">
            {/* Referral History */}
            <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
              <h2 className="text-lg font-bold text-green-300 text-center">Referral History</h2>
              {referralData.referrals.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {referralData.referrals.map((ref) => (
                    <div key={ref.referral_id} className="border border-green-500/20 p-2 text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-green-300">Referee #{ref.referee_account_id}</span>
                          <span className={`ml-2 px-1 py-0.5 text-xs border ${ref.status === 'completed' || ref.status === 'paid'
                            ? 'border-green-500 text-green-300'
                            : 'border-yellow-500 text-yellow-300'
                            }`}>
                            {ref.status}
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-green-200 font-semibold">{ref.reward_amount} SOL</div>
                          <div className="text-xs text-green-500/80">
                            {new Date(ref.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-green-500/80 text-center">No referrals yet. Share your code!</p>
              )}
            </div>

            {/* Payout History */}
            {payoutHistory.length > 0 && (
              <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
                <h2 className="text-lg font-bold text-green-300 text-center">Payout History</h2>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {payoutHistory.map((payout) => (
                    <div key={payout.payoutId} className="border border-green-500/20 p-2 text-sm">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-green-300 font-bold">{payout.amount} SOL</span>
                            <span className={`px-1.5 py-0.5 text-[10px] uppercase border ${payout.status === 'completed'
                              ? 'border-green-500 text-green-400'
                              : payout.status === 'rejected'
                                ? 'border-red-500 text-red-400'
                                : 'border-yellow-500 text-yellow-400'
                              }`}>
                              {payout.status}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {new Date(payout.requestedAt).toLocaleString()}
                            {payout.rejectionReason && <span className="text-red-400 ml-2">- {payout.rejectionReason}</span>}
                          </div>
                        </div>
                        {payout.solTxHash && (
                          <a
                            href={`https://solscan.io/tx/${payout.solTxHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-green-500 hover:text-green-400 underline"
                          >
                            View TX
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      <PayoutRequestModal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        balance={referralData?.referralBalance || 0}
        onSuccess={() => {
          // Re-fetch data
          const fetchReferralData = async () => {
            const res = await fetch("/api/referrals");
            const data = await res.json();
            if (data.success) setReferralData(data);
          };
          const fetchPayoutHistory = async () => {
            const res = await fetch("/api/referrals/payout/history");
            const data = await res.json();
            if (data.success) setPayoutHistory(data.payouts);
          };
          fetchReferralData();
          fetchPayoutHistory();
        }}
      />
    </div >
  );
};

export default ReferralAdvertising;