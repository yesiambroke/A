import jwt from "jsonwebtoken";
import { serverEnv } from "@/config/serverEnv";

export type SessionPayload = {
  userId: number;
  tier: string;
  is2faEnabled: boolean;
  sessionId: string;
};

export const createSessionJwt = (payload: SessionPayload) => {
  return jwt.sign(payload, serverEnv.jwt.secret, {
    expiresIn: `${serverEnv.jwt.expiryDays}d`,
  });
};

export const verifySessionJwt = (token: string): SessionPayload | null => {
  try {
    const decoded = jwt.verify(token, serverEnv.jwt.secret);
    if (typeof decoded === "string") {
      return null;
    }
    return decoded as SessionPayload;
  } catch {
    return null;
  }
};
