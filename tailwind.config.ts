import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          neon: "#22c55e",
          neonSoft: "#4ade80",
          neonMuted: "#166534",
        },
        terminal: {
          bg: "#020202",
          panel: "#030712",
          grid: "#0f172a",
        },
      },
      fontFamily: {
        terminal: ["Space Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      backgroundImage: {
        scanlines:
          "repeating-linear-gradient(0deg, rgba(34,197,94,0.05) 0px, rgba(34,197,94,0.05) 1px, transparent 1px, transparent 3px)",
        "grid-glow":
          "radial-gradient(circle at 20% 20%, rgba(34,197,94,0.2), transparent 40%), radial-gradient(circle at 80% 0%, rgba(34,197,94,0.15), transparent 35%)",
      },
      boxShadow: {
        panel: "0 0 25px rgba(34,197,94,0.25)",
        glow: "0 0 15px rgba(74,222,128,0.4)",
      },
      animation: {
        "pulse-glow": "pulseGlow 2.5s ease-in-out infinite",
        "scroll-indicator": "scrollIndicator 1.4s ease-in-out infinite",
        "card-spin": "cardSpin 4s linear infinite",
        "card-flip": "cardFlip 2s ease-in-out infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: "0.35", filter: "drop-shadow(0 0 6px rgba(34,197,94,0.6))" },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 12px rgba(74,222,128,0.9))" },
        },
        scrollIndicator: {
          "0%": { transform: "translateY(0)", opacity: "0.2" },
          "50%": { transform: "translateY(6px)", opacity: "1" },
          "100%": { transform: "translateY(12px)", opacity: "0" },
        },
        cardSpin: {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(360deg)" },
        },
        cardFlip: {
          "0%, 100%": { transform: "rotateY(0deg)" },
          "50%": { transform: "rotateY(180deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
