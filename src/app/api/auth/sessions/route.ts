import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { listActiveSessionsForUser } from "@/lib/auth/activeSessions";
import { HttpError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await requireApiSession(request);
    const sessions = await listActiveSessionsForUser(session.userId);

    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }

    console.error("GET /api/auth/sessions error", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
