import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);

    if (!session) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 });
    }

    // Generate a secure random auth key
    const authKey = crypto.randomBytes(32).toString('hex').toUpperCase();

    // Set expiration to 24 hours from now
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);

    // Store in database
    const { query } = await import('@/lib/db');

    // First, revoke any existing auth keys for this user
    await query(
      'UPDATE wallet_auth_keys SET revoked = true, revoked_at = NOW() WHERE user_id = $1 AND revoked = false',
      [session.userId]
    );

    // Insert new auth key
    await query(
      `INSERT INTO wallet_auth_keys (user_id, auth_key, expires_at, created_at)
       VALUES ($1, $2, $3, $4)`,
      [session.userId, authKey, new Date(expiresAt), new Date()]
    );

    console.log('Generated auth key for user:', session.userId);

    return NextResponse.json({
      success: true,
      authKey,
      expiresAt,
      message: 'Auth key generated successfully'
    });

  } catch (error) {
    console.error('Generate auth key error:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}