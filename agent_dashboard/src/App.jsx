import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import JobSubmit from "./components/JobSubmit";
import JobList from "./components/JobList";
import Login from "./components/Login";
import { useJobPoller } from "./hooks/useJobPoller";
import { getHealth, getSession, logout } from "./api";

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [apiOnline, setApiOnline] = useState(false);
  const [authState, setAuthState] = useState("checking");
  const { jobs, addJob, startPolling } = useJobPoller();

  useEffect(() => {
    let active = true;
    getSession()
      .then((session) => {
        if (active) setAuthState(session.authenticated ? "authed" : "locked");
      })
      .catch(() => {
        if (active) setAuthState("locked");
      });
    return () => {
      active = false;
    };
  }, []);

  // Check API health every 10 seconds, but only after sign-in.
  useEffect(() => {
    if (authState !== "authed") {
      setApiOnline(false);
      return undefined;
    }

    let active = true;
    const check = async () => {
      try {
        await getHealth();
        if (active) setApiOnline(true);
      } catch {
        if (active) setApiOnline(false);
      }
    };

    check();
    const id = setInterval(check, 10_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [authState]);

  const handleJobSubmit = (job) => {
    addJob(job);
    startPolling(job.job_id);
  };

  const handleLogout = async () => {
    await logout();
    setAuthState("locked");
  };

  if (authState === "checking") {
    return (
      <main className="app-loading" aria-live="polite">
        <span className="loading-dot" />
        <span>Opening your workspace…</span>
      </main>
    );
  }

  if (authState === "locked") {
    return <Login onSuccess={() => setAuthState("authed")} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        active={page}
        setActive={setPage}
        apiStatus={apiOnline ? "online" : "offline"}
        onLogout={import.meta.env.DEV ? undefined : handleLogout}
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
