'use client';

import { useState } from "react";

export default function RecoveryPage() {
  return (
    <main className="relative flex min-h-screen flex-col gap-8 px-6 py-16 sm:px-12 lg:px-20">
      <div className="pointer-events-none absolute inset-0 opacity-30" data-grid-overlay />
      <section className="relative z-10 max-w-3xl w-full mx-auto space-y-6">
        <div className="card-panel">
          <p className="text-xs uppercase tracking-[0.4em] text-brand-neon/60">/recovery</p>
          <h1 className="mt-4 text-3xl font-semibold text-brand-neon">Emergency 2FA Recovery</h1>
          <p className="mt-3 text-brand-neon/80">
            Lost access to your authenticator app? Use your recovery key to disable 2FA.
          </p>
          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/40 rounded">
            <p className="text-sm text-yellow-300">💡 <strong>How to get your recovery key:</strong></p>
            <p className="text-xs text-yellow-200 mt-1">
              • Enable 2FA on the web app first<br/>
              • Recovery key is shown once after setup<br/>
              • Use Telegram: /recovery_key (confirms availability)<br/>
              • Store it securely offline<br/>
              • Recovery only works when 2FA is enabled and account is not locked
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-brand-neon">
          <p className="text-sm font-semibold mb-2">⚠️ Emergency Use Only</p>
          <p className="text-xs text-brand-neon/70">
            This will disable your 2FA protection. Only use if you've lost access to your authenticator app.
            Make sure to re-enable 2FA immediately after regaining access.
          </p>
        </div>

        <RecoveryForm />
      </section>
    </main>
  );
}

function RecoveryForm() {
  const [accountId, setAccountId] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !recoveryKey) return;

    setStatus("loading");
    setError("");

    try {
      const res = await fetch("/api/auth/verify-recovery-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, recoveryKey }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Invalid recovery key");
      }

      setStatus("success");

      // Log out user to force fresh login with updated 2FA state
      setTimeout(async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/auth/login?message=recovery_success";
        } catch (error) {
          console.error("Logout failed:", error);
          window.location.reload();
        }
      }, 2000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Recovery failed");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-6 text-brand-neon">
        <p className="text-sm font-semibold mb-2">✅ Recovery Successful</p>
        <p className="text-xs text-brand-neon/70 mb-4">
          Your 2FA has been disabled. Please re-enable it immediately for security.
        </p>
        <a
          href="/settings"
          className="inline-block border border-green-500 px-4 py-2 text-green-200 hover:bg-green-500/10"
        >
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-brand-neon/30 bg-black/50 p-6 text-brand-neon/80 space-y-4">
      <div>
        <label htmlFor="accountId" className="block text-sm font-medium text-brand-neon/80 mb-2">
          Account ID
        </label>
        <input
          id="accountId"
          type="text"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value.toUpperCase())}
          className="w-full bg-black border border-brand-neon/40 px-3 py-2 text-brand-neon placeholder:text-brand-neon/50 focus:outline-none font-mono"
          placeholder="Your 12-character account ID"
          maxLength={12}
          required
        />
      </div>

      <div>
        <label htmlFor="recoveryKey" className="block text-sm font-medium text-brand-neon/80 mb-2">
          Recovery Key
        </label>
        <input
          id="recoveryKey"
          type="text"
          value={recoveryKey}
          onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
          className="w-full bg-black border border-brand-neon/40 px-3 py-2 text-brand-neon placeholder:text-brand-neon/50 focus:outline-none font-mono"
          placeholder="Your 32-character recovery key"
          maxLength={32}
          required
        />
      </div>

            <button
              type="submit"
              disabled={accountId.length !== 12 || !recoveryKey || status === "loading"}
              className="w-full border border-brand-neon px-3 py-2 text-brand-neon hover:bg-brand-neon/10 disabled:opacity-50"
            >
              {status === "loading" ? "Verifying..." : "Disable 2FA"}
            </button>

      {status === "error" && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </form>
  );
}