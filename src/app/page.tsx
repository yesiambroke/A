import LandingPage from "@/components/landing/LandingPage";
import { getSessionFromCookies } from "@/lib/auth/session";
import { redirect } from "next/navigation";

const Home = async () => {
  const session = await getSessionFromCookies();

  if (session) {
    redirect("/screener");
  }

  return <LandingPage />;
};

export default Home;