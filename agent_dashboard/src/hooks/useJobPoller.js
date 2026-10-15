import { useState, useEffect, useCallback, useRef } from 'react'
import { ApiError, getJob } from '../api'

const JOBS_STORAGE_KEY = 'stillwork.jobs.v1'
const JOB_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'cancelled', 'unavailable'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'unavailable'])

function restoreJobs() {
  try {
    const savedJobs = JSON.parse(sessionStorage.getItem(JOBS_STORAGE_KEY) || '[]')
    if (!Array.isArray(savedJobs)) return []
    return savedJobs.filter(job =>
      job &&
      typeof job === 'object' &&
      typeof job.job_id === 'string' &&
      typeof job.status === 'string' &&
      JOB_STATUSES.has(job.status),
    )
  } catch (error) {
    console.warn('Could not restore task history for this tab.', error)
    return []
  }
}

// Polls a job every 3 seconds until it reaches a terminal status.
export function useJobPoller() {
  const [jobs, setJobs] = useState(restoreJobs)
  const [polling, setPolling] = useState({})
  const intervals = useRef({})
  const persistenceWarningShown = useRef(false)

  const addJob = useCallback((job) => {
    setJobs(prev => [{ ...job, _submittedAt: Date.now() }, ...prev])
  }, [])

  const stopPolling = useCallback((job_id) => {
    const intervalId = intervals.current[job_id]
    if (intervalId) {
      clearInterval(intervalId)
      delete intervals.current[job_id]
    }
    setPolling(prev => {
      if (!prev[job_id]) return prev
      const next = { ...prev }
      delete next[job_id]
      return next
    })
  }, [])

  const startPolling = useCallback((job_id) => {
    if (intervals.current[job_id]) return

    let requestPending = false
    const id = setInterval(async () => {
      if (requestPending) return
      requestPending = true
      try {
        const result = await getJob(job_id)
        setJobs(prev => prev.map(j => j.job_id === job_id ? { ...j, ...result, _pollError: null } : j))

        if (TERMINAL_STATUSES.has(result.status)) {
          stopPolling(job_id)
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setJobs(prev => prev.map(j => j.job_id === job_id
            ? { ...j, status: 'unavailable', _pollError: null }
            : j))
          stopPolling(job_id)
          return
        }
        const message = error instanceof Error ? error.message : 'Could not refresh this task.'
        setJobs(prev => prev.map(j => j.job_id === job_id ? { ...j, _pollError: message } : j))
      } finally {
        requestPending = false
      }
    }, 3000)

    intervals.current[job_id] = id
    setPolling(prev => ({ ...prev, [job_id]: id }))
  }, [stopPolling])

  useEffect(() => {
    jobs
      .filter(job => job.job_id && !TERMINAL_STATUSES.has(job.status))
      .forEach(job => startPolling(job.job_id))
  }, [jobs, startPolling])

  useEffect(() => {
    try {
      const storedJobs = jobs.map(({ _pollError, ...job }) => job)
      sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(storedJobs))
      persistenceWarningShown.current = false
    } catch (error) {
      if (!persistenceWarningShown.current) {
        console.warn('Task history could not be saved for this tab.', error)
        persistenceWarningShown.current = true
      }
    }
  }, [jobs])

  useEffect(() => () => {
    Object.values(intervals.current).forEach(clearInterval)
    intervals.current = {}
  }, [])

  return { jobs, addJob, startPolling, isPolling: Object.keys(polling).length > 0 }
}
