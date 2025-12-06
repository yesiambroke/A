import { z } from "zod";

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
};
