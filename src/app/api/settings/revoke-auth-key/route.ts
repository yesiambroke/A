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

    // Revoke auth key in database
    const { query } = await import('@/lib/db');

    await query(
      'UPDATE wallet_auth_keys SET revoked = true, revoked_at = NOW() WHERE user_id = $1 AND revoked = false',
      [session.userId]
    );

    console.log('Revoked auth key for user:', session.userId);

    return NextResponse.json({
      success: true,
      message: 'Auth key revoked successfully'
    });

  } catch (error) {
    console.error('Revoke auth key error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}