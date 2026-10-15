import React from 'react'

export default function StatusPill({ status }) {
  const statusClass = ['queued', 'running', 'completed', 'failed', 'cancelled', 'unavailable'].includes(status)
    ? status
    : 'queued'
  const label = {
    queued: 'Queued',
    running: 'In progress',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    unavailable: 'Expired',
  }[statusClass]
  return (
    <span className={`status-pill ${statusClass}`}>
      <span className="status-pill-dot" />
      {label}
    </span>
  )
}
