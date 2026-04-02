"use client";
import { useState, useCallback } from "react";

export default function Dashboard() {
  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [area, setArea] = useState("uptown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data states
  const [pickupList, setPickupList] = useState(null);
  const [remainingData, setRemainingData] = useState(null);
  const [emailLinks, setEmailLinks] = useState(null);
  const [responses, setResponses] = useState(null);
  const [day2Confirmations, setDay2Confirmations] = useState(null);
  const [copied, setCopied] = useState("");
  const [emailType, setEmailType] = useState("full"); // "full" or "remaining"

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
      setEmailType(onlyRemaining ? "remaining" : "full");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const loadDay2Confirmations = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch("/api/day2-confirmations");
      setDay2Confirmations(data);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const BASE_URL = "https://pickup.laundryday.nyc";

  const getEmailSubject = () => {
    if (emailType === "remaining") {
      return "Reminder: Laundry Collection - (Today)";
    }
    if (area === "uptown") return "Reminder: Laundry Collection - (Fri & Sat)";
    return "Reminder: Laundry Collection - (Tues & Thurs)";
  };

  const getEmailBody = () => {
    if (emailType === "remaining") {
      const todayDay = config.day2;
      return `Hello!\n\nWe are reaching out to remind you that the laundry collection service will be stopping by your area Today, ${todayDay}. Please make sure to leave your laundry outside before 10 AM to ensure that it is collected.\n\nTo confirm your pickup, please click the link below and type in your email:\n\n${BASE_URL}/pickup?area=${area}&day=${todayDay}\n\nIf you would prefer not to receive the weekly reminders, please respond letting us know.`;
    }
    return `Hello!\n\nWe are reaching out to remind you that the laundry collection service will be stopping by your area on ${config.day1} & ${config.day2}. Please make sure to leave your laundry outside before 10 AM to ensure that it is collected.\n\nTo confirm your pickup, please click the link below and type in your email:\n\n${BASE_URL}/pickup?area=${area}\n\nIf you would prefer not to receive the weekly reminders, please respond letting us know.`;
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
      url.searchParams.set("pin", pin);
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear");
      alert(data.message);
      setPickupList(null);
      setRemainingData(null);
      setEmailLinks(null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Card icon components
  const icons = {
    email: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
    truck: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>,
    chart: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>,
    refresh: <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>,
  };

  // LOGIN SCREEN
  if (!authenticated) {
    return (
      <div style={s.loginBg}>
        <div style={s.loginCard}>
          <div style={s.loginIcon}>
            <svg width="32" height="32" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={s.loginTitle}>Laundry Day NYC</h1>
          <p style={s.loginSub}>Enter your PIN to access the dashboard</p>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="****"
            style={s.pinInput}
            autoFocus
          />
          <button onClick={handleLogin} disabled={loading} style={s.loginBtn}>
            {loading ? "Verifying..." : "Unlock Dashboard"}
          </button>
          {error && <p style={s.loginError}>{error}</p>}
        </div>
      </div>
    );
  }

  // MAIN DASHBOARD
  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.logoMark}>LD</div>
          <div>
            <h1 style={s.headerTitle}>Laundry Day NYC</h1>
            <p style={s.headerSub}>Pickup Management Dashboard</p>
          </div>
        </div>
        <div style={s.areaToggle}>
          <button
            onClick={() => { setArea("uptown"); setPickupList(null); setRemainingData(null); setEmailLinks(null); setDay2Confirmations(null); }}
            style={area === "uptown" ? s.areaActive : s.areaBtn}
          >
            Uptown
            <span style={s.areaDays}>{area === "uptown" ? "Fri / Sat" : "Fri / Sat"}</span>
          </button>
          <button
            onClick={() => { setArea("downtown"); setPickupList(null); setRemainingData(null); setEmailLinks(null); setDay2Confirmations(null); }}
            style={area === "downtown" ? s.areaActive : s.areaBtn}
          >
            Downtown
            <span style={s.areaDays}>{area === "downtown" ? "Tue / Thu" : "Tue / Thu"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div style={s.errorBanner}>
          <span style={{ marginRight: "8px" }}>&#9888;</span> {error}
          <button onClick={() => setError("")} style={s.dismissBtn}>&#10005;</button>
        </div>
      )}
      {loading && (
        <div style={s.loadingBanner}>
          <span style={s.spinner} /> Loading...
        </div>
      )}

      {/* Action Cards */}
      <div style={s.grid}>
        {[
          {
            icon: icons.email,
            num: "1",
            title: "Send Pickup Reminders",
            desc: `Copy all ${area} customer emails for BCC, plus your reminder email with the pickup link.`,
            color: "#667eea",
            actions: (
              <>
                <button onClick={() => loadEmailLinks(false)} style={{ ...s.cardBtn, background: "#667eea" }}>
                  Get Email &amp; BCC List
                </button>
                <button onClick={() => loadEmailLinks(true)} style={s.cardBtnOutline}>
                  Remaining Customers Only
                </button>
                <button onClick={loadDay2Confirmations} style={{ ...s.cardBtnOutline, color: "#11998e", borderColor: "#11998e" }}>
                  {config.day2} Confirmations
                </button>
              </>
            ),
          },
          {
            icon: icons.truck,
            num: "2",
            title: "View Pickup List",
            desc: "See who confirmed and generate the driver's route-sorted pickup list.",
            color: "#11998e",
            actions: (
              <>
                <button onClick={() => loadPickupList(config.day1)} style={{ ...s.cardBtn, background: "#11998e" }}>
                  {config.day1} Pickup List
                </button>
                <button onClick={() => loadPickupList(config.day2)} style={{ ...s.cardBtnOutline, color: "#11998e", borderColor: "#11998e" }}>
                  {config.day2} Pickup List
                </button>
              </>
            ),
          },
          {
            icon: icons.chart,
            num: "3",
            title: "Weekly Status",
            desc: "See how many customers confirmed vs. still need to reply this week.",
            color: "#f7971e",
            actions: (
              <button onClick={loadRemainingEmails} style={{ ...s.cardBtn, background: "linear-gradient(135deg, #f7971e, #ffd200)" }}>
                Check Status
              </button>
            ),
          },
          {
            icon: icons.refresh,
            num: "4",
            title: "Reset for New Week",
            desc: `Clear all ${area} pickup responses for this week so you can start fresh.`,
            color: "#dc3545",
            actions: (
              <button onClick={clearResponses} style={{ ...s.cardBtn, background: "#dc3545" }}>
                Clear This Week&apos;s Responses
              </button>
            ),
          },
        ].map((card, i) => (
          <div key={i} style={s.card}>
            <div style={{ ...s.cardIconWrap, background: `${card.color}15`, color: card.color }}>
              {card.icon}
            </div>
            <div style={s.cardNum}>Step {card.num}</div>
            <h2 style={s.cardTitle}>{card.title}</h2>
            <p style={s.cardDesc}>{card.desc}</p>
            <div style={s.cardActions}>{card.actions}</div>
          </div>
        ))}
      </div>

      {/* ── RESULTS SECTIONS ── */}

      {/* Bulk Email Results */}
      {emailLinks && (
        <div style={s.resultSection}>
          <div style={s.resultHeader}>
            <h2 style={s.resultTitle}>Ready to Send {emailType === "remaining" ? "(Remaining)" : ""}</h2>
            <span style={s.badge}>{emailLinks.totalCustomers} customers</span>
          </div>

          <div style={s.stepsRow}>
            <div style={s.stepCard}>
              <div style={s.stepNum}>1</div>
              <h3 style={s.stepTitle}>Copy BCC Emails</h3>
              <p style={s.stepDesc}>Paste into Gmail BCC field</p>
              <button
                onClick={() => copyToClipboard(emailLinks.bccEmails, "bcc")}
                style={s.copyBtn}
              >
                {copied === "bcc" ? "&#10003; Copied!" : `Copy ${emailLinks.totalCustomers} Emails`}
              </button>
              <textarea readOnly value={emailLinks.bccEmails} style={s.textarea} rows={3} />
            </div>

            <div style={s.stepCard}>
              <div style={s.stepNum}>2</div>
              <h3 style={s.stepTitle}>Copy Email Subject</h3>
              <p style={s.stepDesc}>Paste as your email subject line</p>
              <button
                onClick={() => copyToClipboard(getEmailSubject(), "subject")}
                style={s.copyBtn}
              >
                {copied === "subject" ? "&#10003; Copied!" : "Copy Subject"}
              </button>
              <textarea readOnly value={getEmailSubject()} style={s.textarea} rows={1} />
            </div>

            <div style={s.stepCard}>
              <div style={s.stepNum}>3</div>
              <h3 style={s.stepTitle}>Copy Email Body</h3>
              <p style={s.stepDesc}>Paste as your email message</p>
              <button
                onClick={() => copyToClipboard(getEmailBody(), "body")}
                style={s.copyBtn}
              >
                {copied === "body" ? "&#10003; Copied!" : "Copy Email Body"}
              </button>
              <textarea
                readOnly
                value={getEmailBody()}
                style={s.textarea}
                rows={8}
              />
            </div>
          </div>
        </div>
      )}

      {/* Day2 Confirmations Results */}
      {day2Confirmations && (
        <div style={s.resultSection}>
          <div style={s.resultHeader}>
            <h2 style={s.resultTitle}>{day2Confirmations.day} Confirmations</h2>
            <span style={s.badge}>{day2Confirmations.totalConfirmed} confirmed</span>
          </div>
          {day2Confirmations.totalConfirmed === 0 ? (
            <div style={s.emptyState}>
              <p>No one has confirmed for {day2Confirmations.day} yet.</p>
            </div>
          ) : (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                <button
                  onClick={() => copyToClipboard(day2Confirmations.emailString, "day2bcc")}
                  style={{ ...s.copyBtn, width: "auto" }}
                >
                  {copied === "day2bcc" ? "&#10003; Copied!" : `Copy ${day2Confirmations.totalConfirmed} Emails`}
                </button>
                <button
                  onClick={() => copyToClipboard(`Reminder: Laundry Collection - (Today, ${day2Confirmations.day})`, "day2subject")}
                  style={{ ...s.copyBtn, width: "auto", background: "linear-gradient(135deg, #11998e, #38ef7d)" }}
                >
                  {copied === "day2subject" ? "&#10003; Copied!" : "Copy Subject"}
                </button>
              </div>
              <p style={{ margin: "0 0 6px", fontSize: "12px", color: "#888", fontWeight: "600" }}>SUBJECT</p>
              <textarea readOnly value={`Reminder: Laundry Collection - (Today, ${day2Confirmations.day})`} style={s.textarea} rows={1} />
              <p style={{ margin: "12px 0 6px", fontSize: "12px", color: "#888", fontWeight: "600" }}>BCC EMAILS</p>
              <textarea readOnly value={day2Confirmations.emailString} style={s.textarea} rows={3} />
            </div>
          )}
        </div>
      )}

      {/* Pickup List Results */}
      {pickupList && (
        <div style={s.resultSection}>
          <div style={s.resultHeader}>
            <h2 style={s.resultTitle}>
              {pickupList.day} {pickupList.isCombined ? "Route" : "Pickup List"}
            </h2>
            <span style={s.badge}>{pickupList.totalConfirmed} stops</span>
          </div>
          {pickupList.isCombined && (
            <p style={s.resultSub}>
              {pickupList.totalDropoffs} drop-off(s) from {pickupList.day1} &nbsp;+&nbsp; {pickupList.totalPickups} pickup(s) for {pickupList.day}
            </p>
          )}
          {pickupList.pickupList.length === 0 ? (
            <div style={s.emptyState}>
              <p>No confirmations yet for {pickupList.day}.</p>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "16px" }}>
                <button
                  onClick={() => {
                    window.open(`/api/pickup-list-xlsx?area=${pickupList.area}&day=${pickupList.day}&pin=${pin}`, "_blank");
                  }}
                  style={{ ...s.cardBtn, background: "#11998e", padding: "10px 24px" }}
                >
                  <span style={{ marginRight: "6px" }}>&#8615;</span> Download Excel
                </button>
                {pickupList.isCombined && (
                  <>
                    <span style={s.legendTag.pickup}>PICK UP</span>
                    <span style={s.legendTag.dropoff}>DROP OFF</span>
                  </>
                )}
              </div>

              <div style={s.table}>
                <div style={s.tableHeader}>
                  <div style={{ flex: 3 }}>Address</div>
                  <div style={{ flex: 1 }}>Unit</div>
                  <div style={{ flex: 3 }}>Entry Method</div>
                  {pickupList.isCombined && <div style={{ flex: 1.5 }}>Type</div>}
                </div>
                {pickupList.pickupList.map((p, i) => {
                  const isPickup = p.type === "pickup";
                  const isDropoff = p.type === "dropoff";
                  const rowBg = isPickup ? "#e8f5e9" : isDropoff ? "#ffebee" : (i % 2 === 0 ? "#fff" : "#fafafa");
                  return (
                    <div key={i} style={{ ...s.tableRow, background: rowBg }}>
                      <div style={{ flex: 3, fontWeight: "500" }}>{p.address}</div>
                      <div style={{ flex: 1 }}>{p.unit}</div>
                      <div style={{ flex: 3, color: "#555" }}>{p.entryMethod}</div>
                      {pickupList.isCombined && (
                        <div style={{ flex: 1.5 }}>
                          <span style={isPickup ? s.typeBadge.pickup : s.typeBadge.dropoff}>
                            {isPickup ? "PICK UP" : "DROP OFF"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Weekly Status Results */}
      {remainingData && (
        <div style={s.resultSection}>
          <div style={s.resultHeader}>
            <h2 style={s.resultTitle}>Weekly Status</h2>
          </div>
          <div style={s.statsRow}>
            <div style={{ ...s.statCard, borderLeft: "4px solid #28a745" }}>
              <div style={{ ...s.statNum, color: "#28a745" }}>{remainingData.totalConfirmed}</div>
              <div style={s.statLabel}>Confirmed</div>
            </div>
            <div style={{ ...s.statCard, borderLeft: "4px solid #dc3545" }}>
              <div style={{ ...s.statNum, color: "#dc3545" }}>{remainingData.totalRemaining}</div>
              <div style={s.statLabel}>No Reply</div>
            </div>
            <div style={{ ...s.statCard, borderLeft: "4px solid #667eea" }}>
              <div style={{ ...s.statNum, color: "#667eea" }}>{remainingData.totalCustomers}</div>
              <div style={s.statLabel}>Total</div>
            </div>
          </div>
          {/* Progress bar */}
          <div style={s.progressWrap}>
            <div style={s.progressTrack}>
              <div style={{ ...s.progressFill, width: `${remainingData.totalCustomers > 0 ? (remainingData.totalConfirmed / remainingData.totalCustomers) * 100 : 0}%` }} />
            </div>
            <span style={s.progressLabel}>
              {remainingData.totalCustomers > 0 ? Math.round((remainingData.totalConfirmed / remainingData.totalCustomers) * 100) : 0}% confirmed
            </span>
          </div>
          {remainingData.totalRemaining > 0 && (
            <div style={s.remainingBox}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#333" }}>Remaining Emails (for follow-up BCC)</h3>
                <button
                  onClick={() => copyToClipboard(remainingData.emailString, "remaining")}
                  style={s.copyBtnSm}
                >
                  {copied === "remaining" ? "&#10003; Copied!" : `Copy ${remainingData.totalRemaining} Emails`}
                </button>
              </div>
              <textarea readOnly value={remainingData.emailString} style={s.textarea} rows={3} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  // ── Login ──
  loginBg: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f13",
    backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(102,126,234,0.15) 0%, transparent 60%)",
  },
  loginCard: {
    background: "#1a1a24",
    borderRadius: "20px",
    padding: "48px 40px",
    maxWidth: "380px",
    width: "100%",
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
  },
  loginIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "16px",
    background: "rgba(102,126,234,0.12)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px",
  },
  loginTitle: { margin: "0 0 6px", fontSize: "24px", fontWeight: "700", color: "#fff" },
  loginSub: { margin: "0 0 28px", color: "rgba(255,255,255,0.45)", fontSize: "14px" },
  pinInput: {
    width: "100%",
    padding: "14px 16px",
    fontSize: "22px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    textAlign: "center",
    letterSpacing: "8px",
    marginBottom: "16px",
    boxSizing: "border-box",
    color: "#fff",
    outline: "none",
  },
  loginBtn: {
    width: "100%",
    padding: "14px",
    fontSize: "15px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontWeight: "600",
    transition: "opacity 0.2s",
  },
  loginError: { color: "#ff6b6b", marginTop: "14px", fontSize: "14px" },

  // ── Page ──
  page: {
    maxWidth: "1160px",
    margin: "0 auto",
    padding: "24px 20px 60px",
    background: "#f5f6fa",
    minHeight: "100vh",
  },

  // ── Header ──
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    marginBottom: "28px",
    padding: "20px 24px",
    background: "#fff",
    borderRadius: "16px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: "14px" },
  logoMark: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "16px",
    fontWeight: "800",
    letterSpacing: "-0.5px",
  },
  headerTitle: { margin: 0, fontSize: "20px", fontWeight: "700", color: "#1a1a2e" },
  headerSub: { margin: "2px 0 0", fontSize: "13px", color: "#888" },
  areaToggle: {
    display: "flex",
    background: "#f0f1f5",
    borderRadius: "12px",
    padding: "4px",
  },
  areaBtn: {
    padding: "10px 22px",
    border: "none",
    borderRadius: "10px",
    background: "transparent",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    color: "#666",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    transition: "all 0.2s",
  },
  areaActive: {
    padding: "10px 22px",
    border: "none",
    borderRadius: "10px",
    background: "#fff",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700",
    color: "#1a1a2e",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    transition: "all 0.2s",
  },
  areaDays: { fontSize: "11px", fontWeight: "500", opacity: 0.6 },

  // ── Cards Grid ──
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "16px",
    marginBottom: "28px",
  },
  card: {
    background: "#fff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    transition: "box-shadow 0.2s",
  },
  cardIconWrap: {
    width: "44px",
    height: "44px",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "14px",
  },
  cardNum: {
    fontSize: "11px",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: "1px",
    color: "#999",
    marginBottom: "4px",
  },
  cardTitle: { margin: "0 0 6px", fontSize: "16px", fontWeight: "700", color: "#1a1a2e" },
  cardDesc: { margin: "0 0 16px", color: "#777", fontSize: "13px", lineHeight: "1.5", flex: 1 },
  cardActions: { display: "flex", flexDirection: "column", gap: "8px" },
  cardBtn: {
    padding: "10px 18px",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    textAlign: "center",
    transition: "opacity 0.2s",
  },
  cardBtnOutline: {
    padding: "10px 18px",
    background: "transparent",
    color: "#667eea",
    border: "1.5px solid #ddd",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    textAlign: "center",
    transition: "all 0.2s",
  },

  // ── Banners ──
  errorBanner: {
    background: "#fff0f0",
    color: "#c0392b",
    padding: "12px 16px",
    borderRadius: "12px",
    marginBottom: "16px",
    fontSize: "14px",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    border: "1px solid #fdd",
  },
  dismissBtn: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    color: "#c0392b",
    cursor: "pointer",
    fontSize: "16px",
    padding: "0 4px",
  },
  loadingBanner: {
    background: "#f0f4ff",
    color: "#667eea",
    padding: "12px 16px",
    borderRadius: "12px",
    marginBottom: "16px",
    fontSize: "14px",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    border: "1px solid #dde4ff",
  },
  spinner: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    border: "2px solid #dde4ff",
    borderTopColor: "#667eea",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },

  // ── Results ──
  resultSection: {
    background: "#fff",
    borderRadius: "16px",
    padding: "28px",
    marginBottom: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  resultHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "4px",
  },
  resultTitle: { margin: 0, fontSize: "18px", fontWeight: "700", color: "#1a1a2e" },
  resultSub: { margin: "4px 0 16px", color: "#888", fontSize: "13px" },
  badge: {
    background: "#f0f1f5",
    color: "#555",
    padding: "4px 12px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: "600",
  },
  emptyState: {
    textAlign: "center",
    padding: "32px",
    color: "#999",
    fontSize: "14px",
  },

  // ── Steps (email section) ──
  stepsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
    marginTop: "16px",
  },
  stepCard: {
    background: "#f8f9fc",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #eee",
  },
  stepNum: {
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "#667eea",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: "700",
    marginBottom: "10px",
  },
  stepTitle: { margin: "0 0 4px", fontSize: "15px", fontWeight: "600", color: "#1a1a2e" },
  stepDesc: { margin: "0 0 12px", fontSize: "13px", color: "#888" },

  // ── Copy Buttons ──
  copyBtn: {
    padding: "10px 20px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "10px",
    width: "100%",
    textAlign: "center",
  },
  copyBtnSm: {
    padding: "6px 14px",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "600",
    whiteSpace: "nowrap",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: "11px",
    resize: "vertical",
    boxSizing: "border-box",
    background: "#fff",
    color: "#555",
  },

  // ── Tables ──
  table: {
    borderRadius: "12px",
    overflow: "hidden",
    border: "1px solid #e5e7eb",
  },
  tableHeader: {
    display: "flex",
    padding: "12px 16px",
    background: "#f8f9fc",
    fontWeight: "700",
    fontSize: "12px",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid #e5e7eb",
    gap: "8px",
  },
  tableRow: {
    display: "flex",
    padding: "12px 16px",
    borderBottom: "1px solid #f0f1f5",
    alignItems: "center",
    fontSize: "13px",
    gap: "8px",
    color: "#333",
    transition: "background 0.15s",
  },
  legendTag: {
    pickup: {
      background: "#e8f5e9",
      color: "#2e7d32",
      padding: "5px 14px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: "700",
    },
    dropoff: {
      background: "#ffebee",
      color: "#c62828",
      padding: "5px 14px",
      borderRadius: "20px",
      fontSize: "12px",
      fontWeight: "700",
    },
  },
  typeBadge: {
    pickup: {
      display: "inline-block",
      background: "#2e7d32",
      color: "#fff",
      padding: "3px 10px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "700",
      letterSpacing: "0.3px",
    },
    dropoff: {
      display: "inline-block",
      background: "#c62828",
      color: "#fff",
      padding: "3px 10px",
      borderRadius: "6px",
      fontSize: "11px",
      fontWeight: "700",
      letterSpacing: "0.3px",
    },
  },

  // ── Stats ──
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: "12px",
    marginBottom: "16px",
    marginTop: "16px",
  },
  statCard: {
    background: "#f8f9fc",
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center",
  },
  statNum: { fontSize: "36px", fontWeight: "800", lineHeight: 1 },
  statLabel: { fontSize: "13px", color: "#888", marginTop: "4px", fontWeight: "500" },
  progressWrap: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "20px",
  },
  progressTrack: {
    flex: 1,
    height: "8px",
    background: "#f0f1f5",
    borderRadius: "4px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #28a745, #20c997)",
    borderRadius: "4px",
    transition: "width 0.5s ease",
  },
  progressLabel: {
    fontSize: "13px",
    fontWeight: "600",
    color: "#28a745",
    whiteSpace: "nowrap",
  },
  remainingBox: {
    background: "#f8f9fc",
    borderRadius: "12px",
    padding: "16px",
    border: "1px solid #eee",
  },
};
