import React from "react";
import { BookOpen, ClipboardList, LayoutDashboard, Plus } from "lucide-react";

const navigation = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "submit", label: "New task", icon: Plus },
  { id: "history", label: "Task history", icon: ClipboardList },
];

export default function Sidebar({ active, setActive, apiStatus }) {
  return (
    <aside className="app-sidebar">
      <button className="brand-lockup" onClick={() => setActive("dashboard")} aria-label="Go to overview">
        <span className="brand-mark"><img src="/agent-mark.png" alt="" /></span>
        <span className="brand-name">still<span>work</span><small>AGENT STUDIO</small></span>
      </button>

      <div className="sidebar-label">WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <button
            className={`nav-item${active === id ? " active" : ""}`}
            key={id}
            onClick={() => setActive(id)}
            aria-current={active === id ? "page" : undefined}
          >
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
            {id === "submit" && <i className="ti ti-arrow-up-right nav-trailing" aria-hidden="true" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <div className="sidebar-note">
        <span className="sidebar-note-icon"><BookOpen size={15} aria-hidden="true" /></span>
        <span><strong>Made to help</strong><small>One thoughtful task at a time.</small></span>
      </div>
      <div className={`sidebar-status ${apiStatus}`}>
        <span className="health-dot" />
        <span><strong>{apiStatus === "online" ? "Agent connected" : "Agent offline"}</strong><small>Service health</small></span>
        <span className="status-ping" />
      </div>
      <div className="sidebar-credit">QUIETLY GET MORE DONE</div>
    </aside>
  );
}
