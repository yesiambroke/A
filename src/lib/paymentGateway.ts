import axios, { AxiosInstance } from 'axios';

interface PaymentGatewayConfig {
    apiUrl: string;
    apiKey: string;
}

interface CreateInvoiceParams {
    invoiceId: string;
    amount: number; // in SOL
    label?: string;
    webhookUrl?: string;
}

interface CreateInvoiceResponse {
    invoice_id: string;
    amount: number;
    amount_sol: number;
    wallet_address: string;
    status: string;
    expires_at: string;
    created_at: string;
}

interface InvoiceStatusResponse {
    invoice_id: string;
    status: 'pending' | 'paid' | 'confirmed' | 'expired' | 'cancelled';
    amount: number;
    paid_at?: string;
    confirmed_at?: string;
    sweep_signature?: string;
}

export class PaymentGatewayClient {
    private client: AxiosInstance;

    constructor(config: PaymentGatewayConfig) {
        this.client = axios.create({
            baseURL: config.apiUrl,
            headers: {
                'x-api-key': config.apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
    }

    /**
     * Create a new payment invoice
     */
    async createInvoice(params: CreateInvoiceParams): Promise<{
        invoiceId: string;
        paymentAddress: string;
        amount: number;
        expiresAt: string;
        qrCodeData: string;
    }> {
        try {
            const response = await this.client.post<{ success: boolean; data: CreateInvoiceResponse }>(
                '/invoices',
                {
                    invoice_id: params.invoiceId,
                    amount: params.amount,
                    label: params.label,
                    callback_url: params.webhookUrl,
                }
            );

            const data = response.data.data;

            // Generate QR code data string (e.g. solana:<address>?amount=<amount>)
            // The gateway doesn't return qr_code_data, but we need it for the frontend
            const qrCodeData = `solana:${data.wallet_address}?amount=${data.amount_sol}`;

            return {
                invoiceId: data.invoice_id,
                paymentAddress: data.wallet_address,
                amount: data.amount_sol, // The gateway returns both amount (lamports) and amount_sol
                expiresAt: data.expires_at,
                qrCodeData: qrCodeData,
            };
        } catch (error: any) {
            console.error('PaymentGateway createInvoice error:', error.response?.data || error.message);
            throw new Error(`Failed to create invoice: ${JSON.stringify(error.response?.data?.error) || error.message}`);
        }
    }

    /**
     * Get the status of an invoice
     */
    async getInvoiceStatus(invoiceId: string): Promise<{
        invoiceId: string;
        status: string;
        amount: number;
        paidAt?: string;
        confirmedAt?: string;
        sweepSignature?: string;
    }> {
        try {
            const response = await this.client.get<{ success: boolean; data: InvoiceStatusResponse }>(
                `/invoices/${invoiceId}`
            );

            const data = response.data.data;

            return {
                invoiceId: data.invoice_id,
                status: data.status,
                amount: data.amount,
                paidAt: data.paid_at,
                confirmedAt: data.confirmed_at,
                sweepSignature: data.sweep_signature,
            };
        } catch (error: any) {
            console.error('PaymentGateway getInvoiceStatus error:', error.response?.data || error.message);
            // Return a default error status if not found or other error
            if (error.response?.status === 404) {
                throw new Error('Invoice not found');
            }
            throw new Error(`Failed to get invoice status: ${error.response?.data?.error || error.message}`);
        }
    }
}

// Singleton instance will be created with config from environment variables
// inside the service initialization
