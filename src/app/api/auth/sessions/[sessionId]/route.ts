import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { deleteActiveSession } from "@/lib/auth/activeSessions";
import { logSecurityEvent } from "@/lib/security/log";
import { HttpError } from "@/lib/errors";
import { getRequestIp } from "@/lib/http/ip";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await requireApiSession(request);
    const { sessionId } = await params;

    if (!sessionId) {
      throw new HttpError("Missing sessionId", 400);
    }

    const removed = await deleteActiveSession(session.userId, sessionId);

    if (!removed) {
      throw new HttpError("Session not found", 404);
    }

    await logSecurityEvent({
      userId: session.userId,
      eventType: "session_revoked",
      success: true,
      ipAddress: getRequestIp(request),
      deviceInfo: request.headers.get("user-agent"),
      details: { active_session_id: sessionId },
    });

    return NextResponse.json({ success: true, revoked: sessionId });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    console.error("DELETE /api/auth/sessions/[sessionId] error", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
