import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { UpgradeService } from "@/lib/services/upgradeService";
import { HttpError } from "@/lib/errors";

export async function GET(request: NextRequest) {
    try {
        const session = await requireApiSession(request);
        const searchParams = request.nextUrl.searchParams;
        const referralCode = searchParams.get("referralCode") || undefined;

        const upgradeService = new UpgradeService();
        const pricing = await upgradeService.getPricing(session.accountId, referralCode);

        return NextResponse.json({
            success: true,
            pricing
        });
    } catch (error) {
        if (error instanceof HttpError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
        }

        console.error("GET /api/upgrade/pricing error", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
