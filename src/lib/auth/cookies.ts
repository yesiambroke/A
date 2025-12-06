import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/config/serverEnv";

export const SESSION_COOKIE_NAME = "ace_trade_session";
const cookieMaxAge = serverEnv.jwt.expiryDays * 24 * 60 * 60;

const baseCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: cookieMaxAge,
};

export const attachSessionCookie = (response: NextResponse, token: string) => {
  response.cookies.set(SESSION_COOKIE_NAME, token, baseCookieOptions);
  return response;
};

export const clearSessionCookie = (response: NextResponse) => {
  response.cookies.set(SESSION_COOKIE_NAME, "", { ...baseCookieOptions, maxAge: 0 });
  return response;
};

export const getSessionCookieFromRequest = (request: NextRequest) => {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
};

export const getSessionCookieFromServer = async () => {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
};
