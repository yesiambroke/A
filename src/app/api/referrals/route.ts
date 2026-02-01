import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { HttpError } from "@/lib/errors";
import { query } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);

    // Get user's referral data
    const userQuery = `
      SELECT referral_code, referral_balance, pro_purchased_at, commission_percent
      FROM users
      WHERE user_id = $1
    `;
    const userResult = await query(userQuery, [session.userId]);
    const user = userResult.rows[0];

    // Get referral history
    const referralsQuery = `
      SELECT r.referral_id, r.status, r.created_at, r.completed_at, r.reward_amount,
             u.account_id as referee_account_id, u.user_tier as referee_tier
      FROM referrals r
      JOIN users u ON r.referee_id = u.user_id
      WHERE r.referrer_id = $1
      ORDER BY r.created_at DESC
    `;
    const referralsResult = await query(referralsQuery, [session.userId]);

    // Get successful referrals count
    const successfulCount = referralsResult.rows.filter(r => r.status === 'completed' || r.status === 'paid').length;

    return NextResponse.json({
      success: true,
      referralCode: user.referral_code,
      referralBalance: parseFloat(user.referral_balance || 0),
      successfulReferrals: successfulCount,
      totalReferrals: referralsResult.rows.length,
      commissionPercent: parseFloat(user.commission_percent || 20),
      referrals: referralsResult.rows,
      proPurchasedAt: user.pro_purchased_at
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    console.error("GET /api/referrals error", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}