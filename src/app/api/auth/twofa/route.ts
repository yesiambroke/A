import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth/requireSession";
import { HttpError } from "@/lib/errors";
import { query } from "@/lib/db";
import { logSecurityEvent } from "@/lib/security/log";
import { getRequestIp } from "@/lib/http/ip";
import { createSessionJwt } from "@/lib/jwt";
import { attachSessionCookie } from "@/lib/auth/cookies";
import { serverEnv } from "@/config/serverEnv";
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const bodySchema = z.object({
  enabled: z.boolean(),
  telegramCode: z.string().optional(),
  current2faCode: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const payload = bodySchema.parse(await request.json());

    let secret: string | null = null;
    let qrCodeUrl: string | null = null;

    if (payload.enabled) {
      // Generate new secret
      const generated = speakeasy.generateSecret({
        name: 'A-Trade',
        issuer: 'A-Trade',
      });
      secret = generated.base32;

      // Generate QR code
      qrCodeUrl = await qrcode.toDataURL(generated.otpauth_url);
    }

    let rows: { user_tier: string; account_id: string }[];

    if (payload.enabled) {
      // Setup: verify TG code first
      if (!payload.telegramCode) {
        throw new HttpError("Telegram code required for setup", 400);
      }

      // Verify TG code from database
      const codeResult = await query(
        `SELECT code_id FROM twofa_codes
         WHERE code = $1 AND action_type = 'enable'
         AND expires_at > NOW() AND used = false`,
        [payload.telegramCode]
      );

      if (codeResult.rows.length === 0) {
        throw new HttpError("Invalid or expired Telegram code", 400);
      }

      // Mark code as used
      await query(
        `UPDATE twofa_codes SET used = true WHERE code_id = $1`,
        [codeResult.rows[0].code_id]
      );

      // Store secret but don't enable yet
      const result = await query<{ user_tier: string; account_id: string }>(
        `UPDATE users
         SET google_2fa_secret = $1
         WHERE user_id = $2
         RETURNING user_tier, account_id`,
        [secret, session.userId]
      );
      rows = result.rows;
    } else {
      // Disable: verify both current 2FA code and TG code
      if (!payload.current2faCode || payload.current2faCode.length !== 6) {
        throw new HttpError("Current 2FA code required for disable", 400);
      }
      if (!payload.telegramCode) {
        throw new HttpError("Telegram code required for disable", 400);
      }

      // Verify current 2FA code using stored secret
      const userResult = await query<{ google_2fa_secret: string }>(
        `SELECT google_2fa_secret FROM users WHERE user_id = $1`,
        [session.userId]
      );

      if (!userResult.rows[0]?.google_2fa_secret) {
        throw new HttpError("2FA not properly configured", 400);
      }

      const speakeasy = require('speakeasy');
      const isValidCurrentCode = speakeasy.totp.verify({
        secret: userResult.rows[0].google_2fa_secret,
        encoding: 'base32',
        token: payload.current2faCode,
        window: 2,
      });

      if (!isValidCurrentCode) {
        throw new HttpError("Invalid current 2FA code", 400);
      }

      // Verify TG code from database
      const codeResult = await query(
        `SELECT code_id FROM twofa_codes
         WHERE code = $1 AND action_type = 'disable'
         AND expires_at > NOW() AND used = false`,
        [payload.telegramCode]
      );

      if (codeResult.rows.length === 0) {
        throw new HttpError("Invalid or expired Telegram code", 400);
      }

      // Mark code as used
      await query(
        `UPDATE twofa_codes SET used = true WHERE code_id = $1`,
        [codeResult.rows[0].code_id]
      );

      // Clear secret, disable 2FA, and invalidate recovery key
      const result = await query<{ user_tier: string; account_id: string }>(
        `UPDATE users
         SET is_2fa_enabled = false, google_2fa_secret = NULL, recovery_key_used = true
         WHERE user_id = $1
         RETURNING user_tier, account_id`,
        [session.userId]
      );
      rows = result.rows;
    }

    if (!rows[0]) {
      throw new HttpError("User not found", 404);
    }

    await logSecurityEvent({
      userId: session.userId,
      eventType: "twofa_toggle",
      success: true,
      ipAddress: getRequestIp(request),
      deviceInfo: request.headers.get("user-agent"),
      details: { enabled: payload.enabled },
    });

    const refreshedJwt = createSessionJwt({
      userId: session.userId,
      accountId: rows[0].account_id,
      tier: rows[0].user_tier,
      is2faEnabled: payload.enabled,
      sessionId: session.sessionId,
    });

    if (payload.enabled) {
      // Setup response
      return NextResponse.json({
        success: true,
        qrCodeUrl,
        secret,
      });
    } else {
      // Disable response
      const response = NextResponse.json({ success: true, is2faEnabled: false });
      attachSessionCookie(response, refreshedJwt);
      return response;
    }
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid payload" }, { status: 400 });
    }

    console.error("POST /api/auth/twofa error", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
