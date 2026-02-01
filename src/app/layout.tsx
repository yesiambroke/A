import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A-TRADE://a-trade.fun",
  description: "Professional Solana trading platform with advanced analytics and real-time market data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-mono">
        {children}
      </body>
    </html>
  );
}

