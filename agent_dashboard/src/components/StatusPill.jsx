import React from 'react'

const COLORS = {
  queued:    { bg: '#FEF3C7', color: '#92400E' },
  running:   { bg: '#DBEAFE', color: '#1E40AF' },
  completed: { bg: '#DCFCE7', color: '#166534' },
  failed:    { bg: '#FEE2E2', color: '#991B1B' },
}

export default function StatusPill({ status }) {
  const c = COLORS[status] || COLORS.queued
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 20,
      background: c.bg,
      color: c.color,
      fontFamily: 'var(--font-mono)',
      letterSpacing: '0.02em',
    }}>
      {status === 'running' ? '⟳ ' : ''}{status}
    </span>
  )
}
