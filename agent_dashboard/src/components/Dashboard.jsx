import React from "react";
import StatusPill from "./StatusPill";

const routes = [
  {
    method: "GET",
    path: "/health",
    label: "Service health",
    detail: "Status and API version",
    access: "Public",
  },
  {
    method: "POST",
    path: "/v1/agent/run",
    label: "Submit a task",
    detail: "Queues work · returns 202",
    access: "API key",
  },
  {
    method: "GET",
    path: "/v1/agent/jobs/{job_id}",
    label: "Check task result",
    detail: "Status, answer and usage",
    access: "API key",
  },
  {
    method: "GET",
    path: "/v1/agent/jobs?user_id=…",
    label: "Count active tasks",
    detail: "Count only · not task history",
    access: "API key",
  },
];

function formatTime(timestamp) {
  if (!timestamp) return "Just now";
  const elapsed = Math.max(0, Date.now() - timestamp);
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  return `${Math.floor(elapsed / 3_600_000)}h ago`;
}

export default function Dashboard({
  jobs = [],
  apiStatus = "offline",
  onSubmit,
  onHistory,
}) {
  const completed = jobs.filter((job) => job.status === "completed").length;
  const active = jobs.filter(
    (job) => job.status === "running" || job.status === "queued",
  ).length;
  const cost = jobs.reduce((total, job) => total + (Number(job.cost_usd) || 0), 0);
  const stats = [
    { label: "Tasks this visit", value: jobs.length, icon: "ti-stack-2" },
    { label: "Completed", value: completed, icon: "ti-circle-check" },
    { label: "In progress", value: active, icon: "ti-loader-2" },
    { label: "Spend this visit", value: `$${cost.toFixed(4)}`, icon: "ti-coin" },
  ];
  const recentJobs = jobs.slice(0, 4);

  return (
    <div className="dashboard-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">YOUR WORKSPACE</span>
          <h1>Good work starts here.</h1>
          <p>Give your agent a task. Follow its progress. Keep moving.</p>
        </div>
        <button className="button button-primary" onClick={onSubmit}>
          <i className="ti ti-plus" aria-hidden="true" />
          Start a new task
        </button>
      </header>

      <section className="agent-hero" aria-label="Agent introduction">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className={`health-dot ${apiStatus}`} />
            {apiStatus === "online" ? "YOUR AGENT IS READY" : "AGENT CONNECTION"}
          </div>
          <h2>A little focus.<br />A lot more done.</h2>
          <p>
            Send a question or task to your AI agent and let it work quietly in
            the background.
          </p>
          <button className="button button-cream" onClick={onSubmit}>
            Talk to your agent <i className="ti ti-arrow-up-right" aria-hidden="true" />
          </button>
        </div>
        <img
          className="agent-art"
          src="/agent-mark.png"
          alt="Moonlit tree and crimson field emblem"
        />
        <div className="hero-note">
          <span className="hero-note-label">SERVICE STATUS</span>
          <strong>{apiStatus === "online" ? "All systems ready" : "Waiting for connection"}</strong>
          <span>Health check · every 10 seconds</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Session overview">
        {stats.map((stat, index) => (
          <article className={`stat-card stat-card-${index + 1}`} key={stat.label}>
            <div className="stat-icon"><i className={`ti ${stat.icon}`} aria-hidden="true" /></div>
            <span className="stat-label">{stat.label}</span>
            <strong className="stat-value">{stat.value}</strong>
          </article>
        ))}
      </section>

      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">IN THE WORKROOM</span>
              <h2>Recent tasks</h2>
            </div>
            <button className="text-button" onClick={onHistory}>
              See all <i className="ti ti-arrow-right" aria-hidden="true" />
            </button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><i className="ti ti-coffee" aria-hidden="true" /></div>
              <strong>Nothing brewing just yet</strong>
              <p>Your submitted tasks will show up here as they run.</p>
              <button className="text-button" onClick={onSubmit}>Create your first task <i className="ti ti-arrow-right" aria-hidden="true" /></button>
            </div>
          ) : (
            <div className="recent-list">
              {recentJobs.map((job) => (
                <button className="recent-row" key={job.job_id} onClick={onHistory}>
                  <span className="job-glyph"><i className="ti ti-sparkles" aria-hidden="true" /></span>
                  <span className="recent-description">
                    <strong>{job.question || "Untitled task"}</strong>
                    <small>{formatTime(job._submittedAt)}</small>
                  </span>
                  <StatusPill status={job.status} />
                  <i className="ti ti-chevron-right recent-chevron" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="panel service-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">UNDER THE HOOD</span>
              <h2>Agent service</h2>
            </div>
            <span className={`service-badge ${apiStatus}`}>
              <span className="health-dot" />{apiStatus === "online" ? "Online" : "Offline"}
            </span>
          </div>
          <div className="service-details">
            <div><span>Model</span><strong>Gemini · backend config</strong></div>
            <div><span>Queue</span><strong>Redis + arq</strong></div>
            <div><span>Workers</span><strong>2 processes</strong></div>
          </div>
          <div className="route-directory">
            <div className="route-directory-heading">
              <span className="route-directory-icon">
                <i className="ti ti-route" aria-hidden="true" />
              </span>
              <div>
                <span className="route-heading">API SURFACE</span>
                <h3>Route directory</h3>
              </div>
              <span className="route-count">04 routes</span>
            </div>
            <div className="route-list">
              {routes.map((route) => (
                <article className="route-row" key={route.path}>
                  <span className={`method-tag ${route.method.toLowerCase()}`}>{route.method}</span>
                  <div className="route-content">
                    <div className="route-topline">
                      <code>{route.path}</code>
                      <span className={`route-access ${route.access === "Public" ? "public" : ""}`}>
                        {route.access}
                      </span>
                    </div>
                    <div className="route-purpose">
                      <strong>{route.label}</strong>
                      <span>{route.detail}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      </div>
      <footer className="dashboard-footer">
        <span>Made for thoughtful work.</span>
        <span>Agent Service <i className="ti ti-point-filled" aria-hidden="true" /> v0.1.0</span>
      </footer>
    </div>
  );
}
