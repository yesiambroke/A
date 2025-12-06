import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { promoteSessionAfter2fa } from "@/lib/auth/promoteSession";
import { HttpError } from "@/lib/errors";
import { attachSessionCookie } from "@/lib/auth/cookies";
import { getRequestIp } from "@/lib/http/ip";

const bodySchema = z.object({
  userId: z.number(),
  code: z.string().length(6),
});

export async function POST(request: NextRequest) {
  try {
    const payload = bodySchema.parse(await request.json());

    const metadata = {
      ipAddress: getRequestIp(request),
      deviceInfo: request.headers.get("user-agent"),
    };

    const result = await promoteSessionAfter2fa(payload.userId, payload.code, metadata);

    const response = NextResponse.json({
      success: true,
      websocket_url: result.websocketUrl,
      user: result.user,
      session: result.session,
    });

    attachSessionCookie(response, result.jwtToken);

    return response;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { success: false, error: error.message, details: error.details },
        { status: error.statusCode }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", issues: error.flatten() },
        { status: 400 }
      );
    }

    console.error("verify-2fa error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}