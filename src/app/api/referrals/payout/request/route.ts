import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { PayoutService } from "@/lib/services/payoutService";
import { HttpError } from "@/lib/errors";

export async function POST(request: NextRequest) {
    try {
        const session = await requireApiSession(request);
        const body = await request.json();
        const { amount, walletAddress } = body;

        if (!amount || !walletAddress) {
            return NextResponse.json({ success: false, error: "Amount and wallet address required" }, { status: 400 });
        }

        const payoutService = new PayoutService();
        const payout = await payoutService.requestPayout(
            session.userId,
            Number(amount),
            walletAddress
        );

        return NextResponse.json({
            success: true,
            payout
        });
    } catch (error: any) {
        if (error instanceof HttpError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
        }

        // Handle service validation errors
        if (error.message.includes("Insufficient balance") ||
            error.message.includes("pending payout request") ||
            error.message.includes("Minimum payout") ||
            error.message.includes("Invalid Solana wallet") ||
            error.message.includes("once every 24 hours")) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }

        console.error("POST /api/referrals/payout/request error", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
