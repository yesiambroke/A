import { getSessionFromCookies } from "@/lib/auth/session";
import PageHeader from "@/components/shared/PageHeader";
import Screener from "@/components/screener/Screener";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A-TRADE://screener",
};

const ScreenerPage = async () => {
  const session = await getSessionFromCookies();

  const operator = session ? {
    accountId: session.accountId,
    userTier: session.tier,
    is2faEnabled: session.is2faEnabled,
  } : null;

  return (
    <div className="min-h-screen bg-black px-1 py-1 sm:px-3 sm:py-2 font-mono text-green-400">
      {/* Terminal grid background */}
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
        {/* Terminal window container */}
        <div className="border-2 border-green-500 bg-black shadow-2xl shadow-green-500/20 h-[calc(100vh-1rem)] overflow-hidden">
          {/* Page Header */}
          <PageHeader currentPage="screener" operator={operator} />

          {/* Content area */}
          <div className="h-[calc(100%-4rem)] overflow-y-auto">
            <Screener operator={operator} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScreenerPage;