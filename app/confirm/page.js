"use client";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmContent() {
  const params = useSearchParams();
  const status = params.get("status");
  const day = params.get("day");
  const name = params.get("name") || "";
  const email = params.get("email") || "";

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

  if (status === "not_found") {
    const subject = encodeURIComponent("Pick Up Confirmation Error");
    const body = encodeURIComponent(
      "I tried requesting a pick up but received an error when i put my email in"
    );
    const mailtoLink = `mailto:laundrydaynyc@gmail.com?subject=${subject}&body=${body}`;

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ ...styles.checkmark, background: "#F8D7DA", color: "#721C24" }}>?</div>
          <h1 style={styles.title}>Email not found</h1>
          <p style={styles.message}>
            We couldn&apos;t find <strong>{email}</strong> in our customer list.
            This could be a typo or you may be registered under a different email.
          </p>
          <p style={styles.sub}>
            Please contact us so we can get this sorted out:
          </p>
          <a href={mailtoLink} style={styles.contactBtn}>
            Email Laundry Day NYC
          </a>
          <div style={styles.footer}>laundrydaynyc@gmail.com</div>
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
        <a
          href={`mailto:laundrydaynyc@gmail.com?subject=${encodeURIComponent("Pick Up Confirmation Error")}&body=${encodeURIComponent("I tried requesting a pick up but received an error when i put my email in")}`}
          style={styles.contactBtn}
        >
          Email Laundry Day NYC
        </a>
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
  contactBtn: {
    display: "inline-block",
    marginTop: "20px",
    padding: "12px 28px",
    background: "#667eea",
    color: "white",
    textDecoration: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "600",
  },
  footer: {
    marginTop: "16px",
    fontSize: "13px",
    color: "#999",
  },
};
