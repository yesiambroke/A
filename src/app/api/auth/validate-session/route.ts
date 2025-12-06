import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { promoteSessionToken } from "@/lib/auth/promoteSession";
import { HttpError } from "@/lib/errors";
import { attachSessionCookie } from "@/lib/auth/cookies";
import { getRequestIp } from "@/lib/http/ip";

const bodySchema = z
  .object({
    session_token: z.string().uuid().optional(),
    token: z.string().uuid().optional(),
  })
  .refine((value) => value.session_token || value.token, {
    message: "session_token is required",
    path: ["session_token"],
  });

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json();
    const parsed = bodySchema.parse(rawBody);
    const sessionToken = parsed.session_token ?? parsed.token!;

    const metadata = {
      ipAddress: getRequestIp(request),
      deviceInfo: request.headers.get("user-agent"),
    };

    const result = await promoteSessionToken(sessionToken, metadata);

    if ('requires2fa' in result) {
      return NextResponse.json({
        success: true,
        requires2fa: true,
        user: result.user,
      });
    }

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

    console.error("validate-session error", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
