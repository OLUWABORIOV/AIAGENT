import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import JobSubmit from "./components/JobSubmit";
import JobList from "./components/JobList";
import { useJobPoller } from "./hooks/useJobPoller";
import { getHealth } from "./api";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [apiOnline, setApiOnline] = useState(false);
  const { jobs, addJob, startPolling } = useJobPoller();

  // Check API health every 10 seconds
  useEffect(() => {
    const check = async () => {
      try {
        await getHealth();
        setApiOnline(true);
      } catch {
        setApiOnline(false);
      }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  const handleJobSubmit = (job) => {
    addJob(job);
    startPolling(job.job_id);
  };

  return (
    <div className="app-shell">
      <Sidebar
        active={page}
        setActive={setPage}
        apiStatus={apiOnline ? "online" : "offline"}
      />

      <main className="app-main">
        {page === "dashboard" && (
          <Dashboard
            jobs={jobs}
            apiStatus={apiOnline ? "online" : "offline"}
            onSubmit={() => setPage("submit")}
            onHistory={() => setPage("history")}
          />
        )}
        {page === "submit" && (
          <JobSubmit
            onJobSubmit={handleJobSubmit}
            onViewHistory={() => setPage("history")}
            apiStatus={apiOnline ? "online" : "offline"}
          />
        )}
        {page === "history" && (
          <JobList jobs={jobs} onNewTask={() => setPage("submit")} />
        )}
      </main>
    </div>
  );
}
