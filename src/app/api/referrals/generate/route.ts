import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { HttpError } from "@/lib/errors";
import { query } from "@/lib/db";

// Generate unique referral code
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 10; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);

    // Check if user already has a referral code
    const checkQuery = `SELECT referral_code FROM users WHERE user_id = $1`;
    const checkResult = await query(checkQuery, [session.userId]);

    if (checkResult.rows[0]?.referral_code) {
      return NextResponse.json({
        success: false,
        error: "Referral code already exists"
      }, { status: 400 });
    }

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateReferralCode();
      const existsQuery = `SELECT 1 FROM users WHERE referral_code = $1`;
      const existsResult = await query(existsQuery, [code]);
      if (existsResult.rows.length === 0) break;
      attempts++;
    } while (attempts < 10);

    if (attempts >= 10) {
      return NextResponse.json({
        success: false,
        error: "Failed to generate unique referral code"
      }, { status: 500 });
    }

    // Update user with referral code
    const updateQuery = `UPDATE users SET referral_code = $1 WHERE user_id = $2`;
    await query(updateQuery, [code, session.userId]);

    return NextResponse.json({
      success: true,
      referralCode: code
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    console.error("POST /api/referrals/generate error", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}