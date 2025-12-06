import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/requireSession";
import { HttpError } from "@/lib/errors";
import { query } from "@/lib/db";
const speakeasy = require('speakeasy');

const bodySchema = z.object({
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const payload = bodySchema.parse(await request.json());

    // Get the user's 2FA secret (should be set during setup)
    const { rows } = await query<{ google_2fa_secret: string }>(
      `SELECT google_2fa_secret FROM users WHERE user_id = $1`,
      [session.userId]
    );

    if (!rows[0]?.google_2fa_secret) {
      throw new HttpError("2FA not properly set up", 400);
    }

    const verified = speakeasy.totp.verify({
      secret: rows[0].google_2fa_secret,
      encoding: 'base32',
      token: payload.code,
      window: 2, // Allow 2 time steps tolerance
    });

    if (!verified) {
      throw new HttpError("Invalid verification code", 400);
    }

    // Generate recovery key
    const crypto = require('crypto');
    const recoveryKey = crypto.randomBytes(16).toString('hex').toUpperCase();

    const bcrypt = require('bcrypt');
    const recoveryHash = await bcrypt.hash(recoveryKey, 12);

    // Mark 2FA as enabled and store recovery key
    await query(
      `UPDATE users SET is_2fa_enabled = true, recovery_key_hash = $2, recovery_key_used = false, recovery_key_created_at = NOW() WHERE user_id = $1`,
      [session.userId, recoveryHash]
    );

    return NextResponse.json({ success: true, recoveryKey });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", issues: error.flatten() },
        { status: 400 }
      );
    }

    console.error("verify-2fa-setup error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}