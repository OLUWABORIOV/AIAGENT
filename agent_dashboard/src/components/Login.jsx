import React, { useState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { login } from "../api";

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError(null);
    try {
      await login(password);
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-card">
        <span className="login-mark">
          <img src="/agent-mark.png" alt="" />
        </span>
        <span className="eyebrow">PRIVATE WORKSPACE</span>
        <h1>Welcome back.</h1>
        <p>Enter the access password your team shared with you to open the agent studio.</p>

        <form onSubmit={handleSubmit}>
          <label className="field-label" htmlFor="access-password">Access password</label>
          <div className="login-input-wrap">
            <LockKeyhole size={16} aria-hidden="true" />
            <input
              id="access-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="form-error" role="alert">
              <strong>Couldn’t sign in</strong>
              <span>{error}</span>
            </div>
          )}

          <button className="button button-primary login-button" type="submit" disabled={loading || !password}>
            {loading ? (
              <><LoaderCircle className="button-spinner" size={15} /> Checking…</>
            ) : (
              <>Open workspace <ArrowRight size={15} /></>
            )}
          </button>
        </form>

        <small className="login-footnote">Access is limited to people with the workspace password.</small>
      </section>
    </main>
  );
}
