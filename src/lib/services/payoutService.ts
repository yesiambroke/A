import { PublicKey } from "@solana/web3.js";
import { query, withTransaction } from "../db";

export interface PayoutRequest {
    payoutId: number;
    userId: number;
    amount: number;
    walletAddress: string;
    status: 'pending' | 'approved' | 'completed' | 'rejected';
    requestedAt: string;
    processedAt?: string;
    solTxHash?: string;
    rejectionReason?: string;
}

export interface PaginationInfo {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface PayoutSummary {
    pendingCount: number;
    pendingAmount: number;
    approvedCount: number;
    approvedAmount: number;
}

export class PayoutService {

    /**
     * Request a payout for a user
     */
    async requestPayout(
        userId: number,
        amount: number,
        walletAddress: string
    ): Promise<PayoutRequest> {
        // 1. Validate request
        const validation = await this.validatePayoutRequest(userId, amount);
        if (!validation.valid) {
            throw new Error(validation.error || 'Invalid payout request');
        }

        // 2. Validate Solana wallet address format
        try {
            new PublicKey(walletAddress);
        } catch {
            throw new Error('Invalid Solana wallet address');
        }

        // 3. Insert into payout_requests table
        const result = await query<{
            payout_id: number;
            requested_at: string;
        }>(`
      INSERT INTO payout_requests (user_id, amount_sol, wallet_address, status)
      VALUES ($1, $2, $3, 'pending')
      RETURNING payout_id, requested_at
    `, [userId, amount, walletAddress]);

        const row = result.rows[0];

        return {
            payoutId: row.payout_id,
            userId,
            amount,
            walletAddress,
            status: 'pending',
            requestedAt: row.requested_at,
        };
    }

    /**
     * Validate a payout request
     */
    async validatePayoutRequest(
        userId: number,
        amount: number
    ): Promise<{ valid: boolean; error?: string; canRequestAt?: string }> {
        // 1. Check Amount >= Min Payout (1 SOL)
        // We can fetch min payout from pricing_config, but for now defaulting to 1.0 as per plan
        const configResult = await query<{ min_payout_sol: number }>(`
      SELECT min_payout_sol FROM pricing_config WHERE active = true ORDER BY created_at DESC LIMIT 1
    `);
        const minPayout = configResult.rows[0]?.min_payout_sol
            ? Number(configResult.rows[0].min_payout_sol)
            : 1.0;

        if (amount < minPayout) {
            return { valid: false, error: `Minimum payout is ${minPayout} SOL` };
        }

        // 2. Get user's referral_balance
        const userResult = await query<{ referral_balance: number }>(`
      SELECT referral_balance FROM users WHERE user_id = $1
    `, [userId]);

        const balance = Number(userResult.rows[0]?.referral_balance || 0);

        // 3. Check amount <= balance
        if (amount > balance) {
            return { valid: false, error: `Insufficient balance. Available: ${balance} SOL` };
        }

        // 4. Check for pending payout request
        const pendingResult = await query<{ count: number }>(`
      SELECT COUNT(*) as count FROM payout_requests 
      WHERE user_id = $1 AND status = 'pending'
    `, [userId]);

        if (Number(pendingResult.rows[0].count) > 0) {
            return { valid: false, error: 'You have a pending payout request. Please wait for it to be processed.' };
        }

        // 5. Check if 24 hours have passed since last request
        // "payout_cooldown_hours" from config
        const cooldownResult = await query<{ requested_at: string }>(`
      SELECT requested_at FROM payout_requests 
      WHERE user_id = $1 
      ORDER BY requested_at DESC LIMIT 1
    `, [userId]);

        if (cooldownResult.rows.length > 0) {
            const lastRequested = new Date(cooldownResult.rows[0].requested_at);
            const now = new Date();
            const diffHours = (now.getTime() - lastRequested.getTime()) / (1000 * 60 * 60);

            if (diffHours < 24) {
                const nextAvailable = new Date(lastRequested.getTime() + 24 * 60 * 60 * 1000);
                return {
                    valid: false,
                    error: `You can only request a payout once every 24 hours.`,
                    canRequestAt: nextAvailable.toISOString()
                };
            }
        }

        return { valid: true };
    }

    /**
     * Get payout history for a user
     */
    async getPayoutHistory(
        userId: number,
        page: number = 1,
        limit: number = 20
    ): Promise<{ payouts: PayoutRequest[]; pagination: PaginationInfo }> {
        const offset = (page - 1) * limit;

        const countResult = await query<{ count: number }>(`
      SELECT COUNT(*) as count FROM payout_requests WHERE user_id = $1
    `, [userId]);
        const total = Number(countResult.rows[0].count);

        const result = await query<any>(`
      SELECT * FROM payout_requests 
      WHERE user_id = $1
      ORDER BY requested_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

        const payouts: PayoutRequest[] = result.rows.map(row => ({
            payoutId: row.payout_id,
            userId: row.user_id,
            amount: Number(row.amount_sol),
            walletAddress: row.wallet_address,
            status: row.status,
            requestedAt: row.requested_at,
            processedAt: row.processed_at,
            solTxHash: row.sol_tx_hash,
            rejectionReason: row.rejection_reason,
        }));

        return {
            payouts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
