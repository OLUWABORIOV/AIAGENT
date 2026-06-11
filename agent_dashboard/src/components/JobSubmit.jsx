import React, { useState } from 'react'
import { submitJob } from '../api'
import StatusPill from './StatusPill'

const card = {
  background: '#fff',
  border: '1px solid var(--gray200)',
  borderRadius: 'var(--radius-lg)',
  padding: '24px 28px',
  boxShadow: 'var(--shadow-sm)',
  maxWidth: 620,
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid var(--gray200)',
  borderRadius: 'var(--radius-md)',
  fontSize: 13,
  fontFamily: 'var(--font-body)',
  color: 'var(--gray800)',
  background: 'var(--gray50)',
  outline: 'none',
  transition: 'border 0.15s',
}

export default function JobSubmit({ onJobSubmit }) {
  const [question, setQuestion]   = useState('')
  const [userId, setUserId]       = useState('user_1')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [lastJob, setLastJob]     = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!question.trim()) return
    setLoading(true)
    setError(null)
    setLastJob(null)

    try {
      const job = await submitJob({ question: question.trim(), user_id: userId })
      setLastJob({ ...job, question: question.trim() })
      onJobSubmit({ ...job, question: question.trim() })
      setQuestion('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fade-in" style={{ padding: '28px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Submit a job
        </h1>
        <p style={{ fontSize: 13, color: 'var(--gray600)' }}>
          Sends a question to your Claude agent. Returns a job_id instantly — the agent runs in the background.
        </p>
      </div>

      <div style={card}>
        <form onSubmit={handleSubmit}>
          {/* Question */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray600)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
              Question *
            </label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="e.g. What is the difference between async and sync Python?"
              style={{ ...inputStyle, height: 100, resize: 'vertical' }}
              required
            />
          </div>

          {/* User ID */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray600)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
              User ID
            </label>
            <input
              value={userId}
              onChange={e => setUserId(e.target.value)}
              style={inputStyle}
              placeholder="user_1"
            />
            <div style={{ fontSize: 11, color: 'var(--gray400)', marginTop: 4 }}>
              Rate limit: max 3 concurrent jobs per user
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: 'var(--radius-md)', fontSize: 12, color: '#991B1B', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>
              ✕ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !question.trim()}
            style={{
              width: '100%',
              padding: '11px',
              background: loading ? 'var(--gray200)' : 'var(--navy)',
              color: loading ? 'var(--gray400)' : '#fff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'Submitting…' : 'POST /v1/agent/run →'}
          </button>
        </form>
      </div>

      {/* Success response */}
      {lastJob && (
        <div className="fade-in" style={{ ...card, marginTop: 16, borderLeft: '3px solid var(--green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
              ✓ Job queued
            </span>
            <StatusPill status={lastJob.status} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray400)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>job_id</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--navy)', background: 'var(--gray50)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 10, wordBreak: 'break-all' }}>
            {lastJob.job_id}
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray600)' }}>
            The agent is now running in the background. Check <strong>Job history</strong> to see the result.
          </div>
        </div>
      )}

      {/* How it works */}
      <div style={{ ...card, marginTop: 16, background: 'var(--gray50)', border: '1px solid var(--gray200)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
          What happens when you submit
        </div>
        {[
          ['1', 'FastAPI validates your request (auth + schema)'],
          ['2', 'Job is stored in Redis with status: queued'],
          ['3', 'arq worker picks it up and calls Claude'],
          ['4', 'Result stored in Redis — poll /v1/agent/jobs/{id}'],
        ].map(([n, text]) => (
          <div key={n} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 12 }}>
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{n}</span>
            <span style={{ color: 'var(--gray600)', lineHeight: 1.6 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
