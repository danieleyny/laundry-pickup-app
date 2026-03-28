"use client";
import { useState, useCallback } from "react";

export default function Dashboard() {
  const [pin, setPin] = useState("bypass");
  const [authenticated, setAuthenticated] = useState(true);
  const [area, setArea] = useState("uptown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data states
  const [pickupList, setPickupList] = useState(null);
  const [remainingData, setRemainingData] = useState(null);
  const [emailLinks, setEmailLinks] = useState(null);
  const [responses, setResponses] = useState(null);
  const [copied, setCopied] = useState("");

  const areaConfig = {
    uptown: { day1: "Friday", day2: "Saturday" },
    downtown: { day1: "Tuesday", day2: "Thursday" },
  };

  const config = areaConfig[area];

  const apiFetch = useCallback(
    async (endpoint, params = {}) => {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("pin", pin);
      url.searchParams.set("area", area);
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }
      return res.json();
    },
    [pin, area]
  );

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      await apiFetch("/api/customers");
      setAuthenticated(true);
    } catch (err) {
      setError("Invalid PIN. Please try again.");
    }
    setLoading(false);
  };

  const loadPickupList = async (day) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/pickup-list", { day });
      setPickupList(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadRemainingEmails = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/remaining-emails");
      setRemainingData(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadEmailLinks = async (onlyRemaining = false) => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/generate-email-links", {
        onlyRemaining: onlyRemaining.toString(),
      });
      setEmailLinks(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const copyToClipboard = async (text, label) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const clearResponses = async () => {
    if (!confirm(`Are you sure you want to clear all ${area} pickup responses for this week? This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const url = new URL("/api/clear-responses", window.location.origin);
      url.searchParams.set("area", area);
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear");
      alert(data.message);
      // Reset displayed data
      setPickupList(null);
      setRemainingData(null);
      setEmailLinks(null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // LOGIN SCREEN
  if (!authenticated) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginCard}>
          <h1 style={styles.loginTitle}>Laundry Pickup Manager</h1>
          <p style={styles.loginSub}>Enter your admin PIN to continue</p>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Enter PIN"
            style={styles.pinInput}
          />
          <button onClick={handleLogin} disabled={loading} style={styles.loginBtn}>
            {loading ? "Checking..." : "Log In"}
          </button>
          {error && <p style={styles.error}>{error}</p>}
        </div>
      </div>
    );
  }

  // MAIN DASHBOARD
  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.headerTitle}>Laundry Pickup Manager</h1>
        <div style={styles.areaToggle}>
          <button
            onClick={() => { setArea("uptown"); setPickupList(null); setRemainingData(null); setEmailLinks(null); }}
            style={area === "uptown" ? styles.areaActive : styles.areaBtn}
          >
            Uptown (Fri/Sat)
          </button>
          <button
            onClick={() => { setArea("downtown"); setPickupList(null); setRemainingData(null); setEmailLinks(null); }}
            style={area === "downtown" ? styles.areaActive : styles.areaBtn}
          >
            Downtown (Tue/Thu)
          </button>
        </div>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}
      {loading && <div style={styles.loadingBanner}>Loading...</div>}

      {/* Action Cards */}
      <div style={styles.grid}>
        {/* CARD 1: Send Bulk Reminder */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>1. Send Pickup Reminders</h2>
          <p style={styles.cardDesc}>
            Copy all {area} customer emails for BCC, plus your reminder email with the pickup link.
          </p>
          <div style={styles.cardActions}>
            <button onClick={() => loadEmailLinks(false)} style={styles.primaryBtn}>
              Get Email &amp; BCC List
            </button>
            <button onClick={() => loadEmailLinks(true)} style={styles.secondaryBtn}>
              Remaining Customers Only
            </button>
          </div>
        </div>

        {/* CARD 2: View Pickup List */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>2. View Pickup List</h2>
          <p style={styles.cardDesc}>
            See who confirmed and generate the driver&apos;s route-sorted pickup list.
          </p>
          <div style={styles.cardActions}>
            <button onClick={() => loadPickupList(config.day1)} style={styles.primaryBtn}>
              {config.day1} Pickup List
            </button>
            <button onClick={() => loadPickupList(config.day2)} style={styles.secondaryBtn}>
              {config.day2} Pickup List
            </button>
          </div>
        </div>

        {/* CARD 3: Remaining Emails */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>3. Get Remaining Emails</h2>
          <p style={styles.cardDesc}>
            Copy emails of customers who haven&apos;t confirmed yet — ready to
            paste into Gmail BCC for a follow-up.
          </p>
          <div style={styles.cardActions}>
            <button onClick={loadRemainingEmails} style={styles.primaryBtn}>
              Get Remaining Emails
            </button>
          </div>
        </div>

        {/* CARD 4: Clear Week */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>4. Reset for New Week</h2>
          <p style={styles.cardDesc}>
            Clear all {area} pickup responses for this week so you can start fresh.
          </p>
          <div style={styles.cardActions}>
            <button onClick={clearResponses} style={styles.dangerBtn}>
              Clear This Week&apos;s Responses
            </button>
          </div>
        </div>
      </div>

      {/* RESULTS SECTIONS */}

      {/* Bulk Email Results */}
      {emailLinks && (
        <div style={styles.resultSection}>
          <h2 style={styles.resultTitle}>
            Ready to Send — {emailLinks.totalCustomers} customers
          </h2>

          {/* Step 1: Copy BCC emails */}
          <div style={styles.resultBox}>
            <h3 style={{ margin: "0 0 8px" }}>Step 1: Copy BCC Emails</h3>
            <p style={{ margin: "0 0 12px", color: "#666", fontSize: "14px" }}>
              Paste these into Gmail BCC field.
            </p>
            <button
              onClick={() => copyToClipboard(emailLinks.bccEmails, "bcc")}
              style={styles.copyBtn}
            >
              {copied === "bcc" ? "Copied!" : `Copy All ${emailLinks.totalCustomers} Email Addresses`}
            </button>
            <textarea
              readOnly
              value={emailLinks.bccEmails}
              style={{ ...styles.emailTextarea, marginTop: "12px" }}
              rows={3}
            />
          </div>

          {/* Step 2: Copy email body */}
          <div style={styles.resultBox}>
            <h3 style={{ margin: "0 0 8px" }}>Step 2: Copy Email Body</h3>
            <p style={{ margin: "0 0 12px", color: "#666", fontSize: "14px" }}>
              Paste this as your email message. It includes the pickup confirmation link.
            </p>
            <button
              onClick={() => copyToClipboard(
                `Hello!\n\nWe are reaching out to remind you that the laundry collection service will be stopping by your area on ${emailLinks.config.day1} & ${emailLinks.config.day2}. Please make sure to leave your laundry outside before 10 AM to ensure that it is collected.\n\nTo confirm your pickup day, please click the link below and select your name and preferred day:\n\n${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/pickup?area=${area}\n\nIf you would prefer not to receive the weekly reminders, please respond letting us know.`,
                "body"
              )}
              style={styles.copyBtn}
            >
              {copied === "body" ? "Copied!" : "Copy Email Body"}
            </button>
            <textarea
              readOnly
              value={`Hello!\n\nWe are reaching out to remind you that the laundry collection service will be stopping by your area on ${emailLinks.config.day1} & ${emailLinks.config.day2}. Please make sure to leave your laundry outside before 10 AM to ensure that it is collected.\n\nTo confirm your pickup day, please click the link below and select your name and preferred day:\n\n${window.location.origin}/pickup?area=${area}\n\nIf you would prefer not to receive the weekly reminders, please respond letting us know.`}
              style={{ ...styles.emailTextarea, marginTop: "12px" }}
              rows={8}
            />
          </div>
        </div>
      )}

      {/* Pickup List Results */}
      {pickupList && (
        <div style={styles.resultSection}>
          <h2 style={styles.resultTitle}>
            {pickupList.day} Pickup List — {pickupList.totalConfirmed} pickups
          </h2>
          {pickupList.pickupList.length === 0 ? (
            <p style={{ color: "#666" }}>No confirmations yet for {pickupList.day}.</p>
          ) : (
            <>
              <button
                onClick={() => {
                  // Generate printable pickup list
                  const rows = pickupList.pickupList
                    .map(
                      (p) =>
                        `<tr><td style="border:1px solid #ddd;padding:8px">${p.address}</td><td style="border:1px solid #ddd;padding:8px">${p.unit}</td><td style="border:1px solid #ddd;padding:8px">${p.entryMethod}</td><td style="border:1px solid #ddd;padding:8px">${p.name}</td></tr>`
                    )
                    .join("");
                  const html = `<html><head><title>${pickupList.day} Pickup List</title></head><body style="font-family:Arial,sans-serif"><h1>${pickupList.day} Pickup List — ${pickupList.area}</h1><p>${new Date().toLocaleDateString()}</p><table style="border-collapse:collapse;width:100%"><tr style="background:#f0f0f0"><th style="border:1px solid #ddd;padding:8px;text-align:left">Address</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Unit</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Entry Method</th><th style="border:1px solid #ddd;padding:8px;text-align:left">Customer</th></tr>${rows}</table></body></html>`;
                  const w = window.open();
                  w.document.write(html);
                  w.document.close();
                  w.print();
                }}
                style={styles.primaryBtn}
              >
                Print / Save as PDF
              </button>

              <div style={{ ...styles.table, marginTop: "16px" }}>
                <div style={{ ...styles.tableRow, fontWeight: "bold", background: "#f0f0f0" }}>
                  <div style={{ flex: 2 }}>Address</div>
                  <div style={{ flex: 1 }}>Unit</div>
                  <div style={{ flex: 2 }}>Entry Method</div>
                  <div style={{ flex: 2 }}>Customer</div>
                </div>
                {pickupList.pickupList.map((p, i) => (
                  <div key={i} style={styles.tableRow}>
                    <div style={{ flex: 2 }}>{p.address}</div>
                    <div style={{ flex: 1 }}>{p.unit}</div>
                    <div style={{ flex: 2, fontSize: "13px" }}>{p.entryMethod}</div>
                    <div style={{ flex: 2 }}>{p.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Remaining Emails Results */}
      {remainingData && (
        <div style={styles.resultSection}>
          <h2 style={styles.resultTitle}>
            Remaining Customers — {remainingData.totalRemaining} of{" "}
            {remainingData.totalCustomers}
          </h2>
          <p style={{ color: "#666", margin: "0 0 16px" }}>
            {remainingData.totalConfirmed} customer(s) already confirmed this week.
            {remainingData.totalRemaining} still haven&apos;t replied.
          </p>
          <div style={styles.resultBox}>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <button
                onClick={() =>
                  copyToClipboard(remainingData.emailString, "remaining")
                }
                style={styles.primaryBtn}
              >
                {copied === "remaining" ? "Copied!" : "Copy All Remaining Emails"}
              </button>
            </div>
            <textarea
              readOnly
              value={remainingData.emailString}
              style={styles.emailTextarea}
              rows={4}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  // Login
  loginContainer: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  loginCard: {
    background: "white",
    borderRadius: "16px",
    padding: "48px 40px",
    maxWidth: "380px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  loginTitle: { margin: "0 0 8px", fontSize: "22px" },
  loginSub: { margin: "0 0 24px", color: "#666", fontSize: "14px" },
  pinInput: {
    width: "100%",
    padding: "12px 16px",
    fontSize: "18px",
    border: "2px solid #ddd",
    borderRadius: "8px",
    textAlign: "center",
    letterSpacing: "4px",
    marginBottom: "16px",
    boxSizing: "border-box",
  },
  loginBtn: {
    width: "100%",
    padding: "12px",
    fontSize: "16px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600",
  },
  error: { color: "#dc3545", marginTop: "12px", fontSize: "14px" },

  // Dashboard
  page: { maxWidth: "1100px", margin: "0 auto", padding: "20px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
    marginBottom: "24px",
    paddingBottom: "16px",
    borderBottom: "2px solid #eee",
  },
  headerTitle: { margin: 0, fontSize: "22px" },
  areaToggle: { display: "flex", gap: "8px" },
  areaBtn: {
    padding: "8px 20px",
    border: "2px solid #ddd",
    borderRadius: "8px",
    background: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
  },
  areaActive: {
    padding: "8px 20px",
    border: "2px solid #667eea",
    borderRadius: "8px",
    background: "#667eea",
    color: "white",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },

  // Cards
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px", marginBottom: "32px" },
  card: {
    background: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "12px",
    padding: "24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  cardTitle: { margin: "0 0 8px", fontSize: "16px" },
  cardDesc: { margin: "0 0 16px", color: "#666", fontSize: "14px", lineHeight: "1.5" },
  cardActions: { display: "flex", flexDirection: "column", gap: "8px" },

  // Buttons
  dangerBtn: {
    padding: "10px 20px",
    background: "#dc3545",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },
  primaryBtn: {
    padding: "10px 20px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },
  secondaryBtn: {
    padding: "10px 20px",
    background: "white",
    color: "#667eea",
    border: "2px solid #667eea",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },
  copyBtn: {
    padding: "10px 20px",
    background: "#28a745",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "600",
  },
  smallBtn: {
    padding: "4px 10px",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },

  // Results
  resultSection: {
    background: "white",
    border: "1px solid #e0e0e0",
    borderRadius: "12px",
    padding: "24px",
    marginBottom: "24px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  resultTitle: { margin: "0 0 12px", fontSize: "18px" },
  resultNote: { margin: "0 0 16px", color: "#666", fontSize: "14px" },
  resultBox: {
    background: "#f8f9fa",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  },

  // Tables
  table: { border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden" },
  tableRow: {
    display: "flex",
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
    alignItems: "center",
    fontSize: "14px",
    gap: "8px",
  },

  // Misc
  emailTextarea: {
    width: "100%",
    padding: "12px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontFamily: "monospace",
    fontSize: "12px",
    resize: "vertical",
    boxSizing: "border-box",
  },
  errorBanner: {
    background: "#f8d7da",
    color: "#721c24",
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
  },
  loadingBanner: {
    background: "#cce5ff",
    color: "#004085",
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "16px",
    fontSize: "14px",
  },
};
