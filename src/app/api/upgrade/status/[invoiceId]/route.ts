import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/requireSession";
import { UpgradeService } from "@/lib/services/upgradeService";
import { HttpError } from "@/lib/errors";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ invoiceId: string }> }
) {
    try {
        await requireApiSession(request);
        const { invoiceId } = await params;

        if (!invoiceId) {
            return NextResponse.json({ success: false, error: "Invoice ID required" }, { status: 400 });
        }

        const upgradeService = new UpgradeService();
        const invoiceStatus = await upgradeService.getInvoiceStatus(invoiceId);

        return NextResponse.json({
            success: true,
            invoice: invoiceStatus
        });
    } catch (error: any) {
        if (error instanceof HttpError) {
            return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
        }

        if (error.message.includes("Invoice not found")) {
            return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
        }

        console.error(`GET /api/upgrade/status/[invoiceId] error`, error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
