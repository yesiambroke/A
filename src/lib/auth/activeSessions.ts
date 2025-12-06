import { query } from "@/lib/db";

export type ActiveSessionRow = {
  active_session_id: string;
  ip_address: string | null;
  device_info: string | null;
  created_at: string;
  last_activity: string;
  expires_at: string;
};

export const listActiveSessionsForUser = async (userId: number) => {
  const { rows } = await query<ActiveSessionRow>(
    `SELECT active_session_id, ip_address, device_info, created_at, last_activity, expires_at
     FROM active_sessions
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return rows;
};

export const deleteActiveSession = async (userId: number, activeSessionId: string) => {
  const { rowCount } = await query(
    `DELETE FROM active_sessions
     WHERE user_id = $1 AND active_session_id = $2`,
    [userId, activeSessionId]
  );

  return (rowCount ?? 0) > 0;
};
