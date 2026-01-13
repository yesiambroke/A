import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    // Return session info for WSS connection
    return NextResponse.json({
      success: true,
      sessionToken: session.sessionId, // Use session ID as token
      userId: session.userId,
      userTier: session.tier
    });

  } catch (error) {
    console.error('Session token error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}