import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { PayoutService } from "@/lib/services/payoutService";
import { HttpError } from "@/lib/errors";

export async function GET(request: NextRequest) {
    try {
        const session = await requireApiSession(request);
        const searchParams = request.nextUrl.searchParams;
        const page = Number(searchParams.get("page")) || 1;
        const limit = Number(searchParams.get("limit")) || 20;

        const payoutService = new PayoutService();
        const result = await payoutService.getPayoutHistory(session.userId, page, limit);

        return NextResponse.json({
            success: true,
            ...result
        });
    } catch (error: any) {
        if (error instanceof HttpError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
        }

        console.error("GET /api/referrals/payout/history error", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
