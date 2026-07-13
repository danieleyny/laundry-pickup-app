"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ConfirmReattemptContent() {
  const params = useSearchParams();
  const status = params.get("status");
  const day = params.get("day");
  const name = params.get("name") || "";
  const firstName = name.split(" ")[0];

  if (status === "ok") {
    return (
      <div style={styles.card}>
        <div style={styles.check}>✓</div>
        <h1 style={styles.title}>You're all set{firstName ? `, ${firstName}` : ""}!</h1>
        <p style={styles.body}>
          We've confirmed you for pickup on <strong>{day}</strong>. Please have
          your laundry bag outside by <strong>10 AM</strong> on {day}.
        </p>
        <p style={styles.footer}>You can close this page now.</p>
      </div>
    );
  }

  if (status === "not_found") {
    return (
      <div style={styles.card}>
        <div style={{ ...styles.check, background: "#fef3c7", color: "#92400e" }}>?</div>
        <h1 style={styles.title}>We couldn't find your record</h1>
        <p style={styles.body}>
          The confirmation link may be missing your email. Please reply to the
          original email or call us at (646) 705-0600 so we can confirm your pickup.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={{ ...styles.check, background: "#fee2e2", color: "#991b1b" }}>!</div>
      <h1 style={styles.title}>Something went wrong</h1>
      <p style={styles.body}>
        We couldn't process your confirmation. Please reply to the original
        email or call (646) 705-0600.
      </p>
    </div>
  );
}

export default function ConfirmReattemptPage() {
  return (
    <div style={styles.bg}>
      <Suspense fallback={<div style={styles.card}>Loading...</div>}>
        <ConfirmReattemptContent />
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
  footer: { margin: "20px 0 0", fontSize: "13px", color: "#999" },
};
