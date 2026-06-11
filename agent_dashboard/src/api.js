const API_KEY = "dev-key-123";
const BASE = ""; // empty = same origin (proxied by Vite to localhost:8000)

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

export async function getHealth() {
  const res = await fetch("/health", { headers });
  if (!res.ok) throw new Error("Health check failed");

  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export async function submitJob({ question, user_id, documents = [] }) {
  const res = await fetch("/v1/agent/run", {
    method: "POST",
    headers,
    body: JSON.stringify({ question, user_id, documents }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to submit job");
  }
  return res.json();
}

export async function getJob(job_id) {
  const res = await fetch(`/v1/agent/jobs/${job_id}`, { headers });
  if (!res.ok) throw new Error("Job not found");
  return res.json();
}

export async function listUserJobs(user_id) {
  const res = await fetch(`/v1/agent/jobs?user_id=${user_id}`, { headers });
  return res.json();
}
