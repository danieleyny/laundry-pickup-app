// Design tokens — single source of truth for both client and server.
// Driver app uses these as inline-style palette; admin + customer pages use
// them via Tailwind classes (see tailwind.config.js mapping).

export const PALETTE = {
  brand: "#7CB342",
  brandDeep: "#558B2F",
  brandDark: "#33691E",
  brandSoft: "#E8F5E9",

  pickup: "#2E7D32",
  pickupSoft: "#E8F5E9",
  dropoff: "#C62828",
  dropoffSoft: "#FFEBEE",

  ink: "#0F1A0A",
  inkSoft: "#3D4A33",
  muted: "#6B7569",

  surface: "#FFFFFF",
  surfaceWarm: "#FAFBF8",
  border: "#E5EAE0",

  bg: "linear-gradient(180deg, #F7F9F3 0%, #EFF2EA 100%)",

  // Dark-mode counterparts (used by Tailwind dark: classes via CSS vars)
  darkInk: "#E8F0E0",
  darkInkSoft: "#B8C5B0",
  darkMuted: "#7A8270",
  darkSurface: "#1A1F18",
  darkSurfaceWarm: "#22281F",
  darkBorder: "#2F362B",
  darkBg: "linear-gradient(180deg, #131711 0%, #0F1310 100%)",
};

// Typography
export const TYPE = {
  family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  familyMono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace",
};

// Spacing scale (multiples of 4px)
export const SPACE = {
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "32px",
};

// Radius
export const RADIUS = {
  sm: "6px",
  md: "10px",
  lg: "14px",
  xl: "18px",
  full: "9999px",
};

// Shadow
export const SHADOW = {
  card: "0 1px 3px rgba(15, 26, 10, 0.04), 0 12px 32px rgba(15, 26, 10, 0.06)",
  hover: "0 14px 36px rgba(0,0,0,0.18), 0 3px 8px rgba(0,0,0,0.12)",
  pill: "0 2px 4px rgba(0,0,0,0.2)",
};
