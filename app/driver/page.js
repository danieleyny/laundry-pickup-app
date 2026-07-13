"use client";
import { useState, useRef, useEffect } from "react";

const DRIVER_SESSION_KEY = "ldn_driver_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─────────────────────────────────────────────────────────────────────
// Design palette — modern, refined, premium
// ─────────────────────────────────────────────────────────────────────
const PALETTE = {
  brand: "#7CB342",
  brandDeep: "#558B2F",
  brandDark: "#33691E",
  brandSoft: "#E8F5E9",
  pickup: "#2E7D32",
  pickupSoft: "#E8F5E9",
  dropoff: "#C62828",
  dropoffSoft: "#FFEBEE",
  ink: "#0F1A0A",
  inkSoft: "#3D4A33",
  muted: "#6B7569",
  surface: "#FFFFFF",
  surfaceWarm: "#FAFBF8",
  border: "#E5EAE0",
  bg: "linear-gradient(180deg, #F7F9F3 0%, #EFF2EA 100%)",
};

export default function DriverPage() {
  const [pin, setPin] = useState("");
  const [area, setArea] = useState(null);
  const [day, setDay] = useState(null);
  const [stops, setStops] = useState([]);
  const [config, setConfig] = useState(null);
  const [isDropoffOnly, setIsDropoffOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("sequential");
  const [issueModal, setIssueModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [saveStatus, setSaveStatus] = useState(""); // "" | "saving" | "saved" | "error"
  const [showAddForm, setShowAddForm] = useState(false);
  const [addressBook, setAddressBook] = useState([]);
  const [dropoffModal, setDropoffModal] = useState(null); // { stop }
  const [testMode, setTestMode] = useState(false);
  const fileInputRef = useRef(null);
  const dropoffFileInputRef = useRef(null);

  // Drag-and-drop state for the full route list (touch + mouse)
  const [dragIdx, setDragIdx] = useState(null);
  const dragIdxRef = useRef(null);
  const stopsRef = useRef(stops);
  const rowsRef = useRef([]);
  const persistOrderRef = useRef(null);
  useEffect(() => { stopsRef.current = stops; }, [stops]);

  // Poll test mode every 15s. When it transitions ON → OFF, refresh the route
  // so any optimistic "Done" marks from test runs disappear and everything
  // returns to the server-side pending state.
  useEffect(() => {
    let cancelled = false;
    const pinRef = pin;
    const check = async () => {
      try {
        const res = await fetch("/api/test-mode", { cache: "no-store" });
        if (!res.ok) return;
        const { enabled } = await res.json();
        if (cancelled) return;
        setTestMode((prev) => {
          // Transition true → false: reload route to clear visual state
          if (prev && !enabled && pinRef) {
            loadRoute(pinRef);
          }
          return enabled;
        });
      } catch {}
    };
    check();
    const id = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pin]);

  // Restore saved session on mount (24h persistence, device-specific)
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const raw = window.localStorage.getItem(DRIVER_SESSION_KEY);
        if (!raw) { setSessionRestoring(false); return; }
        const session = JSON.parse(raw);
        if (!session?.pin || !session?.expiresAt || session.expiresAt < Date.now()) {
          window.localStorage.removeItem(DRIVER_SESSION_KEY);
          setSessionRestoring(false);
          return;
        }
        // Validate PIN by attempting to load route
        const res = await fetch("/api/driver/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: session.pin }),
        });
        if (cancelled) return;
        if (res.ok) {
          setPin(session.pin);
          await loadRoute(session.pin);
        } else {
          window.localStorage.removeItem(DRIVER_SESSION_KEY);
        }
      } catch {}
      if (!cancelled) setSessionRestoring(false);
    };
    restore();
    return () => { cancelled = true; };
  }, []);

  const loadRoute = async (forPin) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/driver/route?pin=${encodeURIComponent(forPin)}`);
      if (!res.ok) throw new Error((await res.json()).error || "Failed to load route");
      const data = await res.json();
      setArea(data.area);
      setDay(data.day);
      setConfig(data.config);
      setIsDropoffOnly(!!data.isDropoffOnly);
      setStops(data.stops || []);
      // Phase 4: seed ETA constants from the learned model (silent fallback).
      try {
        const eta = await fetch(`/api/eta-model?area=${encodeURIComponent(data.area)}`, { cache: "no-store" });
        if (eta.ok) applyEtaProfile(await eta.json());
      } catch {}
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/driver/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Invalid PIN");
      await loadRoute(pin.trim());
      try {
        window.localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify({
          pin: pin.trim(), expiresAt: Date.now() + SESSION_DURATION_MS,
        }));
      } catch {}
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleLogout = () => {
    try { window.localStorage.removeItem(DRIVER_SESSION_KEY); } catch {}
    setArea(null); setStops([]); setPin("");
  };

  const nextPendingIdx = stops.findIndex((s) => s.status === "pending");
  const currentIdx = nextPendingIdx === -1 ? stops.length - 1 : nextPendingIdx;
  const currentStop = stops[currentIdx];
  const completedCount = stops.filter((s) => s.status !== "pending").length;
  const progressPct = stops.length ? (completedCount / stops.length) * 100 : 0;
  const isAllDone = stops.length > 0 && stops.every((s) => s.status !== "pending");

  const markStop = async (stop, status) => {
    if (!stop) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/driver/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim(), day, key: stop.key, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setStops(stops.map((s) =>
        s.key === stop.key ? { ...s, status, statusTime: new Date().toISOString() } : s
      ));
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const submitIssue = async (file) => {
    if (!file || !issueModal) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("pin", pin.trim());
      form.append("day", day);
      form.append("address", issueModal.stop.address);
      form.append("unit", issueModal.stop.unit || "");
      form.append("type", issueModal.type);
      form.append("photo", file);
      const res = await fetch("/api/driver/issue", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to submit");
      setStops(stops.map((s) =>
        s.key === issueModal.stop.key
          ? { ...s, status: issueModal.type, statusTime: new Date().toISOString() }
          : s
      ));
      setIssueModal(null);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  const getDirections = (address) => {
    const q = encodeURIComponent(`${address}, New York, NY`);
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, "_blank");
  };

  const submitDropoff = async (file) => {
    if (!file || !dropoffModal) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("pin", pin.trim());
      form.append("day", day);
      form.append("address", dropoffModal.stop.address);
      form.append("unit", dropoffModal.stop.unit || "");
      form.append("photo", file);
      const res = await fetch("/api/driver/dropoff", { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to submit");
      setStops(stops.map((sNow) =>
        sNow.key === dropoffModal.stop.key
          ? { ...sNow, status: "collected", statusTime: new Date().toISOString() }
          : sNow
      ));
      setDropoffModal(null);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  // Persist the current order to the server
  const persistOrder = async (list) => {
    setSaveStatus("saving");
    try {
      const order = list.map((x) => `${(x.address || "").toLowerCase().trim()}|${(x.unit || "").trim()}`);
      const res = await fetch("/api/driver/save-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim(), day, order }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 1500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(""), 2500);
    }
  };

  const moveStop = (idx, direction) => {
    const target = idx + direction;
    if (target < 0 || target >= stops.length) return;
    const newList = [...stops];
    [newList[idx], newList[target]] = [newList[target], newList[idx]];
    setStops(newList);
    persistOrder(newList);
  };

  // Keep persistOrder ref fresh so the always-attached drag listeners see the latest closure
  useEffect(() => {
    persistOrderRef.current = (list) => {
      // Inline copy of persistOrder that doesn't depend on closures captured by useEffect-once
      (async () => {
        setSaveStatus("saving");
        try {
          const order = list.map((x) => `${(x.address || "").toLowerCase().trim()}|${(x.unit || "").trim()}`);
          const res = await fetch("/api/driver/save-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: pin.trim(), day, order }),
          });
          if (!res.ok) throw new Error("Save failed");
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus(""), 1500);
        } catch {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus(""), 2500);
        }
      })();
    };
  }, [pin, day]);

  // Drag-and-drop: listeners are attached ONCE on mount and check refs synchronously.
  // This avoids the React rerender delay between touchstart and listener attachment.
  useEffect(() => {
    const handleMove = (e) => {
      if (dragIdxRef.current === null) return;
      e.preventDefault();
      const point = e.touches?.[0] || e;
      const rows = rowsRef.current;
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i]) continue;
        const rect = rows[i].getBoundingClientRect();
        if (point.clientY >= rect.top && point.clientY <= rect.bottom) {
          if (i !== dragIdxRef.current) {
            const next = [...stopsRef.current];
            const [moved] = next.splice(dragIdxRef.current, 1);
            next.splice(i, 0, moved);
            stopsRef.current = next;       // sync ref immediately
            setStops(next);                 // trigger visual re-render
            dragIdxRef.current = i;         // sync ref immediately
            setDragIdx(i);                  // trigger visual re-render
          }
          break;
        }
      }
      // Auto-scroll near viewport edges
      const viewportH = window.innerHeight;
      if (point.clientY < 80) window.scrollBy(0, -12);
      else if (point.clientY > viewportH - 80) window.scrollBy(0, 12);
    };

    const handleEnd = () => {
      if (dragIdxRef.current === null) return;
      if (persistOrderRef.current) persistOrderRef.current(stopsRef.current);
      dragIdxRef.current = null;
      setDragIdx(null);
    };

    document.addEventListener("touchmove", handleMove, { passive: false });
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);
    document.addEventListener("mouseup", handleEnd);
    return () => {
      document.removeEventListener("touchmove", handleMove);
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);
      document.removeEventListener("mouseup", handleEnd);
    };
  }, []); // mount once — handlers read all state via refs

  const startDrag = (idx) => (e) => {
    // Set ref FIRST (synchronous) so the always-attached touchmove listener picks it up immediately
    dragIdxRef.current = idx;
    setDragIdx(idx); // for visual feedback
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try { navigator.vibrate(15); } catch {}
    }
  };

  // Load the address autocomplete data on first opening the add form
  const ensureAddressBook = async () => {
    if (addressBook.length > 0) return;
    try {
      const res = await fetch(`/api/driver/addresses?pin=${encodeURIComponent(pin.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setAddressBook(data.addresses || []);
      }
    } catch {}
  };

  const addStop = async ({ address, unit, entryMethod, type }) => {
    if (!address.trim()) return;
    const newStop = {
      address: address.trim(),
      unit: (unit || "").trim(),
      entryMethod: (entryMethod || "See notes").trim(),
      type: type || "pickup",
      addedBy: "driver",
      isManual: true,
      key: `${address.toLowerCase().trim()}|${(unit || "").trim()}`,
      status: "pending",
    };
    // Append to local stops list (driver can reorder afterward)
    const newStops = [...stops, newStop];
    setStops(newStops);
    setShowAddForm(false);

    // Persist to server. Surface backend failures (non-2xx) loudly so the
    // driver knows immediately if the stop didn't save — otherwise it'd
    // appear locally then vanish on the next refresh.
    setSaveStatus("saving");
    try {
      const addRes = await fetch("/api/driver/add-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pin.trim(),
          day,
          address: newStop.address,
          unit: newStop.unit,
          entryMethod: newStop.entryMethod,
          type: newStop.type,
        }),
      });
      if (!addRes.ok) {
        const body = await addRes.text().catch(() => "");
        throw new Error(`add-stop ${addRes.status}: ${body.slice(0, 120)}`);
      }
      // Also persist the new order so the stop stays where the driver placed it
      const orderRes = await fetch("/api/driver/save-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pin.trim(),
          day,
          order: newStops.map((x) => `${x.address.toLowerCase().trim()}|${(x.unit || "").trim()}`),
        }),
      });
      if (!orderRes.ok) {
        const body = await orderRes.text().catch(() => "");
        throw new Error(`save-order ${orderRes.status}: ${body.slice(0, 120)}`);
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 1500);
    } catch (err) {
      console.error("addStop failed:", err);
      setSaveStatus("error");
      setError(`Couldn't save "${newStop.address}" — ${err.message}. Please try again.`);
      // Roll back the optimistic local addition so the UI doesn't lie
      setStops((prev) => prev.filter((s) => s !== newStop));
      setTimeout(() => setSaveStatus(""), 2500);
    }
  };

  // ── SESSION RESTORING ──
  if (sessionRestoring && !area) {
    return (
      <div style={s.bg}>
        <div style={s.loginShell}>
          <div style={s.loginLogo}>
            <div style={s.loginLogoMark} />
          </div>
          <p style={s.brandMark}>LAUNDRY DAY</p>
          <p style={{ ...s.loginSub, marginTop: 16 }}>Loading…</p>
        </div>
      </div>
    );
  }

  // ── LOGIN ──
  if (!area) {
    return (
      <div style={s.bg}>
        <div style={s.loginShell}>
          <div style={s.loginLogo}>
            <div style={s.loginLogoMark} />
          </div>
          <p style={s.brandMark}>LAUNDRY DAY</p>
          <h1 style={s.loginTitle}>Driver Portal</h1>
          <p style={s.loginSub}>Enter your 4-digit PIN to start your route</p>
          <input
            type="tel"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="••••"
            style={s.pinInput}
            autoFocus
          />
          <button onClick={handleLogin} disabled={loading || pin.length < 4} style={{
            ...s.primaryBtn,
            opacity: pin.length < 4 ? 0.4 : 1,
          }}>
            {loading ? "Loading..." : "Start Route →"}
          </button>
          {error && <p style={s.errorText}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={s.bg}>
      <div style={s.appShell}>
        {/* ── HEADER with progress bar ── */}
        <div style={s.header}>
          <div style={s.headerTop}>
            <div>
              <p style={s.headerEyebrow}>
                {day.toUpperCase()} · {area.toUpperCase()}
                {isDropoffOnly && " · DROPOFFS"}
              </p>
              <h1 style={s.headerTitle}>
                {isAllDone ? "Route Complete" : `Stop ${completedCount + 1}`}
                <span style={s.headerTotal}> of {stops.length}</span>
              </h1>
              {isDropoffOnly && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#5c6b4f", fontWeight: 600 }}>
                  Returning laundry picked up on {config?.day2}.
                </p>
              )}
            </div>
            <button onClick={handleLogout} style={s.signOutBtn}>
              ✕
            </button>
          </div>
          <div style={s.progressTrack}>
            <div style={{ ...s.progressFill, width: `${progressPct}%` }} />
          </div>
        </div>

        {testMode && (
          <div style={s.testModeBanner}>
            <div style={s.testModeBannerText}>
              <strong>🧪 TEST MODE</strong> — nothing you do here saves. Reload the route after turning the toggle off in Dashboard.
            </div>
            <button
              onClick={() => loadRoute(pin.trim())}
              style={s.testModeReset}
              title="Refetch the route to clear local test marks"
            >
              Reset route
            </button>
          </div>
        )}

        {error && (
          <div style={s.errorBanner}>
            <span>{error}</span>
            <button onClick={() => setError("")} style={s.errorDismiss}>✕</button>
          </div>
        )}

        {/* ── VIEW TOGGLE ── */}
        <div style={s.viewToggle}>
          <button onClick={() => setView("sequential")} style={view === "sequential" ? s.toggleActive : s.toggleBtn}>
            Current
          </button>
          <button onClick={() => setView("full")} style={view === "full" ? s.toggleActive : s.toggleBtn}>
            All stops
          </button>
          <button onClick={() => setView("map")} style={view === "map" ? s.toggleActive : s.toggleBtn}>
            Map
          </button>
        </div>

        {/* ── CONTENT ── */}
        {stops.length === 0 ? (
          <div style={s.emptyCard}>
            <p style={s.emptyText}>No stops loaded yet.</p>
            <button onClick={() => loadRoute(pin.trim())} style={s.ghostBtn}>Refresh</button>
          </div>
        ) : view === "sequential" ? (
          isAllDone ? (
            <DoneCard total={stops.length} onShowFull={() => setView("full")} />
          ) : (
            <StopCard
              stop={currentStop}
              idx={currentIdx}
              total={stops.length}
              companions={stops.filter((s) =>
                s.key !== currentStop.key &&
                s.status === "pending" &&
                (s.address || "").toLowerCase().trim() ===
                  (currentStop.address || "").toLowerCase().trim()
              )}
              onCollected={() => {
                // For dropoff stops, require a confirmation photo. For pickups, mark immediately.
                if (currentStop.type === "dropoff") {
                  setDropoffModal({ stop: currentStop });
                } else {
                  markStop(currentStop, "collected");
                }
              }}
              onAccessIssue={() => setIssueModal({ type: "access_unavailable", stop: currentStop })}
              onNoBag={() => setIssueModal({ type: "no_bag", stop: currentStop })}
              onDirections={() => getDirections(currentStop.address)}
              submitting={submitting}
            />
          )
        ) : view === "map" ? (
          <MapView stops={stops} pin={pin} area={area} day={day} onSelect={(stop) => getDirections(stop.address)} />
        ) : (
          <FullRouteList
            stops={stops}
            onMove={moveStop}
            onAddClick={() => { setShowAddForm(true); ensureAddressBook(); }}
            saveStatus={saveStatus}
            dragIdx={dragIdx}
            onStartDrag={startDrag}
            rowsRef={rowsRef}
            onReoptimize={async () => {
              if (!confirm("Re-run the Mapbox optimizer? This will reorder the route based on current driving times.")) return;
              setSaveStatus("saving");
              try {
                const res = await fetch("/api/route/optimize", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pin: pin.trim(), area, day }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Optimizer failed");
                await loadRoute(pin.trim());
                setSaveStatus("saved");
                setTimeout(() => setSaveStatus(""), 2000);
              } catch (e) {
                setError(e.message);
                setSaveStatus("error");
                setTimeout(() => setSaveStatus(""), 3000);
              }
            }}
          />
        )}

        {showAddForm && (
          <AddStopModal
            addressBook={addressBook}
            onCancel={() => setShowAddForm(false)}
            onSubmit={addStop}
          />
        )}

        {issueModal && (
          <IssueModal
            type={issueModal.type}
            stop={issueModal.stop}
            onCancel={() => setIssueModal(null)}
            onSubmit={submitIssue}
            submitting={submitting}
            fileInputRef={fileInputRef}
          />
        )}

        {dropoffModal && (
          <DropoffModal
            stop={dropoffModal.stop}
            onCancel={() => setDropoffModal(null)}
            onSubmit={submitDropoff}
            submitting={submitting}
            fileInputRef={dropoffFileInputRef}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

function StopCard({ stop, idx, total, companions = [], onCollected, onAccessIssue, onNoBag, onDirections, submitting }) {
  const isDropoff = stop.type === "dropoff";
  const accentColor = isDropoff ? PALETTE.dropoff : PALETTE.pickup;
  const accentSoft = isDropoff ? PALETTE.dropoffSoft : PALETTE.pickupSoft;
  const typeLabel = isDropoff ? "DROP-OFF" : "PICK-UP";
  const hasCompanions = companions.length > 0;
  const pickupCount =
    (stop.type === "pickup" ? 1 : 0) +
    companions.filter((c) => c.type === "pickup").length;
  const dropoffCount =
    (stop.type === "dropoff" ? 1 : 0) +
    companions.filter((c) => c.type === "dropoff").length;

  return (
    <div style={s.stopCardWrap}>
      <div style={{ ...s.stopCard, borderColor: `${accentColor}26` }}>
        {/* Type ribbon */}
        <div style={{ ...s.typeRibbon, background: accentColor }}>
          {typeLabel}
        </div>

        <div style={s.stopCardInner}>
          <p style={s.stopCounter}>STOP {idx + 1} OF {total}</p>

          <h2 style={s.stopAddress}>{stop.address}</h2>
          {stop.unit && <p style={s.stopUnit}>Unit {stop.unit}</p>}

          {/* Multi-stop building callout */}
          {hasCompanions && (
            <div style={s.companionsCard}>
              <div style={s.companionsHeader}>
                <span style={s.companionsIcon} aria-hidden>⚠</span>
                <span>
                  <strong>Multi-stop building</strong>
                  {" — "}
                  {pickupCount > 0 && `${pickupCount} pick-up${pickupCount === 1 ? "" : "s"}`}
                  {pickupCount > 0 && dropoffCount > 0 && " + "}
                  {dropoffCount > 0 && `${dropoffCount} drop-off${dropoffCount === 1 ? "" : "s"}`}
                  {" total here"}
                </span>
              </div>
              <p style={s.companionsSub}>You'll have <strong>{companions.length} more</strong> after this one:</p>
              <ul style={s.companionsList}>
                {companions.map((c) => {
                  const cIsDropoff = c.type === "dropoff";
                  return (
                    <li key={c.key} style={s.companionsItem}>
                      <span
                        style={{
                          ...s.companionsTypeBadge,
                          background: cIsDropoff ? PALETTE.dropoffSoft : PALETTE.pickupSoft,
                          color: cIsDropoff ? PALETTE.dropoff : PALETTE.pickup,
                        }}
                      >
                        {cIsDropoff ? "DROP" : "PICK"}
                      </span>
                      <span style={s.companionsAddr}>
                        {c.unit ? `Unit ${c.unit}` : "Same address (no unit listed)"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p style={s.companionsHint}>
                {dropoffCount > 0 && pickupCount > 0
                  ? "Bring all drop-off bags AND grab all pick-ups in one trip."
                  : dropoffCount > 1
                  ? "Bring all drop-off bags in one trip."
                  : "Grab all bags from this building in one trip."}
              </p>
            </div>
          )}

          {/* Entry method card */}
          <div style={{ ...s.entryCard, background: accentSoft }}>
            <p style={s.entryLabel}>ACCESS</p>
            <p style={{ ...s.entryValue, color: accentColor === PALETTE.dropoff ? "#5c1414" : "#1B5E20" }}>
              {stop.entryMethod}
            </p>
          </div>

          {/* Primary action */}
          <button
            onClick={onCollected}
            disabled={submitting}
            style={{
              ...s.primaryAction,
              background: `linear-gradient(135deg, ${accentColor}, ${isDropoff ? "#8B0000" : "#1B5E20"})`,
              boxShadow: `0 8px 24px ${accentColor}40`,
            }}
          >
            {submitting ? "..." : (isDropoff ? "Mark Dropped Off" : "Mark Collected")}
          </button>

          {/* Secondary actions */}
          <div style={s.secondaryRow}>
            <button onClick={onDirections} style={s.secondaryAction}>
              <span style={s.secondaryIcon}>↗</span>
              <span style={s.secondaryLabel}>Directions</span>
            </button>
            <button onClick={onAccessIssue} disabled={submitting} style={s.secondaryAction}>
              <span style={s.secondaryIcon}>⊘</span>
              <span style={s.secondaryLabel}>Can't enter</span>
            </button>
            <button onClick={onNoBag} disabled={submitting} style={s.secondaryAction}>
              <span style={s.secondaryIcon}>○</span>
              <span style={s.secondaryLabel}>No bag</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Route ETA estimation ─────────────────────────────────────────────────
// Calibrated against historical pace (Sat May 23: 18 stops, 104 min total,
// avg 6.1 min per stop, same-building chains 20-90s, cross-park ~16 min).

function normalizeAddr(a) {
  return (a || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getStopSide(addr) {
  const a = (addr || "").toLowerCase();
  if (/\beast\b|\be\.?\s+\d/.test(a)) return "east";
  if (/\bwest\b|\bw\.?\s+\d/.test(a)) return "west";
  return "other";
}

function getCrossStreet(addr) {
  const m = (addr || "").match(/\b(\d+)(?:st|nd|rd|th)?\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// Default segment times — used until /api/eta-model returns learned values.
// Calibrated to actual May 23 pace; 7.5% buffer covers actual service time.
let ETA_PROFILE = {
  same_building: 1.5,
  same_side_near: 5,
  same_side_far: 7,
  cross_park: 11,
  lead_min: 4,
  buffer: 1.075,
};

export function applyEtaProfile(profile) {
  if (profile && typeof profile === "object") {
    ETA_PROFILE = { ...ETA_PROFILE, ...profile };
  }
}

// Total minutes from finishing `from` to finishing `to`. Combines drive +
// service into a single estimate (learned from history when available),
// inflated by buffer for realism.
function stopToStopMinutes(from, to) {
  if (!from || !to) return 0;
  let base;
  if (normalizeAddr(from.address) === normalizeAddr(to.address)) base = ETA_PROFILE.same_building;
  else {
    const aSide = getStopSide(from.address);
    const bSide = getStopSide(to.address);
    if (aSide !== bSide && aSide !== "other" && bSide !== "other") base = ETA_PROFILE.cross_park;
    else {
      const aCross = getCrossStreet(from.address);
      const bCross = getCrossStreet(to.address);
      if (aCross != null && bCross != null && Math.abs(aCross - bCross) > 15) base = ETA_PROFILE.same_side_far;
      else base = ETA_PROFILE.same_side_near;
    }
  }
  return base * ETA_PROFILE.buffer;
}

// Returns one ETA per stop. Anchors on the last completed stop's actual
// statusTime if any (so the schedule shifts when the driver is ahead/behind);
// otherwise anchors on "now" + 4 min lead (so the first ETA isn't immediately).
function computeRouteETAs(stops) {
  if (!stops || stops.length === 0) return { etas: [], totalMin: 0, finishTime: null };
  let anchorMs = Date.now();
  let firstPendingIdx = 0;
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].status !== "pending" && stops[i].statusTime) {
      const t = new Date(stops[i].statusTime).getTime();
      if (!isNaN(t)) { anchorMs = t; firstPendingIdx = i + 1; break; }
    }
  }
  const etas = [];
  let cursor = anchorMs;
  for (let i = 0; i < stops.length; i++) {
    if (i < firstPendingIdx) {
      etas.push({ eta: stops[i].statusTime ? new Date(stops[i].statusTime) : null, actual: true });
      continue;
    }
    if (i === firstPendingIdx && firstPendingIdx === 0) cursor += 4 * 60000; // lead time to first stop
    if (i > firstPendingIdx) cursor += stopToStopMinutes(stops[i - 1], stops[i]) * 60000;
    else if (i === firstPendingIdx && firstPendingIdx > 0) cursor += stopToStopMinutes(stops[i - 1], stops[i]) * 60000;
    etas.push({ eta: new Date(cursor), actual: false });
  }
  const firstPendingEtaMs = etas.find((e) => !e.actual)?.eta?.getTime() ?? anchorMs;
  return {
    etas,
    totalMin: Math.round((cursor - firstPendingEtaMs) / 60000),
    finishTime: new Date(cursor),
  };
}

function formatTimeET(d) {
  if (!d) return "—";
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function FullRouteList({ stops, onMove, onAddClick, saveStatus, dragIdx, onStartDrag, rowsRef, onReoptimize }) {
  const { etas, totalMin, finishTime } = computeRouteETAs(stops);
  const pendingCount = stops.filter((s) => s.status === "pending").length;
  const completedCount = stops.length - pendingCount;
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const totalLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return (
    <div style={s.fullList}>
      {stops.length > 0 && (
        <div style={s.etaSummary}>
          <div style={s.etaSummaryRow}>
            <div>
              <p style={s.etaSummaryLabel}>{pendingCount > 0 ? "Remaining" : "Route complete"}</p>
              <p style={s.etaSummaryValue}>{pendingCount > 0 ? totalLabel : "✓"}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={s.etaSummaryLabel}>Est. finish</p>
              <p style={s.etaSummaryValue}>{pendingCount > 0 ? formatTimeET(finishTime) : "—"}</p>
            </div>
          </div>
          <p style={s.etaSummaryHint}>
            {completedCount > 0
              ? `Times below project from your last completed stop. Drive a bit faster or slower and the estimates shift.`
              : `Estimates based on past route pace, starting from now.`}
          </p>
        </div>
      )}
      <div style={s.fullListHeader}>
        <p style={s.fullListHelp}>Drag <strong>⋮⋮</strong> handle to reorder fast, or use ▲▼ for single steps.</p>
        <span style={{
          fontSize: "11px",
          fontWeight: 700,
          color: saveStatus === "error" ? "#991B1B" : saveStatus === "saved" ? PALETTE.brand : PALETTE.muted,
        }}>
          {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : saveStatus === "error" ? "Error" : " "}
        </span>
        {onReoptimize && (
          <button onClick={onReoptimize} style={s.reoptimizeBtn} title="Re-run the Mapbox optimizer">
            ✨ Re-optimize
          </button>
        )}
      </div>
      {stops.map((stop, i) => {
        const isDropoff = stop.type === "dropoff";
        const accent = isDropoff ? PALETTE.dropoff : PALETTE.pickup;
        const accentSoft = isDropoff ? PALETTE.dropoffSoft : PALETTE.pickupSoft;
        const done = stop.status !== "pending";
        const isDriverAdded = stop.addedBy === "driver";
        const isDragging = dragIdx === i;
        const statusIcon =
          stop.status === "collected" ? "✓"
          : stop.status === "access_unavailable" ? "⊘"
          : stop.status === "no_bag" ? "○"
          : "";
        const statusLabel =
          stop.status === "collected" ? "Done"
          : stop.status === "access_unavailable" ? "No access"
          : stop.status === "no_bag" ? "No bag"
          : "";
        const isFirst = i === 0;
        const isLast = i === stops.length - 1;
        return (
          <div
            key={i}
            ref={(el) => { if (rowsRef) rowsRef.current[i] = el; }}
            style={{
              ...s.fullItem,
              opacity: isDragging ? 0.55 : (done ? 0.55 : 1),
              borderLeft: `4px solid ${accent}`,
              transform: isDragging ? "scale(1.025)" : "none",
              boxShadow: isDragging
                ? "0 14px 36px rgba(0,0,0,0.18), 0 3px 8px rgba(0,0,0,0.12)"
                : "none",
              zIndex: isDragging ? 10 : "auto",
              position: "relative",
              background: isDragging ? "#fff" : PALETTE.surface,
              transition: isDragging ? "none" : "transform 0.18s, box-shadow 0.18s, opacity 0.18s",
            }}
          >
            <div
              onTouchStart={onStartDrag ? onStartDrag(i) : undefined}
              onMouseDown={onStartDrag ? onStartDrag(i) : undefined}
              style={{
                ...s.dragHandle,
                background: isDragging ? PALETTE.brandSoft : "transparent",
                color: isDragging ? PALETTE.brandDark : PALETTE.muted,
                cursor: isDragging ? "grabbing" : "grab",
              }}
              title="Drag to reorder"
            >⋮⋮</div>
            <div style={s.arrowsCol}>
              <button
                onClick={() => onMove(i, -1)}
                disabled={isFirst}
                style={{ ...s.arrowBtn, opacity: isFirst ? 0.3 : 1 }}
                title="Move up"
              >▲</button>
              <button
                onClick={() => onMove(i, 1)}
                disabled={isLast}
                style={{ ...s.arrowBtn, opacity: isLast ? 0.3 : 1 }}
                title="Move down"
              >▼</button>
            </div>
            <div style={s.fullItemNum}>{i + 1}</div>
            <div style={s.fullItemBody}>
              <div style={s.fullItemAddr}>
                {stop.address}{stop.unit ? <span style={s.fullItemUnit}> · Unit {stop.unit}</span> : null}
                {isDriverAdded && (
                  <span style={s.driverAddedBadge}>YOU ADDED</span>
                )}
              </div>
              <div style={s.fullItemMeta}>
                {stop.entryMethod}
                {etas[i]?.eta && (
                  <span style={{
                    ...s.etaBadge,
                    color: etas[i].actual ? PALETTE.pickup : PALETTE.inkSoft,
                    background: etas[i].actual ? PALETTE.pickupSoft : "transparent",
                    border: etas[i].actual ? "none" : `1px solid ${PALETTE.border}`,
                  }}>
                    {etas[i].actual ? "✓" : "ETA"} {formatTimeET(etas[i].eta)}
                  </span>
                )}
              </div>
            </div>
            <div style={s.fullItemRight}>
              {done ? (
                <div style={{
                  ...s.fullItemStatus,
                  background: stop.status === "collected" ? PALETTE.pickupSoft : "#FEE2E2",
                  color: stop.status === "collected" ? PALETTE.pickup : "#991B1B",
                }}>
                  {statusIcon} {statusLabel}
                </div>
              ) : (
                <span style={{
                  ...s.typeMicroBadge,
                  background: accentSoft,
                  color: accent,
                }}>
                  {isDropoff ? "DROP" : "PICK"}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <button onClick={onAddClick} style={s.addStopBtn}>+ Add stop</button>
    </div>
  );
}

// ── Map view (Mapbox Static Images API — no extra JS bundle) ─────────────
// Fetches lat/lng for each stop via /api/route/geocode (Geocache-backed),
// then renders a single static map with numbered pins for the whole route
// plus a tappable stop list underneath. Each stop opens Google Maps
// directions on tap. Designed to load fast on cellular and work offline-ish
// (cached image, no map JS to download).
function MapView({ stops, pin, area, day, onSelect }) {
  const [geo, setGeo] = useState({});
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const uniqueAddrs = [...new Set(stops.map((x) => x.address).filter(Boolean))];
    fetch("/api/route/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: (pin || "").trim(), addresses: uniqueAddrs }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setGeo(d.results || {});
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    // Token is public-safe per Mapbox docs; we still gate via a tiny endpoint
    fetch("/api/route/map-token")
      .then((r) => r.json())
      .then((d) => !cancelled && setToken(d.token || null))
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stops, pin]);

  const pending = stops.filter((s) => s.status === "pending");
  const points = pending
    .map((s, i) => ({ stop: s, idx: i, g: geo[s.address] }))
    .filter((p) => p.g && p.g.status === "ok" && p.g.lat != null);

  // Build the Mapbox Static Image URL: numbered pins + polyline
  let imgSrc = null;
  if (token && points.length >= 1) {
    const pins = points
      .slice(0, 25)
      .map((p, i) => `pin-l-${i + 1}+7CB342(${p.g.lng.toFixed(5)},${p.g.lat.toFixed(5)})`)
      .join(",");
    // Polyline overlay (sequential)
    const path = points.length >= 2
      ? `,path-3+33691E(${points.slice(0, 25).map((p) => `${p.g.lng.toFixed(5)},${p.g.lat.toFixed(5)}`).join(",")})`
      : "";
    const w = 800;
    const h = 800;
    imgSrc = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins}${path}/auto/${w}x${h}@2x?access_token=${encodeURIComponent(token)}`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ background: PALETTE.surface, borderRadius: "14px", overflow: "hidden", border: `1px solid ${PALETTE.border}`, position: "relative" }}>
        {loading ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: PALETTE.muted }}>Loading map…</div>
        ) : imgSrc ? (
          <img src={imgSrc} alt="Route map" style={{ width: "100%", height: "auto", display: "block" }} />
        ) : (
          <div style={{ padding: "60px 20px", textAlign: "center", color: PALETTE.muted }}>
            {points.length === 0 ? "Map unavailable — geocoder hasn't resolved these stops yet." : "Map needs MAPBOX_TOKEN."}
          </div>
        )}
      </div>
      <div style={{ background: PALETTE.surface, borderRadius: "14px", border: `1px solid ${PALETTE.border}` }}>
        {pending.map((stop, i) => {
          const isDrop = stop.type === "dropoff";
          return (
            <button
              key={stop.key}
              onClick={() => onSelect?.(stop)}
              style={{
                width: "100%", textAlign: "left",
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 12px",
                borderTop: i === 0 ? "none" : `1px solid ${PALETTE.border}`,
                background: "transparent",
                fontFamily: "inherit", cursor: "pointer",
              }}
            >
              <span style={{
                width: "28px", height: "28px", borderRadius: "50%",
                background: isDrop ? PALETTE.dropoff : PALETTE.pickup,
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: 800, flexShrink: 0,
              }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "14px", color: PALETTE.ink }}>
                  {stop.address}{stop.unit ? ` · ${stop.unit}` : ""}
                </div>
                <div style={{ fontSize: "11px", color: PALETTE.muted }}>
                  {stop.entryMethod}
                </div>
              </div>
              <span style={{ fontSize: "16px", color: PALETTE.brand }}>↗</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DoneCard({ total, onShowFull }) {
  return (
    <div style={s.doneCard}>
      <div style={s.doneIconWrap}>
        <div style={s.doneIcon}>✓</div>
      </div>
      <h2 style={s.doneTitle}>Route complete</h2>
      <p style={s.doneSub}>{total} stops handled. Drive safe.</p>
      <button onClick={onShowFull} style={s.ghostBtn}>View Summary</button>
    </div>
  );
}

function IssueModal({ type, stop, onCancel, onSubmit, submitting, fileInputRef }) {
  const isAccess = type === "access_unavailable";
  const title = isAccess ? "Can't enter the building" : "No bag at the door";
  const desc = isAccess
    ? "Take a photo of the intercom panel to confirm you were here."
    : "Take a photo of the apartment door to confirm no bag was outside.";

  return (
    <div style={s.modalBackdrop}>
      <div style={s.modalCard}>
        <div style={s.modalAccent} />
        <h2 style={s.modalTitle}>{title}</h2>
        <p style={s.modalAddress}>{stop.address}{stop.unit ? ` · Unit ${stop.unit}` : ""}</p>
        <div style={s.modalDescBox}>
          <p style={s.modalDesc}>{desc}</p>
          <p style={s.modalDescSub}>
            We'll log the time and notify the tenant automatically.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSubmit(file);
          }}
          style={{ display: "none" }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          style={{
            ...s.primaryAction,
            background: `linear-gradient(135deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
            boxShadow: `0 8px 24px ${PALETTE.brand}40`,
            marginTop: "16px",
          }}
        >
          {submitting ? "Uploading..." : "Open Camera"}
        </button>

        <button onClick={onCancel} disabled={submitting} style={s.modalCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DropoffModal({ stop, onCancel, onSubmit, submitting, fileInputRef }) {
  return (
    <div style={s.modalBackdrop}>
      <div style={s.modalCard}>
        <div style={{ ...s.modalAccent, background: `linear-gradient(90deg, ${PALETTE.dropoff}, #8B0000)` }} />
        <h2 style={s.modalTitle}>Confirm drop-off</h2>
        <p style={s.modalAddress}>{stop.address}{stop.unit ? ` · Unit ${stop.unit}` : ""}</p>
        <div style={s.modalDescBox}>
          <p style={s.modalDesc}>Take a photo showing where you left the bag.</p>
          <p style={s.modalDescSub}>
            This is only stored internally as proof of delivery — the tenant won't be notified.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSubmit(file);
          }}
          style={{ display: "none" }}
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={submitting}
          style={{
            ...s.primaryAction,
            background: `linear-gradient(135deg, ${PALETTE.dropoff}, #8B0000)`,
            boxShadow: `0 8px 24px ${PALETTE.dropoff}40`,
            marginTop: "16px",
          }}
        >
          {submitting ? "Uploading..." : "Take Photo & Confirm"}
        </button>

        <button onClick={onCancel} disabled={submitting} style={s.modalCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function AddStopModal({ addressBook, onCancel, onSubmit }) {
  const [addr, setAddr] = useState("");
  const [unit, setUnit] = useState("");
  const [entry, setEntry] = useState("");
  const [type, setType] = useState("pickup");
  const [showAddr, setShowAddr] = useState(false);
  const [showUnits, setShowUnits] = useState(false);

  const lower = addr.toLowerCase();
  const addrMatches = lower.length < 2 ? [] : addressBook.filter((a) => a.address.toLowerCase().includes(lower)).slice(0, 6);
  const selected = addressBook.find((a) => a.address.toLowerCase() === lower);
  const unitOptions = selected ? selected.units : [];

  const pickAddress = (item) => {
    setAddr(item.address);
    setEntry(item.entryMethod || "");
    setShowAddr(false);
  };

  return (
    <div style={s.modalBackdrop}>
      <div style={s.modalCard}>
        <div style={s.modalAccent} />
        <h2 style={s.modalTitle}>Add a stop</h2>
        <p style={s.modalAddress}>This will appear in the route and the admin will see it.</p>

        <div style={s.formField}>
          <label style={s.formLabel}>ADDRESS</label>
          <input
            value={addr}
            onChange={(e) => { setAddr(e.target.value); setShowAddr(true); }}
            onFocus={() => setShowAddr(true)}
            onBlur={() => setTimeout(() => setShowAddr(false), 200)}
            placeholder="Start typing..."
            style={s.formInput}
          />
          {showAddr && addrMatches.length > 0 && (
            <div style={s.dropdown}>
              {addrMatches.map((item, i) => (
                <div key={i} onMouseDown={() => pickAddress(item)} style={s.dropdownItem}>{item.address}</div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <div style={{ ...s.formField, flex: 1 }}>
            <label style={s.formLabel}>UNIT</label>
            <input
              value={unit}
              onChange={(e) => { setUnit(e.target.value); setShowUnits(false); }}
              onFocus={() => setShowUnits(true)}
              onBlur={() => setTimeout(() => setShowUnits(false), 200)}
              placeholder="Unit"
              style={s.formInput}
            />
            {showUnits && unitOptions.length > 0 && (
              <div style={s.dropdown}>
                {unitOptions.map((u, i) => (
                  <div key={i} onMouseDown={() => { setUnit(u); setShowUnits(false); }} style={s.dropdownItem}>{u}</div>
                ))}
              </div>
            )}
          </div>
          <div style={{ ...s.formField, flex: 1 }}>
            <label style={s.formLabel}>TYPE</label>
            <div style={s.typeToggle}>
              <button
                onClick={() => setType("pickup")}
                style={{ ...s.typeToggleBtn, background: type === "pickup" ? PALETTE.pickup : "#fff", color: type === "pickup" ? "#fff" : "#666" }}
              >Pickup</button>
              <button
                onClick={() => setType("dropoff")}
                style={{ ...s.typeToggleBtn, background: type === "dropoff" ? PALETTE.dropoff : "#fff", color: type === "dropoff" ? "#fff" : "#666", borderLeft: "1px solid #e5e7eb" }}
              >Drop-off</button>
            </div>
          </div>
        </div>

        <div style={s.formField}>
          <label style={s.formLabel}>ACCESS METHOD</label>
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="Auto-fills if address is known"
            style={s.formInput}
          />
        </div>

        <button
          onClick={() => onSubmit({ address: addr, unit, entryMethod: entry, type })}
          disabled={!addr.trim()}
          style={{
            ...s.primaryAction,
            background: `linear-gradient(135deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
            boxShadow: `0 8px 24px ${PALETTE.brand}40`,
            marginTop: "12px",
            opacity: addr.trim() ? 1 : 0.4,
          }}
        >
          Add to route
        </button>

        <button onClick={onCancel} style={s.modalCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────

const s = {
  bg: {
    minHeight: "100vh",
    background: PALETTE.bg,
    padding: "16px 14px 32px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: PALETTE.ink,
  },
  appShell: { maxWidth: "560px", margin: "0 auto" },

  // ── Login ──
  loginShell: {
    maxWidth: "380px",
    margin: "10vh auto 0",
    background: PALETTE.surface,
    borderRadius: "24px",
    padding: "40px 32px",
    textAlign: "center",
    boxShadow: "0 24px 60px rgba(15, 26, 10, 0.06), 0 2px 8px rgba(15, 26, 10, 0.04)",
    border: `1px solid ${PALETTE.border}`,
  },
  loginLogo: {
    width: "72px",
    height: "72px",
    margin: "0 auto 20px",
    borderRadius: "20px",
    background: `linear-gradient(135deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 12px 32px ${PALETTE.brand}40`,
  },
  loginLogoMark: {
    width: "32px", height: "32px",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.95)",
    boxShadow: "inset 0 0 0 4px rgba(124, 179, 66, 0.2)",
  },
  brandMark: {
    margin: "0 0 12px", fontSize: "11px", fontWeight: 700,
    color: PALETTE.brand, letterSpacing: "3px", textTransform: "uppercase",
  },
  loginTitle: {
    margin: "0 0 8px", fontSize: "26px", fontWeight: 700,
    letterSpacing: "-0.3px", color: PALETTE.ink,
  },
  loginSub: {
    margin: "0 0 28px", fontSize: "14px",
    color: PALETTE.muted, lineHeight: 1.5,
  },
  pinInput: {
    width: "100%",
    padding: "18px 16px",
    fontSize: "32px",
    fontWeight: 600,
    textAlign: "center",
    letterSpacing: "16px",
    background: PALETTE.surfaceWarm,
    border: `1.5px solid ${PALETTE.border}`,
    borderRadius: "14px",
    boxSizing: "border-box",
    marginBottom: "16px",
    outline: "none",
    color: PALETTE.ink,
    fontFamily: "inherit",
    transition: "border-color 0.15s",
  },
  primaryBtn: {
    width: "100%",
    padding: "16px",
    background: `linear-gradient(135deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
    color: "#ffffff",
    border: "none",
    borderRadius: "14px",
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.2px",
    cursor: "pointer",
    boxShadow: `0 8px 24px ${PALETTE.brand}50`,
    transition: "transform 0.1s, opacity 0.2s",
  },
  errorText: {
    color: "#B91C1C", marginTop: "14px", fontSize: "13px", fontWeight: 500,
  },

  // ── Header ──
  header: {
    background: PALETTE.surface,
    borderRadius: "18px",
    padding: "16px 18px 18px",
    marginBottom: "12px",
    boxShadow: "0 1px 3px rgba(15, 26, 10, 0.04), 0 8px 24px rgba(15, 26, 10, 0.04)",
    border: `1px solid ${PALETTE.border}`,
  },
  headerTop: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px",
  },
  headerEyebrow: {
    margin: "0 0 4px", fontSize: "10px", fontWeight: 700,
    color: PALETTE.brand, letterSpacing: "1.8px",
  },
  headerTitle: {
    margin: 0, fontSize: "20px", fontWeight: 800,
    color: PALETTE.ink, letterSpacing: "-0.3px",
  },
  headerTotal: { fontWeight: 500, color: PALETTE.muted },
  signOutBtn: {
    width: "32px", height: "32px",
    border: "none", borderRadius: "50%",
    background: PALETTE.surfaceWarm,
    color: PALETTE.muted,
    fontSize: "14px", fontWeight: 600,
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  progressTrack: {
    marginTop: "14px",
    height: "5px",
    background: PALETTE.border,
    borderRadius: "3px",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: `linear-gradient(90deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
    borderRadius: "3px",
    transition: "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
  },

  // ── Error banner ──
  errorBanner: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#FEF2F2", color: "#991B1B",
    padding: "12px 16px",
    borderRadius: "12px", marginBottom: "12px",
    fontSize: "13px", fontWeight: 500,
    border: "1px solid #FECACA",
  },
  errorDismiss: {
    background: "none", border: "none", color: "#991B1B",
    cursor: "pointer", fontSize: "14px", padding: "0 4px",
  },

  // ── View toggle ──
  viewToggle: {
    display: "flex", padding: "4px",
    background: PALETTE.surface,
    borderRadius: "12px",
    marginBottom: "12px",
    border: `1px solid ${PALETTE.border}`,
    boxShadow: "0 1px 3px rgba(15, 26, 10, 0.03)",
  },
  toggleBtn: {
    flex: 1, padding: "10px 14px", border: "none",
    background: "transparent", color: PALETTE.muted,
    fontSize: "13px", fontWeight: 600, cursor: "pointer",
    borderRadius: "9px",
    transition: "all 0.15s",
  },
  toggleActive: {
    flex: 1, padding: "10px 14px", border: "none",
    background: PALETTE.ink, color: "#fff",
    fontSize: "13px", fontWeight: 700, cursor: "pointer",
    borderRadius: "9px",
    boxShadow: `0 2px 6px rgba(15, 26, 10, 0.15)`,
  },

  // ── Empty ──
  emptyCard: {
    background: PALETTE.surface, borderRadius: "18px",
    padding: "36px 24px", textAlign: "center",
    border: `1px solid ${PALETTE.border}`,
  },
  emptyText: { color: PALETTE.muted, margin: "0 0 14px" },

  // ── Test mode banner ──
  testModeBanner: {
    background: "#FFF8E1",
    border: "1px solid #FFD27A",
    borderRadius: "14px",
    padding: "12px 16px",
    margin: "0 0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  testModeBannerText: {
    flex: 1,
    minWidth: "180px",
    fontSize: "13px",
    color: "#7A4F00",
    lineHeight: 1.4,
  },
  testModeReset: {
    background: "#7A4F00",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    padding: "8px 14px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },

  // ── Stop Card (hero) ──
  stopCardWrap: { marginBottom: "12px" },
  stopCard: {
    background: PALETTE.surface,
    borderRadius: "20px",
    overflow: "hidden",
    border: "1px solid",
    boxShadow: "0 1px 3px rgba(15, 26, 10, 0.04), 0 12px 32px rgba(15, 26, 10, 0.06)",
  },
  typeRibbon: {
    color: "#ffffff",
    padding: "8px 18px",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "2px",
    textAlign: "center",
  },
  stopCardInner: { padding: "24px 22px" },
  stopCounter: {
    margin: "0 0 10px", fontSize: "10px", fontWeight: 700,
    color: PALETTE.muted, letterSpacing: "1.8px",
  },
  stopAddress: {
    margin: "0 0 6px", fontSize: "30px", fontWeight: 800,
    color: PALETTE.ink, lineHeight: 1.15, letterSpacing: "-0.5px",
  },
  stopUnit: {
    margin: "0 0 22px", fontSize: "18px", fontWeight: 600,
    color: PALETTE.inkSoft,
  },
  entryCard: {
    borderRadius: "14px",
    padding: "14px 18px",
    marginBottom: "22px",
  },
  entryLabel: {
    margin: "0 0 4px", fontSize: "10px", fontWeight: 700,
    letterSpacing: "1.6px", color: PALETTE.muted,
  },
  entryValue: {
    margin: 0, fontSize: "16px", fontWeight: 700,
    letterSpacing: "0.2px",
  },
  companionsCard: {
    background: "#FFF8E1",
    border: "1px solid #FFD27A",
    borderRadius: "14px",
    padding: "14px 16px",
    marginBottom: "22px",
  },
  companionsHeader: {
    display: "flex", alignItems: "flex-start", gap: "8px",
    fontSize: "14px", color: "#7A4F00", lineHeight: 1.35,
    marginBottom: "8px",
  },
  companionsIcon: {
    fontSize: "18px", lineHeight: 1, flexShrink: 0,
  },
  companionsSub: {
    margin: "0 0 10px", fontSize: "12px",
    color: "#7A4F00", lineHeight: 1.4,
  },
  companionsList: {
    listStyle: "none", padding: 0, margin: 0,
    display: "flex", flexDirection: "column", gap: "6px",
  },
  companionsItem: {
    display: "flex", alignItems: "center", gap: "10px",
    fontSize: "14px", color: PALETTE.ink,
    padding: "6px 0",
  },
  companionsTypeBadge: {
    fontSize: "10px", fontWeight: 800,
    padding: "3px 8px", borderRadius: "5px",
    letterSpacing: "1.2px", lineHeight: 1,
    minWidth: "42px", textAlign: "center",
  },
  companionsAddr: {
    fontWeight: 600,
  },
  companionsHint: {
    margin: "12px 0 0", fontSize: "12px",
    color: "#7A4F00", fontStyle: "italic", lineHeight: 1.4,
  },
  primaryAction: {
    width: "100%",
    padding: "18px",
    border: "none",
    borderRadius: "14px",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    letterSpacing: "0.3px",
    cursor: "pointer",
    transition: "transform 0.1s, box-shadow 0.2s",
    fontFamily: "inherit",
  },
  secondaryRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "8px",
    marginTop: "12px",
  },
  secondaryAction: {
    background: PALETTE.surfaceWarm,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: "12px",
    padding: "12px 6px",
    cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
    fontFamily: "inherit",
    transition: "background 0.15s, transform 0.1s",
  },
  secondaryIcon: {
    fontSize: "18px", fontWeight: 600, color: PALETTE.inkSoft,
    lineHeight: 1,
  },
  secondaryLabel: {
    fontSize: "11px", fontWeight: 600, color: PALETTE.inkSoft,
  },

  // ── Route ETA summary ──
  etaSummary: {
    background: `linear-gradient(135deg, ${PALETTE.brandSoft}, ${PALETTE.surfaceWarm})`,
    border: `1px solid ${PALETTE.border}`,
    borderRadius: "14px",
    padding: "14px 16px",
    marginBottom: "8px",
  },
  etaSummaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "16px",
  },
  etaSummaryLabel: {
    margin: 0,
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "1.4px",
    color: PALETTE.muted,
    textTransform: "uppercase",
  },
  etaSummaryValue: {
    margin: "2px 0 0",
    fontSize: "20px",
    fontWeight: 800,
    color: PALETTE.ink,
    letterSpacing: "-0.3px",
  },
  etaSummaryHint: {
    margin: "10px 0 0",
    fontSize: "11px",
    color: PALETTE.muted,
    fontStyle: "italic",
    lineHeight: 1.4,
  },
  etaBadge: {
    display: "inline-block",
    marginLeft: "8px",
    fontSize: "10px",
    fontWeight: 800,
    letterSpacing: "0.5px",
    padding: "2px 7px",
    borderRadius: "5px",
    verticalAlign: "middle",
  },

  // ── Full route list ──
  fullList: { display: "flex", flexDirection: "column", gap: "8px" },
  fullItem: {
    display: "flex", alignItems: "center", gap: "12px",
    padding: "12px 14px 12px 14px",
    background: PALETTE.surface,
    borderRadius: "12px",
    border: `1px solid ${PALETTE.border}`,
    transition: "opacity 0.2s",
  },
  fullItemNum: {
    width: "28px", height: "28px",
    background: PALETTE.surfaceWarm,
    borderRadius: "8px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "12px", fontWeight: 700, color: PALETTE.muted,
    flexShrink: 0,
  },
  fullItemBody: { flex: 1, minWidth: 0 },
  fullItemAddr: { fontSize: "14px", fontWeight: 700, color: PALETTE.ink, lineHeight: 1.3 },
  fullItemUnit: { fontWeight: 500, color: PALETTE.inkSoft },
  fullItemMeta: { fontSize: "12px", color: PALETTE.muted, marginTop: "2px" },
  fullItemRight: { display: "flex", alignItems: "center", flexShrink: 0 },
  fullItemStatus: {
    fontSize: "11px", fontWeight: 700,
    padding: "4px 10px", borderRadius: "20px",
    letterSpacing: "0.2px",
  },
  typeMicroBadge: {
    fontSize: "10px", fontWeight: 800,
    padding: "4px 8px", borderRadius: "6px",
    letterSpacing: "0.6px",
  },

  // ── Done ──
  doneCard: {
    background: PALETTE.surface,
    borderRadius: "20px",
    padding: "40px 28px",
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(15, 26, 10, 0.04), 0 12px 32px rgba(15, 26, 10, 0.06)",
    border: `1px solid ${PALETTE.border}`,
  },
  doneIconWrap: {
    width: "80px", height: "80px",
    margin: "0 auto 18px",
    borderRadius: "50%",
    background: `linear-gradient(135deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: `0 12px 32px ${PALETTE.brand}50`,
  },
  doneIcon: {
    color: "#ffffff", fontSize: "38px", fontWeight: 800, lineHeight: 1,
  },
  doneTitle: {
    margin: "0 0 6px", fontSize: "24px", fontWeight: 800,
    color: PALETTE.ink, letterSpacing: "-0.3px",
  },
  doneSub: {
    margin: "0 0 22px", color: PALETTE.muted, fontSize: "14px",
  },
  ghostBtn: {
    padding: "10px 22px",
    background: "transparent",
    border: `1.5px solid ${PALETTE.border}`,
    borderRadius: "12px",
    fontSize: "13px", fontWeight: 600,
    color: PALETTE.inkSoft,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  // ── Modal ──
  modalBackdrop: {
    position: "fixed", inset: 0,
    background: "rgba(15, 26, 10, 0.55)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
    padding: "16px", zIndex: 100,
  },
  modalCard: {
    background: PALETTE.surface,
    borderRadius: "20px",
    padding: "24px 22px 18px",
    maxWidth: "440px", width: "100%",
    boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
    position: "relative",
    overflow: "hidden",
  },
  modalAccent: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: "4px",
    background: `linear-gradient(90deg, ${PALETTE.brand}, ${PALETTE.brandDeep})`,
  },
  modalTitle: {
    margin: "8px 0 4px",
    fontSize: "22px", fontWeight: 800,
    color: PALETTE.ink, letterSpacing: "-0.3px",
  },
  modalAddress: {
    margin: "0 0 14px",
    fontSize: "14px", fontWeight: 600,
    color: PALETTE.inkSoft,
  },
  modalDescBox: {
    background: PALETTE.surfaceWarm,
    borderRadius: "12px",
    padding: "14px 16px",
  },
  modalDesc: { margin: "0 0 6px", fontSize: "14px", color: PALETTE.ink, fontWeight: 600, lineHeight: 1.4 },
  modalDescSub: { margin: 0, fontSize: "13px", color: PALETTE.muted, lineHeight: 1.5 },
  modalCancel: {
    width: "100%", padding: "12px", marginTop: "8px",
    background: "transparent", border: "none",
    color: PALETTE.muted, fontSize: "14px", fontWeight: 500,
    cursor: "pointer", fontFamily: "inherit",
  },

  // ── Full route list editing affordances ──
  fullListHeader: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "2px 4px 8px",
  },
  fullListHelp: { fontSize: "11px", color: PALETTE.muted, margin: 0 },
  reoptimizeBtn: {
    background: PALETTE.brand, color: "#fff", border: "none",
    borderRadius: "8px", padding: "6px 10px",
    fontSize: "11px", fontWeight: 800, cursor: "pointer",
    fontFamily: "inherit", marginLeft: "8px",
  },
  dragHandle: {
    width: "32px",
    minHeight: "44px",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: PALETTE.muted,
    fontSize: "20px", fontWeight: 700,
    lineHeight: 1,
    borderRadius: "8px",
    marginRight: "4px",
    flexShrink: 0,
    touchAction: "none",      // prevent browser from interpreting touch as scroll
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    transition: "background 0.15s",
  },
  arrowsCol: {
    display: "flex", flexDirection: "column", gap: "2px",
    flexShrink: 0,
  },
  arrowBtn: {
    width: "26px", height: "20px", padding: 0,
    border: `1px solid ${PALETTE.border}`,
    background: "#fff", color: PALETTE.brand,
    borderRadius: "5px", cursor: "pointer",
    fontSize: "10px", fontWeight: 700, lineHeight: 1,
    touchAction: "manipulation",
  },
  driverAddedBadge: {
    display: "inline-block",
    marginLeft: "6px",
    background: `${PALETTE.brand}26`,
    color: PALETTE.brandDark,
    padding: "2px 6px",
    borderRadius: "4px",
    fontSize: "9px",
    fontWeight: 800,
    letterSpacing: "0.5px",
    verticalAlign: "middle",
  },
  addStopBtn: {
    width: "100%",
    padding: "14px",
    background: "#fff",
    border: `1.5px dashed ${PALETTE.brand}`,
    borderRadius: "12px",
    color: PALETTE.brand,
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
    marginTop: "4px",
    fontFamily: "inherit",
  },

  // ── Add Stop form ──
  formField: {
    marginTop: "14px",
    position: "relative",
  },
  formLabel: {
    display: "block",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "1.5px",
    color: PALETTE.muted,
    marginBottom: "6px",
  },
  formInput: {
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${PALETTE.border}`,
    borderRadius: "10px",
    fontSize: "15px",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
    color: PALETTE.ink,
    background: "#fff",
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    background: "#fff",
    border: `1px solid ${PALETTE.border}`,
    borderRadius: "10px",
    marginTop: "4px",
    maxHeight: "180px",
    overflowY: "auto",
    zIndex: 150,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  },
  dropdownItem: {
    padding: "10px 14px",
    fontSize: "14px",
    cursor: "pointer",
    borderBottom: "1px solid #f5f5f5",
  },
  typeToggle: {
    display: "flex",
    border: `1.5px solid ${PALETTE.border}`,
    borderRadius: "10px",
    overflow: "hidden",
  },
  typeToggleBtn: {
    flex: 1,
    padding: "12px 8px",
    border: "none",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
