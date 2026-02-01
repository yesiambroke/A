import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    // Return session data for WSS authentication
    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      accountId: session.accountId,
      userTier: session.tier
    });

  } catch (error) {
    console.error('WSS authentication error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}