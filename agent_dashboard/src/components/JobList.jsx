import React, { useState } from 'react'
import StatusPill from './StatusPill'

const card = {
  background: '#fff',
  border: '1px solid var(--gray200)',
  borderRadius: 'var(--radius-lg)',
  overflow: 'hidden',
  boxShadow: 'var(--shadow-sm)',
}

export default function JobList({ jobs }) {
  const [expanded, setExpanded] = useState(null)

  if (jobs.length === 0) {
    return (
      <div className="fade-in" style={{ padding: '28px 32px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.02em', marginBottom: 24 }}>
          Job history
        </h1>
        <div style={{ ...card, textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>No jobs yet</div>
          <div style={{ fontSize: 12, color: 'var(--gray600)' }}>Submit a job to see it tracked here in real time</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in" style={{ padding: '28px 32px', maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--navy)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Job history
          </h1>
          <p style={{ fontSize: 13, color: 'var(--gray600)' }}>
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} · polling every 3s for active jobs
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all','queued','running','completed','failed'].map(f => (
            <span key={f} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--gray100)', color: 'var(--gray600)', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
              {f === 'all' ? `all (${jobs.length})` : `${f} (${jobs.filter(j=>j.status===f).length})`}
            </span>
          ))}
        </div>
      </div>

      <div style={card}>
        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 80px 70px', gap: 12, padding: '10px 16px', background: 'var(--gray50)', borderBottom: '1px solid var(--gray200)', fontSize: 11, fontWeight: 600, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
          <span>Job ID</span>
          <span>Question</span>
          <span>Status</span>
          <span>Cost</span>
          <span>Time</span>
        </div>

        {/* Rows */}
        {jobs.map(job => (
          <div key={job.job_id}>
            <div
              onClick={() => setExpanded(expanded === job.job_id ? null : job.job_id)}
              style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 80px 70px', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--gray100)', cursor: 'pointer', transition: 'background 0.1s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--gray50)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gray400)' }}>{job.job_id.slice(0,8)}…</span>
              <span style={{ fontSize: 12, color: 'var(--gray800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.question || '—'}</span>
              <span><StatusPill status={job.status} /></span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray600)' }}>{job.cost_usd > 0 ? `$${job.cost_usd.toFixed(4)}` : '—'}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gray600)' }}>{job.duration_secs > 0 ? `${job.duration_secs.toFixed(1)}s` : '—'}</span>
            </div>

            {/* Expanded answer */}
            {expanded === job.job_id && (
              <div className="fade-in" style={{ padding: '16px 20px', background: 'var(--gray50)', borderBottom: '1px solid var(--gray200)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
                  Full job details
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[
                    ['Job ID',      job.job_id],
                    ['Status',      job.status],
                    ['Input tokens', job.input_tokens || '—'],
                    ['Output tokens', job.output_tokens || '—'],
                    ['Cost USD',    job.cost_usd > 0 ? `$${job.cost_usd.toFixed(6)}` : '—'],
                    ['Duration',    job.duration_secs > 0 ? `${job.duration_secs.toFixed(2)}s` : '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11 }}>
                      <span style={{ color: 'var(--gray400)', fontFamily: 'var(--font-mono)' }}>{k}: </span>
                      <span style={{ color: 'var(--navy)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{String(v)}</span>
                    </div>
                  ))}
                </div>

                {job.answer && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray400)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>
                      Answer
                    </div>
                    <div style={{ background: '#fff', border: '1px solid var(--gray200)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13, color: 'var(--gray800)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {job.answer}
                    </div>
                  </>
                )}

                {job.status === 'running' || job.status === 'queued' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--blue)' }}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid var(--blue)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Agent is processing… polling every 3 seconds
                  </div>
                ) : null}

                {job.error && (
                  <div style={{ padding: '10px 14px', background: '#FEE2E2', borderRadius: 'var(--radius-md)', fontSize: 12, color: '#991B1B', fontFamily: 'var(--font-mono)' }}>
                    Error: {job.error}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
