export default function Dashboard({
  stats = { total: 0, completed: 0, active: 0, cost: 0 },
}) {
  const cards = [
    {
      label: "Total jobs",
      value: stats.total,
      icon: "ti-chart-bar",
      color: "var(--blue)",
      bg: "rgba(74,158,255,0.12)",
    },
    {
      label: "Completed",
      value: stats.completed,
      icon: "ti-circle-check",
      color: "var(--accent)",
      bg: "rgba(31,200,130,0.12)",
    },
    {
      label: "Active",
      value: stats.active,
      icon: "ti-loader",
      color: "var(--purple)",
      bg: "rgba(155,127,255,0.12)",
    },
    {
      label: "Total cost",
      value: `$${Number(stats.cost).toFixed(4)}`,
      icon: "ti-coin",
      color: "var(--amber)",
      bg: "rgba(245,166,35,0.12)",
      accent: true,
    },
  ];

  const routes = [
    { method: "GET", path: "/health", desc: "Health check" },
    { method: "POST", path: "/v1/agent/run", desc: "Run agent" },
    { method: "GET", path: "/v1/agent/jobs/{id}", desc: "Get job" },
    { method: "GET", path: "/v1/agent/jobs", desc: "List jobs" },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 1,
          background: "var(--border)",
          borderBottom: "0.5px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            style={{
              background: "var(--bg-base)",
              padding: "14px 16px 12px",
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 500,
                color: "var(--text-muted)",
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 400,
                lineHeight: 1,
                color: c.accent ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              {c.value}
            </div>
            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 26,
                height: 26,
                borderRadius: 6,
                background: c.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <i
                className={`ti ${c.icon}`}
                style={{ fontSize: 13, color: c.color }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Info + Routes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderRight: "0.5px solid var(--border)",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <i className="ti ti-info-circle" style={{ fontSize: 13 }} /> Service
            info
          </div>
          {[
            {
              k: "Base URL",
              v: "http://localhost:8000",
              style: { color: "var(--accent)" },
            },
            { k: "API key", v: "dev-key-123" },
            { k: "Model", v: "claude-sonnet-4", pill: "purple" },
            { k: "Queue", v: "Redis + aio", pill: "amber" },
            { k: "Workers", v: "2 processes" },
            {
              k: "Avg response",
              v: "—",
              style: { color: "var(--text-muted)" },
            },
          ].map((row) => (
            <div
              key={row.k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "7px 0",
                borderBottom: "0.5px solid var(--border)",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {row.k}
              </span>
              {row.pill ? (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 5,
                    fontSize: 11,
                    fontFamily: "monospace",
                    background:
                      row.pill === "purple"
                        ? "rgba(155,127,255,0.15)"
                        : "rgba(245,166,35,0.13)",
                    color:
                      row.pill === "purple" ? "var(--purple)" : "var(--amber)",
                  }}
                >
                  {row.v}
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    ...row.style,
                  }}
                >
                  {row.v}
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={{ padding: "16px 18px", overflowY: "auto" }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: 12,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <i className="ti ti-route" style={{ fontSize: 13 }} /> API routes
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routes.map((r) => (
              <div
                key={r.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 7,
                  background: "var(--bg-surface)",
                  border: "0.5px solid var(--border)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    minWidth: 36,
                    textAlign: "center",
                    background:
                      r.method === "POST"
                        ? "rgba(74,158,255,0.15)"
                        : "rgba(31,200,130,0.15)",
                    color:
                      r.method === "POST" ? "var(--blue)" : "var(--accent)",
                  }}
                >
                  {r.method}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "monospace",
                    color: "var(--text-primary)",
                  }}
                >
                  {r.path}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    marginLeft: "auto",
                  }}
                >
                  {r.desc}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 10,
              fontSize: 12,
              color: "var(--accent)",
              cursor: "pointer",
            }}
          >
            <i className="ti ti-book-2" style={{ fontSize: 13 }} /> Open
            interactive docs →
          </div>
        </div>
      </div>
    </div>
  );
}
