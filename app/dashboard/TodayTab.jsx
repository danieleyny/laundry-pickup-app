"use client";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, Badge, StatTile, ProgressBar, EmptyState, Modal, Lightbox } from "../components/ui";

const AREA = {
  uptown: { day1: "Friday", day2: "Saturday" },
  downtown: { day1: "Tuesday", day2: "Thursday" },
};

function todayET() {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function todayName() {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][todayET().getDay()];
}

export function TodayTab({ pin, area, settings, onLoadSettings, apiFetch }) {
  const config = AREA[area];
  const day = useMemo(() => {
    const t = todayName();
    if (t === config.day1 || t === config.day2) return t;
    return config.day1; // default preview
  }, [area]);
  const isPickupDay = day === todayName();

  const [tracking, setTracking] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const [sendConfirm, setSendConfirm] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  const loadTracking = async () => {
    setTrackingLoading(true);
    try {
      const data = await apiFetch("/api/admin/driver-tracking", { area, day });
      setTracking(data);
    } catch (e) {
      // swallow — surface in UI as empty
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    loadTracking();
    if (!isPickupDay) return;
    const id = setInterval(loadTracking, 60000); // auto-refresh on pickup days
    return () => clearInterval(id);
  }, [area, day]);

  useEffect(() => {
    if (!settings) onLoadSettings?.();
  }, []);

  const sendNow = async (day) => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/admin/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, area, day }),
      });
      const data = await res.json().catch(() => ({}));
      setSendResult(data);
    } catch (e) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSending(false);
    }
  };

  const lastCron = settings?.last_cron_run_time
    ? new Date(settings.last_cron_run_time).toLocaleString("en-US", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <Card>
        <CardBody className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Automation</div>
            <div className="text-lg font-extrabold text-ink mt-1">
              {settings?.email_scheduling_enabled ? "✅ ON" : "⚠️ OFF"}
              <span className="ml-3 text-sm font-bold text-muted">
                {settings?.email_scheduling_enabled
                  ? "Next reminder fires at 7:20 AM ET on the next pickup day"
                  : "Customers will not get a reminder until you re-enable this"}
              </span>
            </div>
          </div>
          <div className="text-xs text-muted text-right">
            Last cron run<br />
            <span className="font-bold text-ink-soft">{lastCron}</span>
            {settings?.last_cron_run_status && (
              <Badge tone={settings.last_cron_run_status === "success" ? "success" : "danger"} className="ml-2">
                {settings.last_cron_run_status}
              </Badge>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Today's route hero */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">
                {isPickupDay ? "Today's route" : "Next route preview"}
              </p>
              <h2 className="m-0 mt-1 text-2xl font-extrabold text-ink">
                {day} <span className="text-muted font-bold">· {area}</span>
              </h2>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={loadTracking} disabled={trackingLoading}>
                {trackingLoading ? "Loading…" : "Refresh"}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setSendConfirm(day)}>
                ✉️ Send reminders now
              </Button>
            </div>
          </div>

          {tracking ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatTile label="Total stops" value={tracking.totalCount || 0} />
                <StatTile label="Completed" value={tracking.completedCount || 0} tone="brand" />
                <StatTile label="Collections" value={tracking.collectionCount || 0} tone="brand" />
                <StatTile label="Issues" value={tracking.issueCount || 0} tone="danger" />
              </div>
              <ProgressBar value={tracking.completedCount || 0} total={tracking.totalCount || 1} className="mb-5" />

              {tracking.lateSignupCount > 0 && (
                <div className="mb-4 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-xs text-yellow-900">
                  ⏰ <strong>{tracking.lateSignupCount}</strong> late signup{tracking.lateSignupCount === 1 ? "" : "s"} added since the morning send.
                </div>
              )}

              <div className="rounded-xl border border-ldn-border overflow-hidden">
                <div className="flex items-center px-3 py-2 bg-surface-warm text-[10px] font-extrabold tracking-wider uppercase text-muted">
                  <div className="w-7">#</div>
                  <div className="flex-[2] min-w-0">Address</div>
                  <div className="flex-1">Status</div>
                  <div className="flex-1">Time</div>
                  <div className="w-16 text-center">Photos</div>
                </div>
                {(tracking.stops || []).map((s, i) => {
                  const t = s.statusTime
                    ? new Date(s.statusTime).toLocaleTimeString("en-US", {
                        timeZone: "America/New_York",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })
                    : "—";
                  const isCollected = s.status === "collected";
                  const isIssue = s.status === "access_unavailable" || s.status === "no_bag";
                  const isCurrent = i === tracking.currentStopIdx;
                  return (
                    <div
                      key={i}
                      className={
                        "flex items-center px-3 py-2 border-b border-ldn-border last:border-b-0 text-xs " +
                        (isCurrent ? "bg-blue-50 border-l-4 border-l-blue-500 pl-2" : "")
                      }
                    >
                      <div className="w-7 text-muted font-bold">{i + 1}</div>
                      <div className="flex-[2] min-w-0">
                        <div className="font-bold text-ink truncate">
                          {s.address}
                          {s.unit && <span className="text-muted font-medium"> · Unit {s.unit}</span>}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted">
                          {s.entryMethod}
                          {s.addedBy === "driver" && <Badge tone="success">Driver</Badge>}
                          {(s.addedBy === "late-signup" || s.addedBy === "late-signup-mirror") && <Badge tone="warn">Late</Badge>}
                          {(s.addedBy === "admin" || s.addedBy === "admin-mirror") && <Badge tone="brand">Admin</Badge>}
                          {s.type === "dropoff" && <Badge tone="dropoff">DROP</Badge>}
                        </div>
                      </div>
                      <div className="flex-1">
                        {isCollected ? <Badge tone="success">✓ Done</Badge>
                          : isIssue ? <Badge tone="danger">⊘ {s.status === "no_bag" ? "No bag" : "No access"}</Badge>
                          : isCurrent ? <Badge tone="brand">→ Current</Badge>
                          : <Badge tone="neutral">Pending</Badge>}
                      </div>
                      <div className="flex-1 text-muted text-[11px]">{t}</div>
                      <div className="w-16 flex justify-center gap-1">
                        {s.photoUrl && (
                          <button onClick={() => setLightboxUrl(s.photoUrl)} className="relative" title="Issue photo">
                            <img src={s.photoUrl} alt="" className="w-8 h-8 object-cover rounded border border-dropoff" />
                            <span className="absolute -top-1 -right-1 bg-dropoff text-white text-[7px] font-extrabold px-1 rounded">!</span>
                          </button>
                        )}
                        {s.dropoffPhotoUrl && (
                          <button onClick={() => setLightboxUrl(s.dropoffPhotoUrl)} className="relative" title="Drop-off proof">
                            <img src={s.dropoffPhotoUrl} alt="" className="w-8 h-8 object-cover rounded border border-pickup" />
                            <span className="absolute -top-1 -right-1 bg-pickup text-white text-[7px] font-extrabold px-1 rounded">D</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : trackingLoading ? (
            <p className="text-center text-muted py-12">Loading route…</p>
          ) : (
            <EmptyState
              icon="📭"
              title="No stops yet"
              description={`No confirmations have come in for ${day}. Once customers confirm, they'll appear here.`}
            />
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!sendConfirm}
        onClose={() => { setSendConfirm(null); setSendResult(null); }}
        title="Send reminders now"
      >
        {sendResult ? (
          <div>
            {sendResult.ok ? (
              <>
                <p className="text-base text-ink">✅ Reminders sent.</p>
                <pre className="mt-3 text-xs bg-surface-warm p-3 rounded-lg overflow-auto">{JSON.stringify(sendResult.cronResponse?.results || sendResult.cronResponse, null, 2)}</pre>
              </>
            ) : (
              <p className="text-base text-dropoff">❌ {sendResult.error || "Failed."}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="primary" onClick={() => { setSendConfirm(null); setSendResult(null); }}>Close</Button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-base text-ink-soft">
              This will send the <strong>{sendConfirm}</strong> reminder email for <strong>{area}</strong> via Resend, using the exact same code path as the 7:20 AM ET cron. Recipients are pulled live from confirmations + opt-outs.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSendConfirm(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => sendNow(sendConfirm)} disabled={sending}>
                {sending ? "Sending…" : "Yes, send now"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </div>
  );
}
