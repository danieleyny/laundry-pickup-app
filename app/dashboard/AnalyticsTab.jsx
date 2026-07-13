"use client";
import { useEffect, useState } from "react";
import { Card, CardBody, StatTile, EmptyState, Badge } from "../components/ui";

export function AnalyticsTab({ pin, area, apiFetch }) {
  const [stats, setStats] = useState(null);
  const [bounces, setBounces] = useState(null);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiFetch("/api/driver-stats").catch(() => null),
      apiFetch("/api/admin/bounces").catch(() => null),
      apiFetch("/api/admin/retention", { area }).catch(() => null),
    ]).then(([s, b, r]) => {
      if (cancelled) return;
      setStats(s);
      setBounces(b);
      setRetention(r);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [area]);

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
          <p className="m-0 text-[10px] font-extrabold uppercase tracking-wider text-muted">Driver stats</p>
          <h2 className="m-0 mt-1 text-xl font-extrabold text-ink mb-4">Last 30 days</h2>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Stops handled" value={stats.totalStops ?? 0} />
              <StatTile label="Collected" value={stats.collectedCount ?? 0} tone="brand" />
              <StatTile label="No bag" value={stats.noBagCount ?? 0} tone="warn" />
              <StatTile label="Avg per stop" value={stats.avgPerStopMin ? `${stats.avgPerStopMin}m` : "—"} />
              {stats.dataQuality && (
                <StatTile label="Routes used (timing)" value={`${stats.dataQuality.cleanRoutes}/${stats.dataQuality.totalRoutes}`} sublabel={`${stats.dataQuality.outlierRoutes} excluded`} />
              )}
            </div>
          ) : (
            <p className="text-muted text-sm">{loading ? "Loading…" : "No driver activity yet"}</p>
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
