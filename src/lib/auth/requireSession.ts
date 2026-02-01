import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";
import { query } from "@/lib/db";

export const requireApiSession = async (request: NextRequest) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new HttpError("Unauthorized", 401);
  }
  return session;
};

export const requireAdminSession = async (request: NextRequest) => {
  const session = await requireApiSession(request);

  const result = await query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE user_id = $1`,
    [session.userId]
  );

  if (!result.rows[0]?.is_admin) {
    throw new HttpError("Forbidden: Admin access required", 403);
  }

  return session;
};
