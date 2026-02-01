import { NextRequest } from "next/server";
import { getSessionCookieFromRequest, getSessionCookieFromServer } from "@/lib/auth/cookies";
import { SessionPayload, verifySessionJwt } from "@/lib/jwt";
import { query } from "@/lib/db";

export const getSessionFromRequest = async (request: NextRequest): Promise<SessionPayload | null> => {
  const cookieToken = getSessionCookieFromRequest(request);
  let token = cookieToken;

  if (!token) {
    const bearer = request.headers.get("authorization");
    if (bearer?.startsWith("Bearer ")) {
      token = bearer.substring(7);
    }
  }

  if (!token) {
    return null;
  }

  const payload = verifySessionJwt(token);
  if (!payload) {
    return null;
  }

  // Check if session is still active in database and fetch fresh user data
  try {
    const { rows } = await query(
      `SELECT a.active_session_id, u.account_id, u.user_tier, u.is_2fa_enabled 
       FROM active_sessions a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.active_session_id = $1 AND a.user_id = $2`,
      [payload.sessionId, payload.userId]
    );

    if (rows.length === 0) {
      return null; // Session revoked or expired
    }

    // Update payload with fresh data
    payload.accountId = rows[0].account_id;
    payload.tier = rows[0].user_tier;
    payload.is2faEnabled = rows[0].is_2fa_enabled;
  } catch (error) {
    console.error("Error checking session validity:", error);
    return null;
  }

  return payload;
};

export const getSessionFromCookies = async (): Promise<SessionPayload | null> => {
  const token = await getSessionCookieFromServer();
  if (!token) {
    return null;
  }

  const payload = verifySessionJwt(token);
  if (!payload) {
    return null;
  }

  // Check if session is still active in database and fetch fresh user data
  try {
    const { rows } = await query(
      `SELECT a.active_session_id, u.account_id, u.user_tier, u.is_2fa_enabled 
       FROM active_sessions a
       JOIN users u ON a.user_id = u.user_id
       WHERE a.active_session_id = $1 AND a.user_id = $2`,
      [payload.sessionId, payload.userId]
    );

    if (rows.length === 0) {
      return null; // Session revoked or expired
    }

    // Update payload with fresh data
    payload.accountId = rows[0].account_id;
    payload.tier = rows[0].user_tier;
    payload.is2faEnabled = rows[0].is_2fa_enabled;
  } catch (error) {
    console.error("Error checking session validity:", error);
    return null;
  }

  return payload;
};
