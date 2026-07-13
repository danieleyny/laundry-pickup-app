"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const C = {
  page: "#EEF0F4",
  card: "#FFFFFF",
  cardBorder: "#E7E8EE",
  accent: "#4F46E5",
  h1: "#15181E",
  muted: "#6B7280",
  primaryFill: "#4F46E5",
  primaryText: "#FFFFFF",
  secondaryFill: "#FFFFFF",
  secondaryBorder: "#4F46E5",
  secondaryDay: "#3730A3",
  fieldBg: "#FAFAFC",
  reassurance: "#9AA1AC",
  footerContact: "#8A8F99",
  footerTeam: "#4F46E5",
};
const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`;
const TERMS_URL = "https://laundryday.nyc/assets/partnerassets/documents/Terms%20Of%20Service.pdf";

function CalendarIcon({ color, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}>
      <rect x="3" y="5" width="16" height="14" rx="2.4" fill="none" stroke={color} strokeWidth="1.7" />
      <line x1="3" y1="9.5" x2="19" y2="9.5" stroke={color} strokeWidth="1.7" />
      <line x1="7.5" y1="2.8" x2="7.5" y2="6.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <line x1="14.5" y1="2.8" x2="14.5" y2="6.5" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PrimaryCard({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", margin: "0 0 11px",
        background: C.primaryFill, color: C.primaryText,
        borderRadius: 13, padding: "15px 17px",
        border: "none", cursor: disabled ? "wait" : "pointer",
        fontFamily: FONT, textAlign: "left",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <CalendarIcon color="#C7C9FF" />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.15 }}>{label}</span>
          <span style={{ display: "block", fontSize: 12, color: "#C7C9FF", marginTop: 3, lineHeight: 1.4 }}>Tap to confirm</span>
        </span>
        <span style={{ fontSize: 20, lineHeight: 1, color: C.primaryText }}>→</span>
      </div>
    </button>
  );
}

function SecondaryCard({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block", width: "100%", margin: 0,
        background: C.secondaryFill, color: C.secondaryDay,
        borderRadius: 13, padding: "13.5px 15.5px",
        border: `1.5px solid ${C.secondaryBorder}`,
        cursor: disabled ? "wait" : "pointer",
        fontFamily: FONT, textAlign: "left",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <CalendarIcon color={C.accent} />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.15, color: C.secondaryDay }}>{label}</span>
          <span style={{ display: "block", fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>Tap to confirm</span>
        </span>
        <span style={{ fontSize: 20, lineHeight: 1, color: C.accent }}>→</span>
      </div>
    </button>
  );
}

function Footer() {
  return (
    <div style={{ padding: "20px 18px 8px", textAlign: "center" }}>
      <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 500, color: C.footerTeam, lineHeight: 1 }}>The Laundry Day Team</p>
      <p style={{ margin: 0, fontSize: 12, color: C.footerContact, lineHeight: 1.7 }}>
        <a href="tel:+16467050600" style={{ color: C.footerContact, textDecoration: "none" }}>(646)&nbsp;705-0600</a>
        {" · "}
        <a href="mailto:laundrydaynyc@gmail.com" style={{ color: C.footerContact, textDecoration: "underline" }}>laundrydaynyc@gmail.com</a>
        <br />
        <a href="https://laundryday.nyc" style={{ color: C.footerContact, textDecoration: "underline" }}>laundryday.nyc</a>
        {" · "}
        <a href={TERMS_URL} style={{ color: C.footerContact, textDecoration: "underline" }}>Terms of Service</a>
      </p>
    </div>
  );
}

function PickupForm() {
  const params = useSearchParams();
  const area = params.get("area") || "uptown";
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const areaConfig = {
    uptown: { day1: "Friday", day2: "Saturday" },
    downtown: { day1: "Tuesday", day2: "Thursday" },
  };
  const config = areaConfig[area] || areaConfig.uptown;
  const dayParam = params.get("day");
  const showDay1 = !dayParam || dayParam.toLowerCase() === config.day1.toLowerCase();
  const showDay2 = !dayParam || dayParam.toLowerCase() === config.day2.toLowerCase();
  const singleDay = dayParam && (showDay1 !== showDay2);

  const handleConfirm = (day) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter your email address.");
      return;
    }
    setSubmitting(true);
    setError("");
    window.location.href = `/api/confirm?email=${encodeURIComponent(trimmed)}&day=${day}&area=${area}`;
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.page, fontFamily: FONT, padding: "36px 16px 24px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ backgroundColor: C.card, border: `0.5px solid ${C.cardBorder}`, borderRadius: 18, padding: "32px 28px" }}>
          <p style={{ margin: "0 0 18px", textAlign: "center", fontSize: 11, fontWeight: 500, letterSpacing: "1.6px", color: C.accent, lineHeight: 1, textTransform: "uppercase" }}>
            {singleDay ? "Confirm pickup" : "Weekly pickup"}
          </p>
          <h1 style={{ margin: "0 0 9px", textAlign: "center", fontSize: 25, fontWeight: 700, color: C.h1, lineHeight: 1.2, letterSpacing: "-0.2px" }}>
            Confirm your pickup
          </h1>
          <p style={{ margin: "0 0 22px", textAlign: "center", fontSize: 15, color: C.muted, lineHeight: 1.55 }}>
            {singleDay
              ? <>Confirm pickup for <strong style={{ color: C.h1, fontWeight: 500 }}>{showDay1 ? config.day1 : config.day2}</strong>.</>
              : <>Enter your email, then tap the day that works.</>
            }
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 500, letterSpacing: "1.2px", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>
              Your email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="you@email.com"
              style={{
                width: "100%", padding: "13px 15px", fontSize: 15,
                fontFamily: FONT, color: C.h1,
                background: C.fieldBg,
                border: `1.5px solid ${C.cardBorder}`,
                borderRadius: 12, outline: "none", boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = C.accent)}
              onBlur={(e) => (e.target.style.borderColor = C.cardBorder)}
            />
          </div>

          {error && (
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#B91C1C" }}>{error}</p>
          )}

          {singleDay ? (
            <PrimaryCard
              label={showDay1 ? config.day1 : config.day2}
              onClick={() => handleConfirm(showDay1 ? config.day1 : config.day2)}
              disabled={submitting}
            />
          ) : (
            <>
              <PrimaryCard label={config.day1} onClick={() => handleConfirm(config.day1)} disabled={submitting} />
              <SecondaryCard label={config.day2} onClick={() => handleConfirm(config.day2)} disabled={submitting} />
            </>
          )}

          <p style={{ margin: "20px 0 0", textAlign: "center", fontSize: 12, color: C.reassurance, lineHeight: 1.5 }}>
            Bag outside by <strong style={{ color: C.muted, fontWeight: 500 }}>10 AM</strong> on your pickup day.
          </p>
        </div>
        <Footer />
      </div>
    </div>
  );
}

export default function PickupPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", backgroundColor: C.page, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
          <p style={{ color: C.muted }}>Loading…</p>
        </div>
      }
    >
      <PickupForm />
    </Suspense>
  );
}
