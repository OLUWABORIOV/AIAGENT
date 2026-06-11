import { useState, useEffect, useCallback } from 'react'
import { getJob } from '../api'

// Polls a job every 3 seconds until it's completed or failed
export function useJobPoller() {
  const [jobs, setJobs] = useState([])   // list of all submitted jobs
  const [polling, setPolling] = useState({})  // { job_id: intervalId }

  const addJob = useCallback((job) => {
    setJobs(prev => [{ ...job, _submittedAt: Date.now() }, ...prev])
  }, [])

  const startPolling = useCallback((job_id) => {
    const id = setInterval(async () => {
      try {
        const result = await getJob(job_id)
        setJobs(prev => prev.map(j => j.job_id === job_id ? { ...j, ...result } : j))

        if (result.status === 'completed' || result.status === 'failed') {
          clearInterval(id)
          setPolling(prev => { const n = { ...prev }; delete n[job_id]; return n })
        }
      } catch {
        clearInterval(id)
      }
    }, 3000)

    setPolling(prev => ({ ...prev, [job_id]: id }))
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => Object.values(polling).forEach(clearInterval)
  }, [])

  return { jobs, addJob, startPolling, isPolling: Object.keys(polling).length > 0 }
}
