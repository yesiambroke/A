import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { HttpError } from "@/lib/errors";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);

    // Check if already pro
    const userQuery = `
      SELECT user_tier, referred_by, referral_code
      FROM users
      WHERE user_id = $1
    `;
    const userResult = await query(userQuery, [session.userId]);
    const user = userResult.rows[0];

    if (user.user_tier === 'pro') {
      return NextResponse.json({
        success: false,
        error: "Already pro member"
      }, { status: 400 });
    }

    // Check discount eligibility
    let discountApplied = false;
    const hasSuccessfulReferrals = await checkSuccessfulReferrals(session.userId);
    if (hasSuccessfulReferrals || user.referred_by) {
      discountApplied = true;
    }

    const discountedPrice = discountApplied ? 6 : 8;

    // TODO: Implement actual Solana payment verification
    // For now, simulate successful payment
    const txHash = `simulated_tx_${Date.now()}`;

    // Update user to pro
    const updateUserQuery = `
      UPDATE users
      SET user_tier = 'pro', pro_purchased_at = NOW()
      WHERE user_id = $1
    `;
    await query(updateUserQuery, [session.userId]);

    // If user was referred, complete the referral and credit reward
    if (user.referred_by) {
      await completeReferral(user.referred_by, session.userId, txHash);
    }

    // Log the transaction
    await logReferralTransaction(session.userId, discountedPrice, 'purchase', txHash, `Pro upgrade${discountApplied ? ' with discount' : ''}`);

    return NextResponse.json({
      success: true,
      amountPaid: discountedPrice,
      discountApplied,
      txHash
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    console.error("POST /api/upgrade/pro error", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// Helper function to check if user has successful referrals
async function checkSuccessfulReferrals(userId: number): Promise<boolean> {
  const sql = `
    SELECT COUNT(*) as count
    FROM referrals
    WHERE referrer_id = $1 AND status IN ('completed', 'paid')
  `;
  const result = await query(sql, [userId]);
  return parseInt(result.rows[0].count) > 0;
}

// Helper function to complete referral and credit reward
async function completeReferral(referrerId: number, refereeId: number, txHash: string) {
  // Update referral status
  const updateReferralQuery = `
    UPDATE referrals
    SET status = 'completed', completed_at = NOW(), purchase_tx_hash = $1
    WHERE referrer_id = $2 AND referee_id = $3 AND status = 'pending'
  `;
    await query(updateReferralQuery, [txHash, referrerId, refereeId]);

  // Credit reward to referrer
  const creditRewardQuery = `
    UPDATE users
    SET referral_balance = referral_balance + 1.5
    WHERE user_id = $1
  `;
  await query(creditRewardQuery, [referrerId]);

  // Log the reward transaction
  await logReferralTransaction(referrerId, 1.5, 'reward', null, `Reward for referral to user ${refereeId}`);
}

// Helper function to log referral transactions
async function logReferralTransaction(userId: number, amount: number, txType: string, solTxHash: string | null, notes: string) {
  const insertQuery = `
    INSERT INTO referral_transactions (user_id, amount, tx_type, sol_tx_hash, notes)
    VALUES ($1, $2, $3, $4, $5)
  `;
  await query(insertQuery, [userId, amount, txType, solTxHash, notes]);
}