import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { HttpError } from "@/lib/errors";

export const requireApiSession = async (request: NextRequest) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new HttpError("Unauthorized", 401);
  }
  return session;
};
