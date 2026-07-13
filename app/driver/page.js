"use client";
import { useState, useEffect, useRef } from "react";

// Mobile-first page for drivers to snap and upload pickup / drop-off / issue
// photos at each stop. Photos are stored for 30 days.

export default function DriverPage() {
  const [pin, setPin] = useState("");
  const [area, setArea] = useState("uptown");
  const [type, setType] = useState("dropoff");
  const [status, setStatus] = useState("done");
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const fileInputRef = useRef(null);

  // Remember the PIN on this phone so drivers only type it once
  useEffect(() => {
    const saved = localStorage.getItem("driverPin");
    if (saved) setPin(saved);
  }, []);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  };

  const reset = (keepStop = false) => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setDone(null);
    setError("");
    if (!keepStop) {
      setAddress("");
      setUnit("");
      setNote("");
      setStatus("done");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async () => {
    if (!pin.trim()) return setError("Enter your PIN.");
    if (!address.trim()) return setError("Enter the address.");
    if (!file) return setError("Take or choose a photo.");

    setSubmitting(true);
    setError("");
    try {
      localStorage.setItem("driverPin", pin.trim());
      const form = new FormData();
      form.append("pin", pin.trim());
      form.append("photo", file);
      form.append("address", address.trim());
      form.append("unit", unit.trim());
      form.append("area", area);
      form.append("type", type);
      form.append("status", type === "issue" ? "issue" : status);
      form.append("note", note.trim());

      const res = await fetch("/api/photos", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDone(data);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  if (done) {
    return (
      <div style={st.page}>
        <div style={st.card}>
          <div style={st.bigCheck}>✓</div>
          <h1 style={st.title}>Photo saved!</h1>
          <p style={st.sub}>
            {done.address}
            {done.unit ? `, ${done.unit}` : ""} — {done.type === "pickup" ? "PICK UP" : done.type === "issue" ? "ISSUE" : "DROP OFF"}
          </p>
          <p style={{ ...st.sub, fontSize: "12px", color: "#999" }}>
            Stored for {done.retentionDays} days
          </p>
          <button onClick={() => reset(false)} style={st.submitBtn}>
            Next Stop
          </button>
          <button onClick={() => reset(true)} style={st.outlineBtn}>
            Another Photo, Same Stop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={st.page}>
      <div style={st.card}>
        <h1 style={st.title}>Driver Photo</h1>
        <p style={st.sub}>Snap a photo at every pickup &amp; drop-off</p>

        <label style={st.label}>PIN</label>
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Driver PIN"
          style={st.input}
        />

        <label style={st.label}>AREA</label>
        <div style={st.toggleRow}>
          <button onClick={() => setArea("uptown")} style={area === "uptown" ? st.toggleOn : st.toggleOff}>Uptown</button>
          <button onClick={() => setArea("downtown")} style={area === "downtown" ? st.toggleOn : st.toggleOff}>Downtown</button>
        </div>

        <label style={st.label}>TYPE</label>
        <div style={st.toggleRow}>
          <button onClick={() => setType("pickup")} style={type === "pickup" ? { ...st.toggleOn, background: "#2e7d32" } : st.toggleOff}>PICK UP</button>
          <button onClick={() => setType("dropoff")} style={type === "dropoff" ? { ...st.toggleOn, background: "#c62828" } : st.toggleOff}>DROP OFF</button>
          <button onClick={() => setType("issue")} style={type === "issue" ? { ...st.toggleOn, background: "#f57c00" } : st.toggleOff}>ISSUE</button>
        </div>

        {type !== "issue" && (
          <>
            <label style={st.label}>STATUS</label>
            <div style={st.toggleRow}>
              <button onClick={() => setStatus("done")} style={status === "done" ? { ...st.toggleOn, background: "#2e7d32" } : st.toggleOff}>DONE</button>
              <button onClick={() => setStatus("no_bag")} style={status === "no_bag" ? { ...st.toggleOn, background: "#c62828" } : st.toggleOff}>NO BAG</button>
            </div>
          </>
        )}

        <label style={st.label}>ADDRESS</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. 214 West 102nd"
          style={st.input}
        />

        <label style={st.label}>UNIT (OPTIONAL)</label>
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="e.g. 1B"
          style={st.input}
        />

        <label style={st.label}>NOTE (OPTIONAL)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. left with doorman"
          style={st.input}
        />

        <label style={st.label}>PHOTO</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: "none" }}
          id="photoInput"
        />
        <label htmlFor="photoInput" style={st.photoBtn}>
          {file ? "Retake / Change Photo" : "📷 Take Photo"}
        </label>
        {preview && (
          <img src={preview} alt="preview" style={st.preview} />
        )}

        {error && <p style={st.error}>{error}</p>}

        <button onClick={submit} disabled={submitting} style={st.submitBtn}>
          {submitting ? "Uploading..." : "Upload Photo"}
        </button>
      </div>
    </div>
  );
}

const st = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    padding: "20px 16px 40px",
  },
  card: {
    background: "white",
    borderRadius: "16px",
    padding: "28px 24px",
    maxWidth: "420px",
    width: "100%",
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
  },
  title: { margin: "0 0 4px", fontSize: "22px", color: "#1a1a1a", textAlign: "center" },
  sub: { margin: "0 0 20px", fontSize: "14px", color: "#888", textAlign: "center" },
  label: {
    display: "block",
    fontSize: "11px",
    fontWeight: "700",
    color: "#888",
    letterSpacing: "0.5px",
    margin: "14px 0 6px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "16px",
    border: "2px solid #ddd",
    borderRadius: "10px",
    boxSizing: "border-box",
    outline: "none",
  },
  toggleRow: { display: "flex", gap: "8px" },
  toggleOn: {
    flex: 1,
    padding: "12px 6px",
    fontSize: "13px",
    fontWeight: "700",
    background: "#667eea",
    color: "white",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
  toggleOff: {
    flex: 1,
    padding: "12px 6px",
    fontSize: "13px",
    fontWeight: "600",
    background: "#f0f1f5",
    color: "#666",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
  },
  photoBtn: {
    display: "block",
    padding: "16px",
    fontSize: "16px",
    fontWeight: "700",
    background: "#f0f1f5",
    color: "#333",
    border: "2px dashed #bbb",
    borderRadius: "12px",
    cursor: "pointer",
    textAlign: "center",
  },
  preview: {
    width: "100%",
    maxHeight: "260px",
    objectFit: "cover",
    borderRadius: "12px",
    marginTop: "10px",
    border: "1px solid #eee",
  },
  submitBtn: {
    width: "100%",
    marginTop: "18px",
    padding: "16px",
    fontSize: "17px",
    fontWeight: "700",
    background: "linear-gradient(135deg, #667eea, #764ba2)",
    color: "white",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
  },
  outlineBtn: {
    width: "100%",
    marginTop: "10px",
    padding: "14px",
    fontSize: "15px",
    fontWeight: "600",
    background: "white",
    color: "#667eea",
    border: "2px solid #667eea",
    borderRadius: "12px",
    cursor: "pointer",
  },
  bigCheck: {
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
    margin: "0 auto 16px",
  },
  error: { color: "#dc3545", fontSize: "14px", margin: "12px 0 0", textAlign: "center" },
};
