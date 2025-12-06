import { query } from "@/lib/db";

type LogOptions = {
  userId: number;
  eventType: string;
  success: boolean;
  ipAddress?: string | null;
  deviceInfo?: string | null;
  details?: Record<string, unknown>;
};

export const logSecurityEvent = async ({
  userId,
  eventType,
  success,
  ipAddress,
  deviceInfo,
  details,
}: LogOptions) => {
  await query(
    `INSERT INTO security_logs (user_id, event_type, success, ip_address, device_info, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, eventType, success, ipAddress ?? null, deviceInfo ?? null, details ? JSON.stringify(details) : null]
  );
};
