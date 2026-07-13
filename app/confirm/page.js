"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

// Match the approved email design language exactly.
const C = {
  page: "#EEF0F4",
  card: "#FFFFFF",
  cardBorder: "#E7E8EE",
  accent: "#4F46E5",
  h1: "#15181E",
  muted: "#6B7280",
  primaryFill: "#4F46E5",
  primaryText: "#FFFFFF",
  reassurance: "#9AA1AC",
  calloutBg: "#EEF0FF",
  calloutText: "#312E81",
  footerTeam: "#4F46E5",
  footerContact: "#8A8F99",
  footerFine: "#AEB2BA",
};
const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif`;
const TERMS_URL = "https://laundryday.nyc/assets/partnerassets/documents/Terms%20Of%20Service.pdf";

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.page, fontFamily: FONT, padding: "36px 16px 24px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <div style={{ backgroundColor: C.card, border: `0.5px solid ${C.cardBorder}`, borderRadius: 18, padding: "36px 28px", textAlign: "center" }}>
          {children}
        </div>
        <Footer />
      </div>
    </div>
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

function Eyebrow({ children }) {
  return (
    <p style={{ margin: "0 0 18px", fontSize: 11, fontWeight: 500, letterSpacing: "1.6px", color: C.accent, lineHeight: 1, textTransform: "uppercase" }}>
      {children}
    </p>
  );
}

function H1({ children }) {
  return (
    <h1 style={{ margin: "0 0 9px", fontSize: 25, fontWeight: 700, color: C.h1, lineHeight: 1.2, letterSpacing: "-0.2px" }}>
      {children}
    </h1>
  );
}

function Sub({ children }) {
  return (
    <p style={{ margin: "0 0 22px", fontSize: 15, fontWeight: 400, color: C.muted, lineHeight: 1.55 }}>
      {children}
    </p>
  );
}

function Callout({ children }) {
  return (
    <div style={{ backgroundColor: C.calloutBg, borderRadius: 12, padding: "13px 15px", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
      <ClockGlyph color={C.accent} />
      <span style={{ fontSize: 13, color: C.calloutText, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function ClockGlyph({ color }) {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" style={{ flexShrink: 0 }}>
      <circle cx="9.5" cy="9.5" r="7.4" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M9.5 5.4v4.4l3.1 2.1" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckBadge() {
  return (
    <div style={{ margin: "0 auto 14px", width: 60, height: 60, borderRadius: 30, backgroundColor: C.calloutBg, display: "flex", alignItems: "center", justifyContent: "center", color: C.accent, fontSize: 28, fontWeight: 700 }}>
      ✓
    </div>
  );
}

function PrimaryDayCard({ href, label }) {
  return (
    <a
      href={href}
      style={{ display: "block", backgroundColor: C.primaryFill, borderRadius: 13, padding: "15px 17px", textDecoration: "none", color: C.primaryText, margin: "0 0 18px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ flex: 1, textAlign: "left" }}>
          <span style={{ display: "block", fontSize: 17, fontWeight: 500, lineHeight: 1.15 }}>{label}</span>
          <span style={{ display: "block", fontSize: 12, color: "#C7C9FF", marginTop: 3, lineHeight: 1.4 }}>Tap to confirm</span>
        </span>
        <span style={{ fontSize: 20, lineHeight: 1 }}>→</span>
      </div>
    </a>
  );
}

function ConfirmContent() {
  const params = useSearchParams();
  const status = params.get("status");
  const day = params.get("day");
  const name = params.get("name") || "";
  const email = params.get("email") || "";
  const area = params.get("area") || "downtown";
  const existingDay = params.get("existingDay") || "";
  const newDay = params.get("newDay") || "";
  const previousDay = params.get("previousDay") || "";
  const firstName = name.split(" ")[0];

  if (status === "confirmed") {
    return (
      <Shell>
        <CheckBadge />
        <H1>{firstName ? `Thanks, ${firstName}` : "You're confirmed"}</H1>
        <Sub>Your pickup is on for <strong style={{ color: C.h1, fontWeight: 500 }}>{day}</strong>. We'll handle the rest.</Sub>
        <Callout>
          Please have your bag outside by <strong style={{ fontWeight: 500, color: C.calloutText }}>10&nbsp;AM</strong> on {day}.
        </Callout>
      </Shell>
    );
  }

  if (status === "changed") {
    return (
      <Shell>
        <CheckBadge />
        <H1>{firstName ? `Updated, ${firstName}` : "Pickup day updated"}</H1>
        <Sub>
          Your pickup is now on <strong style={{ color: C.h1, fontWeight: 500 }}>{day}</strong>
          {previousDay ? <> (moved from {previousDay})</> : null}.
        </Sub>
        <Callout>
          Bags outside by <strong style={{ fontWeight: 500, color: C.calloutText }}>10&nbsp;AM</strong> on {day}.
        </Callout>
      </Shell>
    );
  }

  if (status === "change_prompt") {
    const changeLink = `/api/confirm?email=${encodeURIComponent(email)}&day=${encodeURIComponent(newDay)}&area=${encodeURIComponent(area)}&change=true`;
    return (
      <Shell>
        <Eyebrow>Already confirmed</Eyebrow>
        <H1>You&apos;re set for {existingDay}</H1>
        <Sub>Want to switch to <strong style={{ color: C.h1, fontWeight: 500 }}>{newDay}</strong> instead?</Sub>
        <PrimaryDayCard href={changeLink} label={`Yes, switch to ${newDay}`} />
        <p style={{ margin: 0, fontSize: 12, color: C.reassurance, lineHeight: 1.5 }}>
          Or keep your {existingDay} pickup — just close this page.
        </p>
      </Shell>
    );
  }

  if (status === "already_confirmed") {
    return (
      <Shell>
        <CheckBadge />
        <H1>You&apos;re set for {day}</H1>
        <Sub>No further action needed.</Sub>
      </Shell>
    );
  }

  if (status === "not_found") {
    const subject = encodeURIComponent("Pick Up Confirmation Error");
    const body = encodeURIComponent("I tried requesting a pick up but received an error.");
    const mailto = `mailto:laundrydaynyc@gmail.com?subject=${subject}&body=${body}`;
    return (
      <Shell>
        <Eyebrow>Email not recognized</Eyebrow>
        <H1>We don&apos;t see that email</H1>
        <Sub>
          We couldn&apos;t find <strong style={{ color: C.h1, fontWeight: 500 }}>{email}</strong> in our customer list. It may be a typo, or you may be registered under a different address.
        </Sub>
        <PrimaryDayCard href={`/pickup?area=${area}`} label="Try again" />
        <p style={{ margin: 0, fontSize: 12, color: C.reassurance }}>
          Or <a href={mailto} style={{ color: C.accent, textDecoration: "underline" }}>email us</a> and we'll sort it out.
        </p>
      </Shell>
    );
  }

  const mailto = `mailto:laundrydaynyc@gmail.com?subject=${encodeURIComponent("Pick Up Confirmation Error")}&body=${encodeURIComponent("I tried requesting a pick up but received an error.")}`;
  return (
    <Shell>
      <Eyebrow>Something went wrong</Eyebrow>
      <H1>We couldn&apos;t process that</H1>
      <Sub>Please reply to the email you received or contact us directly.</Sub>
      <PrimaryDayCard href={mailto} label="Email us" />
    </Shell>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", backgroundColor: C.page, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
          <p style={{ color: C.muted }}>Loading…</p>
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
