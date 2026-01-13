import { getSessionFromCookies } from "@/lib/auth/session";
import TradingTerminal from "@/components/terminal/TradingTerminal";
import type { Metadata } from "next";

const TradingPage = async ({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) => {
  const session = await getSessionFromCookies();

  const operator = session ? {
    userId: session.userId,
    tier: session.tier,
    is2faEnabled: session.is2faEnabled,
  } : null;

  return (
    <div className="min-h-screen bg-black px-1 py-1 sm:px-3 sm:py-2 font-mono text-green-400">
      <div className="fixed inset-0 pointer-events-none opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.1) 2px, rgba(0,255,0,0.1) 4px)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[98vw] sm:max-w-[97vw]">
      <div className="border-2 border-green-500 bg-black shadow-2xl shadow-green-500/20 h-[calc(100vh-1rem)]">
          <TradingTerminal operator={operator} />
        </div>
      </div>
    </div>
  );
};

export default TradingPage;