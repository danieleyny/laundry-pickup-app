"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

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
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Laundry Pickup</h1>
        <p style={styles.subtitle}>Confirm your pickup day</p>

        <div style={styles.field}>
          <label style={styles.label}>Your email address:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@email.com"
            style={styles.input}
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <p style={styles.prompt}>Which day works for you?</p>

        <div style={styles.buttons}>
          <button
            onClick={() => handleConfirm(config.day1)}
            disabled={submitting}
            style={styles.dayBtn1}
          >
            {submitting ? "..." : config.day1}
          </button>
          <button
            onClick={() => handleConfirm(config.day2)}
            disabled={submitting}
            style={styles.dayBtn2}
          >
            {submitting ? "..." : config.day2}
          </button>
        </div>

        <p style={styles.note}>
          If you don&apos;t need a pickup this week, no action needed.
        </p>
      </div>
    </div>
  );
}

export default function PickupPage() {
  return (
    <Suspense
      fallback={
        <div style={styles.container}>
          <div style={styles.card}>
            <p style={{ fontSize: "16px", color: "#444" }}>Loading...</p>
          </div>
        </div>
      }
    >
      <PickupForm />
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
    padding: "40px 36px",
    maxWidth: "420px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  title: {
    margin: "0 0 4px",
    fontSize: "26px",
    color: "#1a1a1a",
  },
  subtitle: {
    margin: "0 0 28px",
    fontSize: "15px",
    color: "#888",
  },
  field: {
    textAlign: "left",
    marginBottom: "24px",
  },
  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "#333",
    marginBottom: "8px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "16px",
    border: "2px solid #ddd",
    borderRadius: "8px",
    boxSizing: "border-box",
  },
  prompt: {
    margin: "0 0 16px",
    fontSize: "16px",
    fontWeight: "600",
    color: "#333",
  },
  buttons: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
  },
  dayBtn1: {
    flex: 1,
    padding: "16px",
    fontSize: "18px",
    fontWeight: "700",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
  dayBtn2: {
    flex: 1,
    padding: "16px",
    fontSize: "18px",
    fontWeight: "700",
    background: "#764ba2",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
  note: {
    margin: 0,
    fontSize: "13px",
    color: "#999",
  },
  error: {
    color: "#dc3545",
    fontSize: "14px",
    margin: "0 0 16px",
  },
};
