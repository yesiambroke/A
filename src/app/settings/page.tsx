import { redirect } from "next/navigation";
import SettingsPanel from "@/components/settings/SettingsPanel";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "A-TRADE://settings",
};
import { getSessionFromCookies } from "@/lib/auth/session";

const SettingsPage = async () => {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-black px-2 py-2 sm:px-4 sm:py-4 font-mono text-green-400">
      <div className="fixed inset-0 pointer-events-none opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,0,0.1) 2px, rgba(0,255,0,0.1) 4px)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <div className="border-2 border-green-500 bg-black shadow-2xl shadow-green-500/20">
          <SettingsPanel user={session} />
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
