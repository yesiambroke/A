import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/auth/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();

    if (!session) {
      return NextResponse.json({
        connected: false,
        wallets: [],
        error: 'Not authenticated'
      }, { status: 401 });
    }

    // For now, return mock data - in the future this will check actual wallet connections
    const mockWallets = [
      {
        id: 'wallet_1',
        name: 'Main Wallet',
        publicKey: '11111111111111111111111111111112',
        balance: 0.5,
        status: 'connected'
      }
    ];

    return NextResponse.json({
      connected: false, // Will be true when wallet client is actually connected
      wallets: [], // Will contain actual connected wallets
      userId: session.userId
    });

  } catch (error) {
    console.error('Wallet status error:', error);
    return NextResponse.json({
      connected: false,
      wallets: [],
      error: 'Internal server error'
    }, { status: 500 });
  }
}