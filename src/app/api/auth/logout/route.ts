import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/cookies";
import { getSessionFromRequest } from "@/lib/auth/session";
import { logSecurityEvent } from "@/lib/security/log";
import { getRequestIp } from "@/lib/http/ip";
import { query } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (session) {
    await logSecurityEvent({
      userId: session.userId,
      eventType: "logout",
      success: true,
      ipAddress: getRequestIp(request),
      deviceInfo: request.headers.get("user-agent"),
    });

    // Delete the active session from database
    await query('DELETE FROM active_sessions WHERE active_session_id = $1', [session.sessionId]);
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
