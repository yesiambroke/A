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

  // Check if session is still active in database
  try {
    const { rows } = await query(
      `SELECT 1 FROM active_sessions WHERE active_session_id = $1 AND user_id = $2`,
      [payload.sessionId, payload.userId]
    );

    if (rows.length === 0) {
      return null; // Session revoked or expired
    }
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

  // Check if session is still active in database
  try {
    const { rows } = await query(
      `SELECT 1 FROM active_sessions WHERE active_session_id = $1 AND user_id = $2`,
      [payload.sessionId, payload.userId]
    );

    if (rows.length === 0) {
      return null; // Session revoked or expired
    }
  } catch (error) {
    console.error("Error checking session validity:", error);
    return null;
  }

  return payload;
};
