/** @type {import('tailwindcss').Config} */
const { PALETTE } = require("./lib/theme.js");

module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: PALETTE.brand,
          deep: PALETTE.brandDeep,
          dark: PALETTE.brandDark,
          soft: PALETTE.brandSoft,
        },
        pickup: {
          DEFAULT: PALETTE.pickup,
          soft: PALETTE.pickupSoft,
        },
        dropoff: {
          DEFAULT: PALETTE.dropoff,
          soft: PALETTE.dropoffSoft,
        },
        ink: {
          DEFAULT: PALETTE.ink,
          soft: PALETTE.inkSoft,
        },
        muted: PALETTE.muted,
        surface: {
          DEFAULT: PALETTE.surface,
          warm: PALETTE.surfaceWarm,
        },
        "ldn-border": PALETTE.border,
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15, 26, 10, 0.04), 0 12px 32px rgba(15, 26, 10, 0.06)",
        hover: "0 14px 36px rgba(0,0,0,0.18), 0 3px 8px rgba(0,0,0,0.12)",
        pill: "0 2px 4px rgba(0,0,0,0.2)",
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
    },
  },
  plugins: [],
};
