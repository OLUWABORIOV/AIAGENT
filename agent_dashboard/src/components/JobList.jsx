import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Clock3, Search, Wallet } from "lucide-react";
import StatusPill from "./StatusPill";

const filters = [
  { id: "all", label: "All tasks" },
  { id: "running", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Needs attention" },
];

function formatDate(date) {
  if (!date) return "Recently submitted";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "Recently submitted";
  return parsedDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TaskDetails({ job }) {
  return (
    <div className="task-details">
      {(job.status === "queued" || job.status === "running") && (
        <div className="task-progress-note">
          <span className="health-dot online" />
          Your agent is working on this. This view updates automatically.
        </div>
      )}
      {job._pollError && (
        <div className="task-refresh-note" role="status">
          <i className="ti ti-refresh" aria-hidden="true" />
          Couldn’t refresh this task just now. We’ll try again automatically.
        </div>
      )}
      {job.status === "failed" && (
        <div className="task-error-note">
          <strong>This task couldn’t be completed.</strong>
          <span>{job.error || "The service didn’t return an error description."}</span>
        </div>
      )}
      {job.status === "cancelled" && (
        <div className="task-cancelled-note">This task was cancelled.</div>
      )}
      {job.status === "unavailable" && (
        <div className="task-error-note">
          <strong>This task result is no longer available.</strong>
          <span>The service has expired or removed the saved result.</span>
        </div>
      )}
      {job.answer && (
        <div className="task-answer">
          <span className="task-detail-label">AGENT RESPONSE</span>
          <p>{job.answer}</p>
        </div>
      )}
      <div className="task-metrics">
        <span><strong>Started</strong>{formatDate(job.created_at || job._submittedAt)}</span>
        {job.duration_secs > 0 && <span><strong>Duration</strong>{Number(job.duration_secs).toFixed(1)} sec</span>}
        {(job.input_tokens > 0 || job.output_tokens > 0) && (
          <span><strong>Tokens</strong>{Number(job.input_tokens || 0).toLocaleString()} in · {Number(job.output_tokens || 0).toLocaleString()} out</span>
        )}
        {job.cost_usd > 0 && <span><strong>Cost</strong>${Number(job.cost_usd).toFixed(4)}</span>}
        <span className="task-id"><strong>Task ID</strong><code title={job.job_id}>{job.job_id}</code></span>
      </div>
    </div>
  );
}

export default function JobList({ jobs = [], onNewTask }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const counts = useMemo(() => ({
    all: jobs.length,
    running: jobs.filter((job) => job.status === "queued" || job.status === "running").length,
    completed: jobs.filter((job) => job.status === "completed").length,
    failed: jobs.filter((job) => ["failed", "cancelled", "unavailable"].includes(job.status)).length,
  }), [jobs]);
  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const matchesFilter = filter === "all"
      || (filter === "running" && (job.status === "queued" || job.status === "running"))
      || (filter === "failed" && ["failed", "cancelled", "unavailable"].includes(job.status))
      || job.status === filter;
    const matchesSearch = !search.trim()
      || `${job.question || ""} ${job.job_id || ""}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesFilter && matchesSearch;
  }), [filter, jobs, search]);

  return (
    <div className="screen-page history-page fade-in">
      <header className="screen-heading">
        <div>
          <span className="eyebrow">YOUR WORKROOM</span>
          <h1>Task history</h1>
          <p>Follow active work and revisit answers from this tab.</p>
        </div>
        <button className="button button-primary" onClick={onNewTask}>
          <i className="ti ti-plus" aria-hidden="true" /> New task
        </button>
      </header>

      <section className="history-summary" aria-label="Task counts">
        <div><span className="history-summary-icon"><i className="ti ti-stack-2" aria-hidden="true" /></span><span><strong>{jobs.length}</strong><small>Total tasks</small></span></div>
        <div><span className="history-summary-icon in-progress"><i className="ti ti-loader-2" aria-hidden="true" /></span><span><strong>{counts.running}</strong><small>In progress</small></span></div>
        <div><span className="history-summary-icon completed"><i className="ti ti-circle-check" aria-hidden="true" /></span><span><strong>{counts.completed}</strong><small>Completed</small></span></div>
        <div className="history-cost"><Wallet size={15} /><span>Session spend</span><strong>${jobs.reduce((total, job) => total + (Number(job.cost_usd) || 0), 0).toFixed(4)}</strong></div>
      </section>

      <section className="history-workspace">
        <div className="history-toolbar">
          <div className="history-filter-list" aria-label="Filter tasks">
            {filters.map((item) => (
              <button
                className={`history-filter${filter === item.id ? " active" : ""}`}
                key={item.id}
                onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
              >
                {item.label}<span>{counts[item.id]}</span>
              </button>
            ))}
          </div>
          <label className="history-search">
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Search tasks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your tasks"
            />
            {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>×</button>}
          </label>
        </div>

        {jobs.length === 0 ? (
          <div className="history-empty">
            <span className="history-empty-icon"><i className="ti ti-coffee" aria-hidden="true" /></span>
            <span className="eyebrow">A QUIET WORKROOM</span>
            <h2>Your task list starts here.</h2>
            <p>When you send your first task to the agent, you’ll see its progress and response here.</p>
            <button className="button button-primary" onClick={onNewTask}><i className="ti ti-plus" aria-hidden="true" /> Create your first task</button>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="history-filter-empty">
            <span className="history-empty-icon"><Search size={18} /></span>
            <strong>No tasks match this view.</strong>
            <p>Try another filter or search term.</p>
            <button className="text-button" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters</button>
          </div>
        ) : (
          <div className="task-list">
            {filteredJobs.map((job) => {
              const isExpanded = expanded === job.job_id;
              return (
                <article className={`task-card${isExpanded ? " expanded" : ""}`} key={job.job_id}>
                  <button
                    className="task-card-main"
                    onClick={() => setExpanded(isExpanded ? null : job.job_id)}
                    aria-expanded={isExpanded}
                    aria-controls={`task-details-${job.job_id}`}
                  >
                    <span className={`task-card-icon ${job.status || "queued"}`}><i className={`ti ${job.status === "completed" ? "ti-check" : job.status === "failed" || job.status === "unavailable" ? "ti-alert-circle" : job.status === "cancelled" ? "ti-x" : "ti-sparkles"}`} aria-hidden="true" /></span>
                    <span className="task-card-copy">
                      <strong>{job.question || "Untitled task"}</strong>
                      <span><Clock3 size={12} /> {formatDate(job.created_at || job._submittedAt)}</span>
                    </span>
                    <StatusPill status={job.status} />
                    <span className="task-cost">{job.cost_usd > 0 ? `$${Number(job.cost_usd).toFixed(4)}` : "—"}</span>
                    {isExpanded ? <ChevronDown className="task-chevron" size={16} /> : <ChevronRight className="task-chevron" size={16} />}
                  </button>
                  {isExpanded && (
                    <div id={`task-details-${job.job_id}`} className="task-details-wrap">
                      <TaskDetails job={job} />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <p className="history-footnote"><i className="ti ti-info-circle" aria-hidden="true" /> This list is saved in this browser tab and survives refreshes. The backend doesn’t currently provide a persistent task archive, so results may expire.</p>
    </div>
  );
}
