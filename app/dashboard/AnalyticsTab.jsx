"use client";
import { useEffect, useState } from "react";
import { Card, CardBody, StatTile, EmptyState, Badge } from "../components/ui";

export function AnalyticsTab({ pin, area, apiFetch }) {
  const [stats, setStats] = useState(null);
  const [bounces, setBounces] = useState(null);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statsWindow, setStatsWindow] = useState("30"); // "7" | "30" | "365" | "all"
  const [statsArea, setStatsArea] = useState("all"); // "all" | "downtown" | "uptown"
  const [statsClean, setStatsClean] = useState(true); // exclude bulk-confirmed routes from timing

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/admin/bounces").catch(() => null),
      apiFetch("/api/admin/retention", { area }).catch(() => null),
    ]).then(([b, r]) => {
      if (cancelled) return;
      setBounces(b);
      setRetention(r);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [area]);

  // Driver stats: refetch whenever the window, area, or outlier toggle changes.
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/driver-stats", { days: statsWindow, area: statsArea, clean: statsClean ? "1" : "0" })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [statsWindow, statsArea, statsClean, apiFetch]);

  return (
    <div className="space-y-5">
      {/* Retention */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Retention</p>
              <h2 className="m-0 mt-1 text-xl font-extrabold text-ink">Customer engagement</h2>
            </div>
          </div>

          {retention ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <StatTile label="Total customers" value={retention.totalCustomers ?? 0} />
                <StatTile label="Active (last 4 wks)" value={retention.activeCustomerCount ?? 0} tone="brand" />
                <StatTile label="Stale 8+ weeks" value={retention.staleCustomers?.length ?? 0} tone="warn" />
                <StatTile label="Opt-outs" value={retention.optOutCount ?? 0} tone="danger" />
              </div>

              {retention.confirmationsByWeek?.length > 0 && (
                <div className="mt-4">
                  <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted mb-2">Confirmations per week (last 12)</p>
                  <SparkBars data={retention.confirmationsByWeek} />
                </div>
              )}

              {retention.winBackCandidates?.length > 0 && (
                <div className="mt-6">
                  <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Win-back candidates ({retention.winBackCandidates.length})</p>
                  <p className="m-0 mt-1 text-xs text-muted mb-3">Previously active customers who've been quiet 6+ weeks. Worth a personal reach-out.</p>
                  <div className="rounded-xl border border-ldn-border overflow-hidden max-h-72 overflow-y-auto">
                    {retention.winBackCandidates.slice(0, 25).map((c, i) => (
                      <div key={i} className="px-3 py-2 border-b border-ldn-border last:border-b-0 text-xs flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-ink truncate">{c.address}{c.unit && ` · ${c.unit}`}</div>
                          <div className="text-muted truncate">{c.name}</div>
                        </div>
                        <div className="text-muted text-[10px] text-right">
                          {c.lastConfirmedDate !== "never"
                            ? new Date(c.lastConfirmedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                            : "never"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted text-sm py-4">{loading ? "Loading…" : "No data available"}</p>
          )}
        </CardBody>
      </Card>

      {/* Driver stats */}
      <Card>
        <CardBody>
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Driver stats</p>
              <h2 className="m-0 mt-1 text-xl font-extrabold text-ink capitalize">
                {stats?.window?.label || "All time"}
                {stats?.area && stats.area !== "all" ? ` · ${stats.area}` : ""}
              </h2>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex rounded-lg border border-ldn-border overflow-hidden text-xs font-bold">
                {[{ k: "7", label: "Week" }, { k: "30", label: "Month" }, { k: "365", label: "12 mo" }, { k: "all", label: "All" }].map((opt) => (
                  <button key={opt.k} onClick={() => setStatsWindow(opt.k)}
                    className={"px-3 py-1.5 transition " + (statsWindow === opt.k ? "bg-brand text-white" : "bg-transparent text-muted hover:text-ink")}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-ldn-border overflow-hidden text-xs font-bold">
                  {[{ k: "all", label: "Both" }, { k: "downtown", label: "Downtown" }, { k: "uptown", label: "Uptown" }].map((opt) => (
                    <button key={opt.k} onClick={() => setStatsArea(opt.k)}
                      className={"px-3 py-1.5 transition " + (statsArea === opt.k ? "bg-brand text-white" : "bg-transparent text-muted hover:text-ink")}>
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setStatsClean((v) => !v)}
                  title="Exclude bulk-confirmed routes (driver batch-marked stops) from timing"
                  className={"px-3 py-1.5 rounded-lg border text-xs font-bold transition " + (statsClean ? "bg-brand/10 border-brand text-brand" : "border-ldn-border text-muted hover:text-ink")}>
                  {statsClean ? "✓ Outliers excluded" : "All routes"}
                </button>
              </div>
            </div>
          </div>
          {stats && stats.totalStops > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Stops handled" value={stats.totalStops ?? 0} />
                <StatTile label="Avg route time" value={fmtDur(stats.summary?.avgRouteDurationMin)} tone="brand" />
                <StatTile label="Avg per stop" value={stats.avgPerStopMin ? `${stats.avgPerStopMin}m` : "—"} />
                <StatTile label="Collected" value={stats.collectedCount ?? 0} />
                <StatTile label="Avg stops / day" value={stats.avgStopsPerDay ?? 0} />
                <StatTile label="Avg stops / week" value={stats.avgStopsPerWeek ?? 0} />
                <StatTile label="Access issues" value={stats.accessCount ?? 0} tone="warn" />
                <StatTile label="Not delivered" value={stats.deliveryFailedCount ?? 0} tone="danger" />
              </div>

              {stats.byDay?.length > 0 && (
                <div className="mt-5">
                  <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted mb-2">Time per route day</p>
                  <div className="rounded-xl border border-ldn-border overflow-hidden">
                    <div className="grid grid-cols-[1.6fr_0.7fr_0.9fr_1.3fr] px-3 py-2 text-[10px] font-extrabold uppercase tracking-wider text-muted border-b border-ldn-border">
                      <div>Day</div>
                      <div className="text-right">Routes</div>
                      <div className="text-right">Avg stops</div>
                      <div className="text-right">Avg total time</div>
                    </div>
                    {stats.byDay.map((d, i) => (
                      <div key={i} className="grid grid-cols-[1.6fr_0.7fr_0.9fr_1.3fr] px-3 py-2 text-xs border-b border-ldn-border last:border-b-0 items-center">
                        <div className="font-bold text-ink capitalize truncate">{d.area} · {d.day}</div>
                        <div className="text-right text-muted">{d.routes}</div>
                        <div className="text-right">{d.avgStops}</div>
                        <div className="text-right font-bold text-ink">
                          {fmtDur(d.avgDurationMin)}
                          {d.avgMinutesPerStop != null && <span className="text-muted font-normal"> · {d.avgMinutesPerStop}m/stop</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="m-0 mt-3 text-[11px] text-muted">
                {stats.window?.numDays ?? 0} operating days · {stats.window?.numWeeks ?? 0} weeks · {stats.summary?.totalRoutes ?? 0} routes
                {statsClean && stats.bulkExcludedRoutes > 0
                  ? ` · timing excludes ${stats.bulkExcludedRoutes} bulk-confirmed route${stats.bulkExcludedRoutes === 1 ? "" : "s"}`
                  : ""}
              </p>
            </>
          ) : (
            <p className="text-muted text-sm">
              {stats ? "No driver activity in this period" : loading ? "Loading…" : "No driver activity yet"}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Email bounces */}
      <Card>
        <CardBody>
          <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Email health</p>
          <h2 className="m-0 mt-1 text-xl font-extrabold text-ink mb-4">Bounces & complaints</h2>
          {bounces ? (
            bounces.total === 0 ? (
              <p className="text-muted text-sm">No bounces or complaints recorded. Either email is delivering cleanly, or the Resend webhook isn't configured.</p>
            ) : (
              <div className="rounded-xl border border-ldn-border overflow-hidden">
                {bounces.bounces.slice(0, 20).map((b, i) => (
                  <div key={i} className="px-3 py-2 border-b border-ldn-border last:border-b-0 text-xs flex items-center gap-3">
                    <div className="flex-1 min-w-0 truncate text-ink-soft">{b.email}</div>
                    <Badge tone={b.eventType === "complained" ? "danger" : "warn"}>{b.eventType?.toUpperCase()}</Badge>
                    <div className="text-muted text-[10px] truncate flex-1">{b.bounceType || b.reason}</div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <p className="text-muted text-sm">{loading ? "Loading…" : "—"}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function fmtDur(min) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function SparkBars({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d) => {
        const h = Math.max(4, Math.round((d.count / max) * 100));
        return (
          <div key={d.weekId} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="w-full bg-brand rounded-t-sm transition" style={{ height: `${h}%` }} title={`${d.weekId}: ${d.count}`} />
            <div className="text-[9px] text-muted font-bold">{d.weekId.slice(-3)}</div>
          </div>
        );
      })}
    </div>
  );
}
