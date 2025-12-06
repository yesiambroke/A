import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
const bcrypt = require('bcrypt');

const bodySchema = z.object({
  accountId: z.string().length(12),
  recoveryKey: z.string().length(32),
});

export async function POST(request: NextRequest) {
  try {
    const payload = bodySchema.parse(await request.json());

    // Find user by account_id
    const userResult = await query(
      `SELECT user_id, recovery_key_hash, recovery_key_used, is_2fa_enabled, account_locked FROM users WHERE account_id = $1`,
      [payload.accountId]
    );

    if (!userResult.rows[0]) {
      return NextResponse.json({ success: false, error: "Account not found" }, { status: 400 });
    }

    const user = userResult.rows[0];

    if (user.account_locked) {
      return NextResponse.json({ success: false, error: "Account is locked. Recovery not available while account is locked." }, { status: 400 });
    }

    if (!user.is_2fa_enabled) {
      return NextResponse.json({ success: false, error: "2FA is not enabled on this account" }, { status: 400 });
    }

    if (!user.recovery_key_hash) {
      return NextResponse.json({ success: false, error: "No recovery key found" }, { status: 400 });
    }

    if (user.recovery_key_used) {
      return NextResponse.json({ success: false, error: "Recovery key already used" }, { status: 400 });
    }

    const isValid = await bcrypt.compare(payload.recoveryKey, user.recovery_key_hash);

    if (!isValid) {
      return NextResponse.json({ success: false, error: "Invalid recovery key" }, { status: 400 });
    }

    // Disable 2FA, unlock account, and mark recovery key as used
    await query(
      `UPDATE users SET is_2fa_enabled = false, google_2fa_secret = NULL, account_locked = false, recovery_key_used = true WHERE user_id = $1`,
      [user.user_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", issues: error.flatten() },
        { status: 400 }
      );
    }

    console.error("verify-recovery-key error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}