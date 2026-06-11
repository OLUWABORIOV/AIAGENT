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
    // Navigate to job history after submitting
    setTimeout(() => setPage("history"), 600);
  };

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--gray100)",
      }}
    >
      <Sidebar
        active={page}
        setActive={setPage}
        apiStatus={apiOnline ? "online" : "offline"}
      />

      <main style={{ flex: 1, overflowY: "auto" }}>
        {page === "dashboard" && <Dashboard jobs={jobs} />}
        {page === "submit" && <JobSubmit onJobSubmit={handleJobSubmit} />}
        {page === "history" && <JobList jobs={jobs} />}
      </main>
    </div>
  );
}
