import { NextRequest, NextResponse } from "next/server";
import { UpgradeService } from "@/lib/services/upgradeService";
import { serverEnv } from "@/config/serverEnv";
import crypto from 'crypto';

function verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
): boolean {
    if (!signature || !secret) return false;

    const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

    // Use timingSafeEqual to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) return false;

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('x-webhook-signature') || '';

        // Verify signature
        if (!verifyWebhookSignature(rawBody, signature, serverEnv.paymentGateway.webhookSecret)) {
            console.error("Invalid webhook signature");
            return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
        }

        const body = JSON.parse(rawBody);

        // Only process payment.confirmed events
        if (body.event === 'payment.confirmed') {
            const upgradeService = new UpgradeService();
            await upgradeService.processPaymentConfirmation(body.invoice_id, {
                amount_sol: body.amount_sol,
                paid_at: body.paid_at,
                confirmed_at: body.confirmed_at,
                sweep_signature: body.sweep_signature
            });
        }

        return NextResponse.json({ success: true, message: "Webhook processed" });
    } catch (error: any) {
        console.error("POST /api/upgrade/webhook error", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
