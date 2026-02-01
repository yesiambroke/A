import { z } from "zod";


const isProd = process.env.NODE_ENV === "production";

const envSchema = z.object({
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().int().min(1).default(5432),
  DB_NAME: z.string().default("ace_trade_auth"),
  DB_USER: z.string().default("ace_trade_user"),
  DB_PASSWORD: z.string().default("change_me"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters")
    .default("development_secret_key_must_change_32_chars"),
  JWT_EXPIRY_DAYS: z.coerce.number().int().min(1).default(30),
  MAX_ACTIVE_SESSIONS_PER_USER: z.coerce.number().int().min(1).default(5),
  MAX_TABS_PER_USER: z.coerce.number().int().min(1).default(5),
  WS_URL: z.string().default("ws://localhost:8080/ws"),
  RATE_LIMIT_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  RATE_LIMIT_PIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_2FA_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  PAYMENT_GATEWAY_API_URL: z.string().default(isProd ? "https://payment.apteka.wtf/api/v1" : "http://localhost:369/api/v1"),
  PAYMENT_GATEWAY_API_KEY: z.string().default("dev_api_key"),
  PAYMENT_GATEWAY_WEBHOOK_SECRET: z.string().default("dev_webhook_secret"),
  UPGRADE_WEBHOOK_URL: z.string().default(isProd ? "https://a-trade.fun/api/upgrade/webhook" : "http://localhost:3000/api/upgrade/webhook"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration for trade-terminal", parsed.error.flatten().fieldErrors);
  throw new Error("Missing or invalid environment variables. Check trade-terminal/.env");
}

const values = parsed.data;

export const serverEnv = {
  db: {
    host: values.DB_HOST,
    port: values.DB_PORT,
    name: values.DB_NAME,
    user: values.DB_USER,
    password: values.DB_PASSWORD,
  },
  jwt: {
    secret: values.JWT_SECRET,
    expiryDays: values.JWT_EXPIRY_DAYS,
  },
  limits: {
    maxActiveSessions: values.MAX_ACTIVE_SESSIONS_PER_USER,
    maxTabsPerUser: values.MAX_TABS_PER_USER,
  },
  websocketUrl: values.WS_URL,
  rateLimit: {
    loginAttempts: values.RATE_LIMIT_LOGIN_ATTEMPTS,
    loginWindowMinutes: values.RATE_LIMIT_LOGIN_WINDOW_MINUTES,
    pinAttempts: values.RATE_LIMIT_PIN_ATTEMPTS,
    twoFaAttempts: values.RATE_LIMIT_2FA_ATTEMPTS,
  },
  paymentGateway: {
    apiUrl: values.PAYMENT_GATEWAY_API_URL,
    apiKey: values.PAYMENT_GATEWAY_API_KEY,
    webhookSecret: values.PAYMENT_GATEWAY_WEBHOOK_SECRET,
    webhookUrl: values.UPGRADE_WEBHOOK_URL,
  },
};
