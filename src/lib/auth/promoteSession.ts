import { PoolClient } from "pg";
import { serverEnv } from "@/config/serverEnv";
import { createSessionJwt } from "@/lib/jwt";
import { HttpError } from "@/lib/errors";
import { withTransaction } from "@/lib/db";

type PromoteMetadata = {
  ipAddress: string | null;
  deviceInfo: string | null;
};

type PromoteResult =
  | {
      requires2fa: true;
      user: {
        userId: number;
        tier: string;
        is2faEnabled: boolean;
      };
    }
  | {
      jwtToken: string;
      websocketUrl: string;
      user: {
        userId: number;
        tier: string;
        is2faEnabled: boolean;
      };
      session: {
        activeSessionId: string;
        expiresAt: string;
      };
    };

const fetchSession = async (client: PoolClient, token: string) => {
  const { rows } = await client.query<{
    session_id: string;
    user_id: number;
    used: boolean;
    expires_at: string;
    user_tier: string;
    is_2fa_enabled: boolean;
  }>(
    `SELECT s.session_id, s.user_id, s.used, s.expires_at, u.user_tier, u.is_2fa_enabled
     FROM one_time_sessions s
     JOIN users u ON s.user_id = u.user_id
     WHERE s.session_token = $1
     FOR UPDATE`,
    [token]
  );

  return rows[0];
};

const enforceActiveSessionLimit = async (client: PoolClient, userId: number) => {
  const { rows } = await client.query<{ active_session_id: string }>(
    `SELECT active_session_id
     FROM active_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  if (rows.length <= serverEnv.limits.maxActiveSessions) {
    return;
  }

  const idsToDelete = rows
    .slice(serverEnv.limits.maxActiveSessions)
    .map((row) => row.active_session_id);

  await client.query(
    `DELETE FROM active_sessions
     WHERE active_session_id = ANY($1::uuid[])`,
    [idsToDelete]
  );
};

type PromoteResultSuccess = {
  jwtToken: string;
  websocketUrl: string;
  user: {
    userId: number;
    tier: string;
    is2faEnabled: boolean;
  };
  session: {
    activeSessionId: string;
    expiresAt: string;
  };
};

export const promoteSessionAfter2fa = async (
  userId: number,
  code: string,
  metadata: PromoteMetadata
): Promise<PromoteResultSuccess> => {
  return withTransaction(async (client) => {
    // Verify 2FA code
    const { rows: userRows } = await client.query<{ user_tier: string; is_2fa_enabled: boolean; google_2fa_secret: string }>(
      `SELECT user_tier, is_2fa_enabled, google_2fa_secret FROM users WHERE user_id = $1`,
      [userId]
    );

    const user = userRows[0];

    if (!user.is_2fa_enabled || !user.google_2fa_secret) {
      throw new HttpError("2FA not enabled", 400);
    }

    const speakeasy = require('speakeasy');
    const verified = speakeasy.totp.verify({
      secret: user.google_2fa_secret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 time steps tolerance
    });

    if (!verified) {
      throw new HttpError("Invalid 2FA code", 401);
    }

    // Create active session
    await enforceActiveSessionLimit(client, userId);

    const activeExpiresAt = new Date(Date.now() + serverEnv.jwt.expiryDays * 86_400_000);

    const { rows: activeRows } = await client.query<{
      active_session_id: string;
      expires_at: string;
    }>(
      `INSERT INTO active_sessions (user_id, session_token, ip_address, device_info, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING active_session_id, expires_at`,
      [userId, 'temp', metadata.ipAddress, metadata.deviceInfo, activeExpiresAt]
    );

    const jwtToken = createSessionJwt({
      userId,
      tier: user.user_tier,
      is2faEnabled: user.is_2fa_enabled,
      sessionId: activeRows[0].active_session_id,
    });

    await client.query(
      `UPDATE active_sessions SET session_token = $1 WHERE active_session_id = $2`,
      [jwtToken, activeRows[0].active_session_id]
    );

    await client.query(`UPDATE users SET last_login = NOW() WHERE user_id = $1`, [userId]);

    await client.query(
      `INSERT INTO security_logs (user_id, event_type, ip_address, device_info, success, details)
       VALUES ($1, 'session_promoted_2fa', $2, $3, true, $4)`,
      [
        userId,
        metadata.ipAddress,
        metadata.deviceInfo,
        JSON.stringify({ active_session_id: activeRows[0].active_session_id }),
      ]
    );

    return {
      jwtToken,
      websocketUrl: serverEnv.websocketUrl,
      user: {
        userId,
        tier: user.user_tier,
        is2faEnabled: user.is_2fa_enabled,
      },
      session: {
        activeSessionId: activeRows[0].active_session_id,
        expiresAt: activeRows[0].expires_at,
      },
    };
  });
};

export const promoteSessionToken = async (
  sessionToken: string,
  metadata: PromoteMetadata
): Promise<PromoteResult> => {
  return withTransaction(async (client) => {
    const session = await fetchSession(client, sessionToken);

    if (!session) {
      throw new HttpError("Invalid or expired session token", 401);
    }

    if (session.used) {
      throw new HttpError("Session token already used", 401);
    }

    if (new Date(session.expires_at) < new Date()) {
      throw new HttpError("Session token expired", 401);
    }

    await client.query(
      `UPDATE one_time_sessions
       SET used = true
       WHERE session_id = $1`,
      [session.session_id]
    );

    const { rows: userRows } = await client.query<{ user_tier: string; is_2fa_enabled: boolean; account_locked?: boolean }>(
      `SELECT user_tier, is_2fa_enabled, account_locked FROM users WHERE user_id = $1`,
      [session.user_id]
    );

    const user = userRows[0];

    // Check if account is locked (if column exists)
    if (user.account_locked === true) {
      throw new HttpError("Account is locked. Please unlock via Telegram bot.", 403);
    }

    if (user.is_2fa_enabled) {
      return {
        requires2fa: true,
        user: {
          userId: session.user_id,
          tier: user.user_tier,
          is2faEnabled: user.is_2fa_enabled,
        },
      };
    }

    const activeExpiresAt = new Date(Date.now() + serverEnv.jwt.expiryDays * 86_400_000);

    const { rows: activeRows } = await client.query<{
      active_session_id: string;
      expires_at: string;
    }>(
      `INSERT INTO active_sessions (user_id, session_token, ip_address, device_info, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING active_session_id, expires_at`,
      [session.user_id, 'temp', metadata.ipAddress, metadata.deviceInfo, activeExpiresAt]
    );

    const jwtToken = createSessionJwt({
      userId: session.user_id,
      tier: session.user_tier,
      is2faEnabled: session.is_2fa_enabled,
      sessionId: activeRows[0].active_session_id,
    });

    await client.query(
      `UPDATE active_sessions SET session_token = $1 WHERE active_session_id = $2`,
      [jwtToken, activeRows[0].active_session_id]
    );

    await client.query(`UPDATE users SET last_login = NOW() WHERE user_id = $1`, [session.user_id]);

    await client.query(
      `INSERT INTO security_logs (user_id, event_type, ip_address, device_info, success, details)
       VALUES ($1, 'session_validated', $2, $3, true, $4)`,
      [
        session.user_id,
        metadata.ipAddress,
        metadata.deviceInfo,
        JSON.stringify({ session_id: session.session_id }),
      ]
    );

    await enforceActiveSessionLimit(client, session.user_id);

    return {
      jwtToken,
      websocketUrl: serverEnv.websocketUrl,
      user: {
        userId: session.user_id,
        tier: session.user_tier,
        is2faEnabled: session.is_2fa_enabled,
      },
      session: {
        activeSessionId: activeRows[0].active_session_id,
        expiresAt: activeRows[0].expires_at,
      },
    };
  });
};
