import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { UpgradeService } from "@/lib/services/upgradeService";
import { HttpError } from "@/lib/errors";

export async function POST(request: NextRequest) {
    try {
        const session = await requireApiSession(request);
        const body = await request.json();
        const referralCode = body.referralCode || undefined;

        const upgradeService = new UpgradeService();
        const invoice = await upgradeService.createUpgradeInvoice(session.accountId, referralCode);

        return NextResponse.json({
            success: true,
            invoice
        });
    } catch (error: any) {
        if (error instanceof HttpError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
        }

        // Handle known errors from service (like "User is already a Pro member")
        // If error.message is safe to expose
        if (error.message.includes("User is already a Pro member") ||
            error.message.includes("pending invoice")) {
            return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        }

        console.error("POST /api/upgrade/create-invoice error", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
