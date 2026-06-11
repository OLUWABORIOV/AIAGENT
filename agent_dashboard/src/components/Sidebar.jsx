export default function Sidebar({ active, setActive, apiStatus }) {
  const nav = [
    { id: "dashboard", icon: "ti-layout-dashboard", label: "Dashboard" },
    { id: "submit", icon: "ti-player-play", label: "Submit job", badge: "new" },
    { id: "history", icon: "ti-history", label: "Job history" },
  ];

  return (
    <aside
      style={{
        width: "var(--sidebar-w)",
        background: "var(--bg-surface)",
        borderRight: "0.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "18px 16px 14px",
          borderBottom: "0.5px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--accent-dim)",
            border: "0.5px solid var(--border-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 8,
          }}
        >
          <i
            className="ti ti-cpu"
            style={{ fontSize: 15, color: "var(--accent)" }}
          />
        </div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Agent Service</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          v0.1.0
        </div>
      </div>

      <div style={{ padding: "12px 10px 4px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0 6px",
            marginBottom: 4,
          }}
        >
          Main
        </div>
        {nav.map((n) => (
          <div
            key={n.id}
            onClick={() => setActive(n.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "7px 8px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12.5,
              color:
                active === n.id ? "var(--accent)" : "var(--text-secondary)",
              background: active === n.id ? "var(--accent-dim)" : "transparent",
              border:
                active === n.id
                  ? "0.5px solid var(--border-accent)"
                  : "0.5px solid transparent",
              marginBottom: 2,
            }}
          >
            <i className={`ti ${n.icon}`} style={{ fontSize: 15 }} />
            {n.label}
            {n.badge && (
              <span
                style={{
                  marginLeft: "auto",
                  background: "var(--accent)",
                  color: "#032b18",
                  fontSize: 10,
                  fontWeight: 500,
                  padding: "1px 6px",
                  borderRadius: 10,
                }}
              >
                {n.badge}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 10px 4px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            padding: "0 6px",
            marginBottom: 4,
          }}
        >
          Docs
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "7px 8px",
            borderRadius: 7,
            cursor: "pointer",
            fontSize: 12.5,
            color: "var(--text-secondary)",
          }}
        >
          <i className="ti ti-book" style={{ fontSize: 15 }} />
          API docs
          <i
            className="ti ti-external-link"
            style={{
              fontSize: 11,
              marginLeft: "auto",
              color: "var(--text-muted)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          padding: "12px 10px",
          borderTop: "0.5px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 8,
            borderRadius: 7,
            background: "var(--bg-elevated)",
          }}
        >
          <div
            style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background:
                  apiStatus === "online" ? "var(--accent)" : "var(--red)",
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
              System health
            </div>
            <div
              style={{
                fontSize: 12,
                color: apiStatus === "online" ? "var(--accent)" : "var(--red)",
                fontWeight: 500,
              }}
            >
              {apiStatus === "online" ? "API online" : "API offline"}
            </div>
          </div>
          <i
            className="ti ti-wifi-off"
            style={{ fontSize: 14, color: "var(--text-muted)" }}
          />
        </div>
      </div>
    </aside>
  );
}
