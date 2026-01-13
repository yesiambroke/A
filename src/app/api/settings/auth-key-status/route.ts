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

    // Check database for active auth key
    const { query } = await import('@/lib/db');

    const result = await query(
      'SELECT auth_key, expires_at FROM wallet_auth_keys WHERE user_id = $1 AND revoked = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [session.userId]
    );

    if (result.rows.length > 0) {
      const key = result.rows[0];
      return NextResponse.json({
        success: true,
        authKey: key.auth_key,
        expiresAt: key.expires_at.getTime()
      });
    } else {
      return NextResponse.json({
        success: true,
        authKey: null,
        expiresAt: null
      });
    }

  } catch (error) {
    console.error('Auth key status error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}