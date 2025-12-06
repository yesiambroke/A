import SessionExchange from "@/components/auth/SessionExchange";
import { getSessionFromCookies } from "@/lib/auth/session";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams: SearchParams;
};

const formatMissingMessage = `No session link detected. Request a new one inside Telegram to continue.`;

const Page = async ({ searchParams }: Props) => {
  const session = await getSessionFromCookies();
  if (session) {
    redirect("/screener");
  }

  const resolvedParams = await searchParams;
  const queryToken = resolvedParams?.token ?? resolvedParams?.session_token;
  const token = Array.isArray(queryToken) ? queryToken[0] : queryToken;
  const message = resolvedParams?.message;

  if (!token) {
    redirect("/");
  }

  return (
    <main className="relative flex min-h-screen flex-col gap-8 px-6 py-16 sm:px-12 lg:px-20">
      <div className="pointer-events-none absolute inset-0 opacity-30" data-grid-overlay />
      <section className="relative z-10 max-w-3xl w-full mx-auto space-y-6">
        <div className="card-panel">
          <p className="text-xs uppercase tracking-[0.4em] text-brand-neon/60">/auth/login</p>
          <h1 className="mt-4 text-3xl font-semibold text-brand-neon">Sign in</h1>
          <p className="mt-3 text-brand-neon/80">Use the Telegram link to enter the terminal.</p>
          {message === "2fa_enabled" && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/40 rounded">
              <p className="text-sm text-green-300">✅ 2FA has been successfully enabled!</p>
              <p className="text-xs text-green-400/80 mt-1">Please sign in again to verify your 2FA setup.</p>
            </div>
          )}
          {message === "recovery_success" && (
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/40 rounded">
              <p className="text-sm text-blue-300">🔓 Emergency recovery completed!</p>
              <p className="text-xs text-blue-400/80 mt-1">2FA has been disabled. Please sign in normally.</p>
            </div>
          )}
        </div>
        <div className="relative z-10">
          {token ? (
            <SessionExchange token={token} />
          ) : (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-brand-neon">
              <p className="text-sm font-semibold">{formatMissingMessage}</p>
              <p className="mt-3 text-xs text-brand-neon/70">
                Tip: use &ldquo;Open Session&rdquo; in Telegram to get a new link.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
};

export default Page;
