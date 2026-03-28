"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmContent() {
  const params = useSearchParams();
  const status = params.get("status");
  const day = params.get("day");
  const name = params.get("name") || "";

  const firstName = name.split(" ")[0];

  if (status === "confirmed") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.checkmark}>&#10003;</div>
          <h1 style={styles.title}>You&apos;re all set{firstName ? `, ${firstName}` : ""}!</h1>
          <p style={styles.message}>
            Your laundry pickup is confirmed for <strong>{day}</strong>.
          </p>
          <p style={styles.sub}>
            Please have your laundry bag(s) ready by the door. Our driver will
            pick them up during the scheduled route.
          </p>
          <div style={styles.footer}>You can close this page now.</div>
        </div>
      </div>
    );
  }

  if (status === "already_confirmed") {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.checkmark, background: "#FFF3CD", color: "#856404" }}>!</div>
          <h1 style={styles.title}>Already confirmed!</h1>
          <p style={styles.message}>
            You&apos;ve already confirmed a pickup for this week. No need to do anything else.
          </p>
          <div style={styles.footer}>You can close this page now.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ ...styles.checkmark, background: "#F8D7DA", color: "#721C24" }}>&#10007;</div>
        <h1 style={styles.title}>Something went wrong</h1>
        <p style={styles.message}>
          We couldn&apos;t process your confirmation. Please reply to the email
          or contact us directly.
        </p>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={styles.message}>Loading...</p>
          </div>
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "48px 40px",
    maxWidth: "440px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  checkmark: {
    width: "64px",
    height: "64px",
    borderRadius: "50%",
    background: "#D4EDDA",
    color: "#155724",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "32px",
    fontWeight: "bold",
    margin: "0 auto 24px",
  },
  title: {
    margin: "0 0 12px",
    fontSize: "24px",
    color: "#1a1a1a",
  },
  message: {
    margin: "0 0 8px",
    fontSize: "16px",
    color: "#444",
    lineHeight: "1.5",
  },
  sub: {
    margin: "16px 0 0",
    fontSize: "14px",
    color: "#777",
    lineHeight: "1.5",
  },
  footer: {
    marginTop: "24px",
    fontSize: "13px",
    color: "#999",
  },
};
