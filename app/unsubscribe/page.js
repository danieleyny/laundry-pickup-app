"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function UnsubscribeContent() {
  const params = useSearchParams();
  const status = params.get("status");
  const email = params.get("email") || "";

  if (status === "ok") {
    return (
      <div style={styles.card}>
        <div style={styles.check}>✓</div>
        <h1 style={styles.title}>You're unsubscribed</h1>
        <p style={styles.body}>
          We won't send any more pickup reminders to <strong>{email}</strong>.
        </p>
        <p style={styles.sub}>
          Changed your mind? Reply to any of our past emails or contact (646) 705-0600 to
          re-subscribe. You can also still confirm individual pickups via direct links.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={{ ...styles.check, background: "#fee2e2", color: "#991b1b" }}>!</div>
      <h1 style={styles.title}>Something went wrong</h1>
      <p style={styles.body}>
        We couldn't process your unsubscribe request. Please reply to a recent email or call
        (646) 705-0600 and we'll take care of it.
      </p>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <div style={styles.bg}>
      <Suspense fallback={<div style={styles.card}>Loading...</div>}>
        <UnsubscribeContent />
      </Suspense>
    </div>
  );
}

const styles = {
  bg: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #7CB342, #558B2F)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  card: {
    background: "#fff", borderRadius: "16px", padding: "40px 32px",
    maxWidth: "440px", width: "100%", textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  check: {
    width: "64px", height: "64px", borderRadius: "50%",
    background: "#dcfce7", color: "#166534",
    fontSize: "32px", fontWeight: 700,
    display: "flex", alignItems: "center", justifyContent: "center",
    margin: "0 auto 20px",
  },
  title: { margin: "0 0 12px", fontSize: "24px", color: "#1a1a1a" },
  body: { margin: 0, fontSize: "15px", color: "#444", lineHeight: 1.55 },
  sub: { margin: "16px 0 0", fontSize: "13px", color: "#777", lineHeight: 1.5 },
};
