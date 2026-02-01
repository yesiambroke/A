'use client';

import React from "react";
import Link from "next/link";

type UserInfo = {
  userId: number;
  accountId: string;
  tier: string;
  is2faEnabled: boolean;
};

type ToggleState = "idle" | "pending" | "success" | "error";



const SettingsPanel = ({ user }: { user: UserInfo }) => {
  const [is2faEnabled, setIs2faEnabled] = React.useState(user.is2faEnabled);
  const [toggleState, setToggleState] = React.useState<ToggleState>("idle");
  const [toggleError, setToggleError] = React.useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string | null>(null);
  const [showQrCode, setShowQrCode] = React.useState(false);
  const [verificationCode, setVerificationCode] = React.useState("");
  const [telegramCode, setTelegramCode] = React.useState("");
  const [verifying, setVerifying] = React.useState(false);
  const [recoveryKey, setRecoveryKey] = React.useState<string | null>(null);
  const [countdown, setCountdown] = React.useState<number | null>(null);
  const [authKey, setAuthKey] = React.useState<string | null>(null);
  const [authKeyExpires, setAuthKeyExpires] = React.useState<number | null>(null);
  const [generatingKey, setGeneratingKey] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };





  const toggle2fa = async (enabled: boolean) => {
    if (enabled) {
      // Start setup process - just show instruction to get TG code
      setToggleState("idle");
      setToggleError("Get a verification code from Telegram first (/enable_2fa), then enter it below.");
      setShowQrCode(true);
    } else {
      // Disable 2FA - requires both current 2FA code and TG code
      if (!verificationCode || verificationCode.length !== 6) {
        setToggleError("Enter your current 2FA code");
        return;
      }
      if (!telegramCode) {
        setToggleError("Enter the verification code from Telegram (/disable_2fa)");
        return;
      }

      try {
        setToggleState("pending");
        setToggleError(null);
        const res = await fetch("/api/auth/twofa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled, telegramCode, current2faCode: verificationCode }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Failed to disable 2FA");
        }
        setIs2faEnabled(false);
        setQrCodeUrl(null);
        setShowQrCode(false);
        setTelegramCode("");
        setToggleState("success");

        // Show recovery key invalidation message
        setTimeout(() => {
          showToast("2FA disabled successfully! Your recovery key has been invalidated.");
          setToggleState("idle");
        }, 1500);
      } catch (err) {
        setToggleState("error");
        setToggleError(err instanceof Error ? err.message : "Unknown error");
      }
    }
  };

  const verifyAndActivate2fa = async () => {
    if (verificationCode.length !== 6 || telegramCode.length === 0) return;

    try {
      setVerifying(true);
      const res = await fetch("/api/auth/verify-2fa-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verificationCode, telegramCode }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Invalid verification code");
      }
      setIs2faEnabled(true);
      setRecoveryKey(data.recoveryKey);
      setShowQrCode(false);
      setQrCodeUrl(null);
      setVerificationCode("");
      setTelegramCode("");
      setToggleState("success");

      // Start countdown before logout
      setCountdown(30);
      const countdownInterval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownInterval);
            // Auto logout after countdown
            setTimeout(async () => {
              try {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/auth/login?message=2fa_enabled";
              } catch (error) {
                console.error("Logout failed:", error);
                window.location.reload();
              }
            }, 500);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setToggleError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  // Wallet Client Connection Functions
  const generateAuthKey = async () => {
    try {
      setGeneratingKey(true);
      const res = await fetch("/api/settings/generate-auth-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to generate auth key");
      }
      setAuthKey(data.authKey);
      setAuthKeyExpires(data.expiresAt);
    } catch (err) {
      console.error("Generate auth key error:", err);
      showToast("❌ Failed to generate auth key: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setGeneratingKey(false);
    }
  };

  const revokeAuthKey = async () => {
    if (!confirm("Are you sure you want to revoke the current auth key? Your wallet client will be disconnected.")) {
      return;
    }

    try {
      const res = await fetch("/api/settings/revoke-auth-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to revoke auth key");
      }
      setAuthKey(null);
      setAuthKeyExpires(null);
    } catch (err) {
      console.error("Revoke auth key error:", err);
      showToast("❌ Failed to revoke auth key: " + (err instanceof Error ? err.message : "Unknown error"));
    }
  };

  const copyAuthKey = () => {
    if (authKey) {
      navigator.clipboard.writeText(authKey);
      showToast("Auth key copied to clipboard!");
    }
  };

  // Load auth key status on mount
  React.useEffect(() => {
    const loadAuthKeyStatus = async () => {
      try {
        const res = await fetch("/api/settings/auth-key-status");
        const data = await res.json();
        if (data?.success && data.authKey) {
          setAuthKey(data.authKey);
          setAuthKeyExpires(data.expiresAt);
        }
      } catch (err) {
        console.error("Load auth key status error:", err);
      }
    };
    loadAuthKeyStatus();
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-green-500 px-3 py-2 flex items-center gap-3 text-black">
        <div className="flex gap-1">
          <div className="relative w-2 h-2.5 animate-card-flip" style={{ transformStyle: 'preserve-3d' }}>
            <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[4px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>♠</div>
            <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[4px] font-bold text-black" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♠</div>
          </div>
          <div className="relative w-2 h-2.5 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '0.7s' }}>
            <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[4px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>♥</div>
            <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[4px] font-bold text-black" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♥</div>
          </div>
          <div className="relative w-2 h-2.5 animate-card-flip" style={{ transformStyle: 'preserve-3d', animationDelay: '1.4s' }}>
            <div className="absolute inset-0 bg-black border border-green-500 rounded-sm flex items-center justify-center text-[4px] font-bold text-green-500" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>♣</div>
            <div className="absolute inset-0 bg-green-500 border border-black rounded-sm flex items-center justify-center text-[4px] font-bold text-black" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>♣</div>
          </div>
        </div>
        <div className="text-xs sm:text-sm font-bold">A-TRADE://settings</div>
        <div className="ml-auto flex items-center gap-3 text-[11px] sm:text-xs">
          <Link
            href="/screener"
            className="border border-black/60 bg-black/20 px-2 py-1 text-xs font-semibold hover:bg-black/30"
          >
            ← Screener
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Profile</p>
          <div className="text-sm text-green-200 space-y-2">
            <div className="flex justify-between border border-green-500/20 px-2 py-1">
              <span className="text-green-500/80">User</span>
              <span className="font-semibold text-green-200">#{user.accountId}</span>
            </div>
            <div className="flex justify-between border border-green-500/20 px-2 py-1">
              <span className="text-green-500/80">Tier</span>
              <span className="font-semibold text-green-200">{user.tier.toUpperCase()}</span>
            </div>
            <div className="flex justify-between border border-green-500/20 px-2 py-1">
              <span className="text-green-500/80">2FA</span>
              <span className="font-semibold text-green-200">{is2faEnabled ? "Enabled" : "Disabled"}</span>
            </div>
          </div>
        </div>

        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3 lg:col-span-2">
          <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Security Controls</p>
          <div className="space-y-4">
            <div className="space-y-3">
              <p className="text-sm text-green-300">Two-Factor Authentication</p>
              <div className="flex items-center justify-between border border-green-500/40 px-3 py-2 text-green-200 text-sm">
                <span>{is2faEnabled ? "Enabled" : "Disabled"}</span>
                <button
                  type="button"
                  onClick={() => toggle2fa(!is2faEnabled)}
                  disabled={toggleState === "pending"}
                  className="border border-green-500 px-3 py-1.5 text-green-200 hover:bg-green-500/10 disabled:opacity-50"
                >
                  {toggleState === "pending" ? "Updating..." : is2faEnabled ? "Disable" : "Enable"}
                </button>
              </div>

              {is2faEnabled && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label htmlFor="current-2fa" className="block text-sm text-green-300">
                      Current 2FA Code
                    </label>
                    <input
                      id="current-2fa"
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-black border border-green-500/40 px-3 py-2 text-green-200 placeholder:text-green-500/50 focus:outline-none"
                      placeholder="000000"
                      maxLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="telegram-code" className="block text-sm text-green-300">
                      Telegram Code (for disable)
                    </label>
                    <input
                      id="telegram-code"
                      type="text"
                      value={telegramCode}
                      onChange={(e) => setTelegramCode(e.target.value.toUpperCase())}
                      className="w-full bg-black border border-green-500/40 px-3 py-2 text-green-200 placeholder:text-green-500/50 focus:outline-none"
                      placeholder="Enter TG code from /disable_2fa"
                      maxLength={8}
                    />
                  </div>
                </div>
              )}
              {showQrCode && (
                <div className="border border-green-500/40 bg-black/50 p-4 space-y-3">
                  {!qrCodeUrl ? (
                    <div className="text-center space-y-3">
                      <p className="text-sm text-green-300">Get Telegram Verification Code</p>
                      <p className="text-xs text-green-500/80">
                        Send /enable_2fa in Telegram to get a verification code, then enter it below.
                      </p>
                      <input
                        type="text"
                        value={telegramCode}
                        onChange={(e) => setTelegramCode(e.target.value.toUpperCase())}
                        className="w-full bg-black border border-green-500/40 px-3 py-2 text-green-200 placeholder:text-green-500/50 focus:outline-none"
                        placeholder="Enter TG code (e.g., A1B2C3D4)"
                        maxLength={8}
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          if (!telegramCode) return;
                          try {
                            setToggleState("pending");
                            const res = await fetch("/api/auth/twofa", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ enabled: true, telegramCode }),
                            });
                            const data = await res.json();
                            if (!res.ok || !data?.success) {
                              throw new Error(data?.error || "Invalid Telegram code");
                            }
                            setQrCodeUrl(data.qrCodeUrl);
                            setToggleState("idle");
                          } catch (err) {
                            setToggleState("error");
                            setToggleError(err instanceof Error ? err.message : "Invalid code");
                          }
                        }}
                        disabled={!telegramCode || toggleState === "pending"}
                        className="w-full border border-green-500 px-3 py-2 text-green-200 hover:bg-green-500/10 disabled:opacity-50"
                      >
                        {toggleState === "pending" ? "Verifying..." : "Continue Setup"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-green-300">Scan QR Code with Google Authenticator</p>
                      <img src={qrCodeUrl} alt="2FA QR Code" className="mx-auto border border-green-500/40" />
                      <p className="text-xs text-green-500/80 text-center mb-3">
                        Scan this code with Google Authenticator or similar app
                      </p>
                      <div className="space-y-2">
                        <label htmlFor="verify-code" className="block text-sm text-green-300">
                          Enter verification code to activate 2FA
                        </label>
                        <input
                          id="verify-code"
                          type="text"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="w-full bg-black border border-green-500/40 px-3 py-2 text-green-200 placeholder:text-green-500/50 focus:outline-none"
                          placeholder="000000"
                          maxLength={6}
                        />
                        <button
                          type="button"
                          onClick={verifyAndActivate2fa}
                          disabled={verificationCode.length !== 6 || verifying}
                          className="w-full border border-green-500 px-3 py-2 text-green-200 hover:bg-green-500/10 disabled:opacity-50"
                        >
                          {verifying ? "Verifying..." : "Verify & Activate 2FA"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowQrCode(false);
                            setQrCodeUrl(null);
                            setVerificationCode("");
                            setTelegramCode("");
                          }}
                          className="w-full border border-red-500 px-3 py-2 text-red-200 hover:bg-red-500/10 mt-2"
                        >
                          Cancel Setup
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {recoveryKey && (
                <div className="border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-3">
                  <p className="text-sm text-yellow-300 font-semibold">Save Your Recovery Key</p>
                  <p className="text-xs text-yellow-200/80">
                    This key allows emergency 2FA disable. Save it securely - it will never be shown again!
                  </p>
                  <code className="block bg-black p-3 border border-yellow-500/40 text-yellow-200 font-mono text-sm break-all">
                    {recoveryKey}
                  </code>
                  {countdown !== null ? (
                    <div className="text-center space-y-2">
                      <p className="text-sm text-yellow-300">
                        Auto-logout in <span className="font-bold text-xl">{countdown}</span> seconds
                      </p>
                      <p className="text-xs text-yellow-200/70">
                        Copy your recovery key before logout!
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(recoveryKey);
                          setRecoveryKey(null);
                          setCountdown(null);
                          // Immediate logout
                          setTimeout(async () => {
                            try {
                              await fetch("/api/auth/logout", { method: "POST" });
                              window.location.href = "/auth/login?message=2fa_enabled";
                            } catch (error) {
                              console.error("Logout failed:", error);
                              window.location.reload();
                            }
                          }, 500);
                        }}
                        className="w-full border border-yellow-500 px-3 py-2 text-yellow-200 hover:bg-yellow-500/10"
                      >
                        I've Copied - Logout Now
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(recoveryKey);
                        setRecoveryKey(null);
                      }}
                      className="w-full border border-yellow-500 px-3 py-2 text-yellow-200 hover:bg-yellow-500/10"
                    >
                      Copy & Hide Key
                    </button>
                  )}
                </div>
              )}
              {toggleState === "error" && toggleError && (
                <p className="text-xs text-red-400">{toggleError}</p>
              )}
              {toggleState === "success" && (
                <p className="text-xs text-green-300">2FA updated.</p>
              )}
              <p className="text-[11px] text-green-500/80">
                When enabled, you'll need to enter a 6-digit code from Google Authenticator to log in.
              </p>
            </div>
          </div>
        </div>

        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Referral Program</p>
          <div className="space-y-4">
            <div className="text-sm text-green-300">
              Earn some SOL for each friend who upgrades to Pro! Share A-Trade and help build the ultimate trading platform.
            </div>
            <div className="text-center">
              <Link
                href="/referral"
                className="border border-green-500 px-4 py-2 text-green-200 hover:bg-green-500/10"
              >
                View Referral Program
              </Link>
            </div>
          </div>
        </div>

        {user.tier !== 'pro' && (
          <div className="border border-green-500/40 bg-black/85 p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Pro Membership</p>
            <div className="space-y-4">
              <div className="text-sm text-green-300 space-y-2">
                <p>Ready to unlock advanced trading features?</p>
                <ul className="list-disc list-inside space-y-1 text-green-200/80">
                  <li>Lower trading fees (0.222% vs 0.444%)</li>
                  <li>Up to 50 active wallets simultaneously (vs 9)</li>
                  <li>Early access to future products and exclusive features</li>
                  <li>Support a solo developer building innovative trading tools</li>
                </ul>
              </div>

              <a
                href="/upgrade"
                className="inline-block w-full border border-green-500 px-3 py-2 text-green-200 hover:bg-green-500/10 text-center transition-colors duration-200"
              >
                View Pro Upgrade Options
              </a>

              <p className="text-[11px] text-green-500/80">
                Visit the upgrade page for detailed pricing and benefits.
              </p>
            </div>
          </div>
        )}

        <div className="border border-green-500/40 bg-black/85 p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.3em] text-green-400/70">Wallet Client Connection</p>
          <div className="space-y-4">
            <div className="text-sm text-green-300">
              Connect your wallet client to enable secure trading.
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between border border-green-500/40 px-3 py-2">
                <span className="text-green-300 text-sm">Connection Status</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${authKey ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-green-200 font-mono text-xs">
                    {authKey ? 'AUTH KEY ACTIVE' : 'NO AUTH KEY'}
                  </span>
                </div>
              </div>

              {authKey && (
                <div className="border border-green-500/40 bg-green-500/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-green-300 text-sm font-semibold">Active Auth Key</span>
                    <span className="text-green-400/70 text-xs">
                      Expires: {authKeyExpires ? new Date(authKeyExpires).toLocaleString() : 'Unknown'}
                    </span>
                  </div>
                  <div className="font-mono text-green-200 bg-black/50 p-2 rounded border border-green-500/30 text-sm break-all">
                    {authKey}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={copyAuthKey}
                      className="px-3 py-1 border border-green-500/40 rounded bg-green-500/10 text-green-100 hover:bg-green-500/20 text-xs"
                    >
                      Copy Key
                    </button>
                    <button
                      onClick={revokeAuthKey}
                      className="px-3 py-1 border border-red-500/40 rounded bg-red-500/10 text-red-100 hover:bg-red-500/20 text-xs"
                    >
                      Revoke Key
                    </button>
                  </div>
                </div>
              )}

              {!authKey && (
                <div className="text-center space-y-3">
                  <p className="text-green-500/60 text-sm">
                    No active authentication key. Generate one to connect your wallet client.
                  </p>
                  <button
                    onClick={generateAuthKey}
                    disabled={generatingKey}
                    className="px-4 py-2 border border-green-500/40 rounded bg-green-500/10 text-green-100 hover:bg-green-500/20 disabled:opacity-50"
                  >
                    {generatingKey ? 'Generating...' : 'Generate Auth Key'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-2 fade-in duration-500 ease-out">
          <div className="bg-green-500/20 text-green-50 px-5 py-3 rounded-md shadow-lg border border-green-400/30 font-mono text-sm backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="text-green-200/80">✓</span>
              <span dangerouslySetInnerHTML={{ __html: toastMessage }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPanel;
