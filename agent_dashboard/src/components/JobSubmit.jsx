import React, { useState } from "react";
import { ArrowRight, Check, CircleHelp, LoaderCircle, Sparkles } from "lucide-react";
import { submitJob } from "../api";

const suggestions = [
  "Summarize the key ideas in a topic",
  "Explain a tricky technical concept",
  "Help me plan my next project",
];

export default function JobSubmit({ onJobSubmit, onViewHistory, apiStatus = "offline" }) {
  const [question, setQuestion] = useState("");
  const [userId, setUserId] = useState("user_1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submittedJob, setSubmittedJob] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const cleanedQuestion = question.trim();
    const cleanedUserId = userId.trim();
    if (!cleanedQuestion || !cleanedUserId || loading) return;

    setLoading(true);
    setError(null);
    setSubmittedJob(null);

    try {
      const job = await submitJob({ question: cleanedQuestion, user_id: cleanedUserId });
      const completeJob = { ...job, question: cleanedQuestion, user_id: cleanedUserId };
      onJobSubmit(completeJob);
      setSubmittedJob(completeJob);
      setQuestion("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit the task. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const startAnother = () => {
    setSubmittedJob(null);
    setError(null);
  };

  return (
    <div className="screen-page submit-page fade-in">
      <header className="screen-heading">
        <div>
          <span className="eyebrow">A FRESH START</span>
          <h1>What can I help with?</h1>
          <p>Describe the outcome you want. Your agent will take it from there.</p>
        </div>
        <span className={`screen-heading-note ${apiStatus}`}>
          <span className={`health-dot ${apiStatus}`} />
          {apiStatus === "online" ? "Connected to agent service" : "Agent service offline"}
        </span>
      </header>

      <div className="submit-layout">
        <section className="submit-card">
          {submittedJob ? (
            <div className="submit-success">
              <span className="success-mark"><Check size={21} strokeWidth={2.4} /></span>
              <span className="eyebrow">TASK ACCEPTED</span>
              <h2>Your agent is on it.</h2>
              <p className="success-question">{submittedJob.question}</p>
              <div className="success-meta">
                <span className="status-pill queued">{submittedJob.status || "queued"}</span>
                <code title={submittedJob.job_id}>ID · {submittedJob.job_id}</code>
              </div>
              <div className="success-actions">
                <button className="button button-primary" onClick={onViewHistory}>
                  Follow progress <ArrowRight size={15} />
                </button>
                <button className="button button-secondary" onClick={startAnother}>Start another task</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-section-heading">
                <span className="form-step">01</span>
                <div><strong>Describe your task</strong><small>Be as specific as you like. You can include context and constraints.</small></div>
              </div>
              <label className="field-label" htmlFor="task-question">Your task</label>
              <textarea
                id="task-question"
                className="task-textarea"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="For example: Explain how async functions work in Python, with a short example and when I should use them."
                maxLength={4000}
                required
              />
              <div className="input-footnote">
                <span>Clear goals help your agent give a better answer.</span>
                <span>{question.length.toLocaleString()} / 4,000</span>
              </div>

              <div className="suggestions">
                <span className="suggestions-label">NEED A STARTING POINT?</span>
                <div className="suggestion-list">
                  {suggestions.map((suggestion) => (
                    <button
                      className="suggestion-chip"
                      key={suggestion}
                      type="button"
                      onClick={() => setQuestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-divider" />
              <div className="form-section-heading identity-heading">
                <span className="form-step">02</span>
                <div><strong>Workspace identity</strong><small>Used to group your tasks and apply the per-user queue limit.</small></div>
              </div>
              <label className="field-label" htmlFor="workspace-id">Workspace ID</label>
              <input
                id="workspace-id"
                className="workspace-input"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                maxLength={64}
                pattern="[A-Za-z0-9_\-]+"
                title="Use letters, numbers, underscores, or hyphens."
                required
              />
              <p className="field-help"><CircleHelp size={13} /> Up to 3 tasks can run at once for this workspace.</p>

              {error && (
                <div className="form-error" role="alert">
                  <strong>Couldn’t submit this task</strong>
                  <span>{error}</span>
                </div>
              )}

              <div className="submit-form-footer">
                <span><Sparkles size={14} /> Runs in the background</span>
                <button
                  className="button button-primary submit-button"
                  type="submit"
                  disabled={loading || !question.trim() || !userId.trim()}
                >
                  {loading ? <><LoaderCircle className="button-spinner" size={15} /> Sending task…</> : <>Send to agent <ArrowRight size={15} /></>}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="submit-aside">
          <section className="how-card">
            <span className="eyebrow">A LITTLE REASSURANCE</span>
            <h2>It’s a short journey.</h2>
            <div className="journey">
              <div className="journey-step">
                <span className="journey-icon"><i className="ti ti-send" aria-hidden="true" /></span>
                <span><strong>You send a task</strong><small>Your request is queued by the configured agent service.</small></span>
              </div>
              <span className="journey-line" />
              <div className="journey-step">
                <span className="journey-icon"><i className="ti ti-sparkles" aria-hidden="true" /></span>
                <span><strong>Your agent gets to work</strong><small>You can continue working while it runs.</small></span>
              </div>
              <span className="journey-line" />
              <div className="journey-step">
                <span className="journey-icon"><i className="ti ti-message-check" aria-hidden="true" /></span>
                <span><strong>Your answer is ready</strong><small>Open task history to see the response.</small></span>
              </div>
            </div>
          </section>
          <section className="privacy-note">
            <i className="ti ti-lock" aria-hidden="true" />
            <p><strong>Your request is sent to your agent service.</strong><br />Only include information you’re comfortable sending to that service.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
