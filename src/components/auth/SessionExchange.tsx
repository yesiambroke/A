"use client";

import { useEffect, useMemo, useState } from "react";

const formatToken = (token: string) => {
  if (token.length <= 12) return token;
  return `${token.slice(0, 8)}…${token.slice(-6)}`;
};

type Props = {
  token: string;
};

type ExchangeState = "idle" | "pending" | "requires2fa" | "success" | "error";

type StatusMessage = {
  state: ExchangeState;
  title: string;
  detail: string;
};

const statusCopy: Record<ExchangeState, StatusMessage> = {
  idle: {
    state: "idle",
    title: "Awaiting token",
    detail: "Provide a session token via Telegram to continue.",
  },
  pending: {
    state: "pending",
    title: "Validating token",
    detail: "We are verifying the one-time token with the auth database.",
  },
  requires2fa: {
    state: "requires2fa",
    title: "2FA Required",
    detail: "Enter your 6-digit code from Google Authenticator to complete login.",
  },
  success: {
    state: "success",
    title: "Session authenticated",
    detail: "Session authenticated! Redirecting you to the terminal shortly.",
  },
  error: {
    state: "error",
    title: "Validation failed",
    detail: "Token invalid, used, or expired. Request a new link in Telegram.",
  },
};

const SessionExchange = ({ token }: Props) => {
  const [state, setState] = useState<ExchangeState>(token ? "pending" : "idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [twofaCode, setTwofaCode] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [verifying2fa, setVerifying2fa] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const exchange = async () => {
      try {
        setState("pending");
        setErrorDetail(null);

        const response = await fetch("/api/auth/validate-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_token: token }),
        });

        const payload = await response.json();

        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error ?? "Unknown error");
        }

        if (payload.requires2fa) {
          if (!cancelled) {
            setState("requires2fa");
            setUserId(payload.user.userId);
          }
          return;
        }

        if (!cancelled) {
          if (payload.websocket_url) {
            localStorage.setItem("ace-trade-websocket-url", payload.websocket_url);
          }
          setState("success");
          setTimeout(() => {
            window.location.href = "/screener";
          }, 1200);
        }
      } catch (err) {
        console.error("Session exchange failed", err);
        if (!cancelled) {
          setState("error");
          if (err instanceof Error && err.message.toLowerCase().includes("account is locked")) {
            setErrorDetail("Account is locked. Use /unlock <2fa_code> in the Telegram bot to unlock your account before trying again.");
          } else {
            setErrorDetail(err instanceof Error ? err.message : "Unknown error");
          }
        }
      }
    };

    if (token) {
      exchange();
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || twofaCode.length !== 6) return;

    try {
      setVerifying2fa(true);
      setErrorDetail(null);

      const response = await fetch("/api/auth/verify-2fa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, code: twofaCode }),
      });

      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "Invalid 2FA code");
      }

      if (payload.websocket_url) {
        localStorage.setItem("ace-trade-websocket-url", payload.websocket_url);
      }
      setState("success");
      setVerifying2fa(false);
      setTimeout(() => {
        window.location.href = "/screener";
      }, 1200);
    } catch (err) {
      console.error("2FA verification failed", err);
      setState("requires2fa");
      setVerifying2fa(false);
      setErrorDetail(err instanceof Error ? err.message : "Verification failed");
    }
  };

  const status = useMemo(() => statusCopy[state], [state]);

  return (
    <div className="rounded-xl border border-brand-neon/30 bg-black/50 p-6 text-brand-neon/80">
      <p className="text-xs uppercase tracking-[0.4em] text-brand-neon/60">Auth State</p>
      <h3 className="mt-2 text-2xl font-semibold text-brand-neon">{status.title}</h3>
      <p className="mt-3 text-sm text-brand-neon/80">{status.detail}</p>

      {token && (
        <div className="mt-6 space-y-2 text-sm">
          <p className="text-brand-neon/60">Token</p>
          <code className="block rounded-md border border-brand-neon/20 bg-terminal-panel/70 p-3 text-brand-neon/90">
            {formatToken(token)}
          </code>
        </div>
      )}

      {state === "pending" && (
        <div className="mt-8 flex items-center gap-3 text-xs text-brand-neon/80">
          <span className="h-2 w-2 animate-pulse-glow rounded-full bg-brand-neon" />
          Contacting validation endpoint…
        </div>
      )}

      {state === "error" && (
        <div className="mt-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200 space-y-2">
          <p className="font-semibold">{errorDetail ?? "Token rejected"}</p>
          {errorDetail?.toLowerCase().includes("account is locked") ? (
            <p className="text-xs text-red-200/80">
              Open Telegram and send <code>/unlock &lt;your_2fa_code&gt;</code> (example: <code>/unlock 123456</code>) to unlock your account, then request a new session link.
            </p>
          ) : (
            <p className="text-xs text-red-200/80">Request a new session link via the Telegram bot.</p>
          )}
        </div>
      )}

      {state === "requires2fa" && (
        <div className="mt-6 space-y-4">
          <form onSubmit={handle2faSubmit} className="space-y-4">
            <div>
              <label htmlFor="twofa-code" className="block text-sm font-medium text-brand-neon/80">
                2FA Code
              </label>
              <input
                id="twofa-code"
                type="text"
                value={twofaCode}
                onChange={(e) => setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 block w-full rounded-md border border-brand-neon/30 bg-black/50 px-3 py-2 text-brand-neon placeholder-brand-neon/50 focus:border-brand-neon focus:outline-none"
                placeholder="000000"
                maxLength={6}
                required
              />
            </div>
            <button
              type="submit"
              disabled={twofaCode.length !== 6 || verifying2fa}
              className="w-full rounded-md border border-brand-neon/40 bg-brand-neon/10 px-4 py-2 text-sm font-semibold text-brand-neon hover:bg-brand-neon/20 disabled:opacity-50"
            >
              {verifying2fa ? "Verifying..." : "Verify & Login"}
            </button>
          </form>
          {errorDetail && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
              <p className="font-semibold">{errorDetail}</p>
            </div>
          )}
        </div>
      )}

      {state === "success" && (
        <div className="mt-6 rounded-lg border border-brand-neon/40 bg-brand-neon/10 p-4 text-sm text-brand-neon">
          <p className="font-semibold">Session authenticated!</p>
          <p className="text-xs text-brand-neon/80">You will be redirected to /screener automatically.</p>
        </div>
      )}
    </div>
  );
};

export default SessionExchange;
