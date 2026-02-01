'use client';

import React from "react";
import Link from "next/link";

import PayoutRequestModal from "./PayoutRequestModal";

type UserInfo = {
  userId: number;
  tier: string;
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

const ReferralDashboard = () => {
  const [referralData, setReferralData] = React.useState<ReferralData | null>(null);
  const [payoutHistory, setPayoutHistory] = React.useState<PayoutRequest[]>([]);
  const [generatingCode, setGeneratingCode] = React.useState(false);
  const [showPayoutModal, setShowPayoutModal] = React.useState(false);

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

  React.useEffect(() => {
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

  const referralLink = referralData?.referralCode ? `https://a-trade.fun?ref=${referralData.referralCode}` : '';

  return (
    <div className="space-y-4">
      <div className="bg-green-500 px-3 py-2 flex items-center gap-3 text-black">
        <div className="flex gap-1">
          <div className="relative w-2 h-2.5 animate-card-flip" style={{ transformStyle: 'preserve-3d' }}>
            <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[4px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>♠</div>
            <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[4px] font-bold text-black" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♠</div>
          </div>
          <div className="relative w-2 h-2.5 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '0.7s' }}>
            <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[4px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>♥</div>
            <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[4px] font-bold text-black" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♥</div>
          </div>
          <div className="relative w-2 h-2.5 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '1.4s' }}>
            <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[4px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>♣</div>
            <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[4px] font-bold text-black" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♣</div>
          </div>
        </div>
        <div className="text-xs sm:text-sm font-bold">A-TRADE://referral</div>
        <div className="ml-auto flex items-center gap-3 text-[11px] sm:text-xs">
          <Link
            href="/settings"
            className="border border-black/60 bg-black/20 px-2 py-1 text-xs font-semibold hover:bg-black/30"
          >
            ← Settings
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Referral Code</p>
          {referralData ? (
            <>
              {referralData.referralCode ? (
                <div className="space-y-3">
                  <code className="block bg-black border border-green-500/40 p-3 text-green-200 font-mono text-center text-lg">
                    {referralData.referralCode}
                  </code>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(referralLink)}
                      disabled={!referralData.referralCode}
                      className="flex-1 border border-green-500 px-3 py-2 text-green-200 hover:bg-green-500/10 disabled:opacity-50"
                    >
                      Copy Link
                    </button>
                    <button
                      type="button"
                      onClick={() => referralData.referralCode && navigator.clipboard.writeText(referralData.referralCode)}
                      className="flex-1 border border-green-500 px-3 py-2 text-green-200 hover:bg-green-500/10"
                    >
                      Copy Code
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={generateReferralCode}
                  disabled={generatingCode}
                  className="w-full border border-green-500 px-3 py-2 text-green-200 hover:bg-green-500/10 disabled:opacity-50"
                >
                  {generatingCode ? "Generating..." : "Generate Referral Code"}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-green-500/80">Loading...</p>
          )}
        </div>

        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Statistics</p>
          {referralData ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border border-green-500/20 px-2 py-1">
                <span className="text-green-500/80">Total Referrals:</span>
                <span className="font-semibold text-green-200">{referralData.totalReferrals}</span>
              </div>
              <div className="flex justify-between border border-green-500/20 px-2 py-1">
                <span className="text-green-500/80">Successful:</span>
                <span className="font-semibold text-green-200">{referralData.successfulReferrals}</span>
              </div>
              <div className="flex justify-between border border-green-500/20 px-2 py-1 items-center">
                <span className="text-green-500/80">Rewards Balance:</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-green-200">{referralData.referralBalance} SOL</span>
                  <button
                    onClick={() => setShowPayoutModal(true)}
                    disabled={referralData.referralBalance < 1}
                    className="text-[10px] bg-green-600 hover:bg-green-500 text-black px-2 py-0.5 rounded font-bold disabled:opacity-50"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-green-500/80">Loading...</p>
          )}
        </div>

        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3 lg:col-span-2">
          <div className="flex gap-4 border-b border-green-500/20 pb-2 mb-2">
            <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Referral History</p>
          </div>

          {referralData ? (
            referralData.referrals.length > 0 ? (
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
              <p className="text-sm text-green-500/80">No referrals yet. Share your code to start earning!</p>
            )
          ) : (
            <p className="text-sm text-green-500/80">Loading...</p>
          )}
        </div>

        {payoutHistory.length > 0 && (
          <div className="border border-green-500/40 bg-black/85 p-4 space-y-3 lg:col-span-2">
            <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Payout History</p>
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

      <PayoutRequestModal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        balance={referralData?.referralBalance || 0}
        onSuccess={() => {
          fetchReferralData();
          fetchPayoutHistory();
        }}
      />
    </div>
  );
};

export default ReferralDashboard;