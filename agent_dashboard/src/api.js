const API_KEY = "dev-key-123";
const BASE = import.meta.env.VITE_API_URL || "";

const headers = {
  "Content-Type": "application/json",
  "X-API-Key": API_KEY,
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function getHealth() {
  const res = await fetch(`${BASE}/health`, { headers });
  if (!res.ok) throw new Error("Health check failed");

  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export async function submitJob({ question, user_id, documents = [] }) {
  const res = await fetch(`${BASE}/v1/agent/run`, {
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
  const res = await fetch(`${BASE}/v1/agent/jobs/${job_id}`, { headers });
  if (!res.ok) {
    if (res.status === 404) {
      throw new ApiError("This task result has expired or is no longer available.", res.status);
    }
    throw new ApiError("Could not refresh this task.", res.status);
  }
  return res.json();
}

export async function listUserJobs(user_id) {
  const res = await fetch(`${BASE}/v1/agent/jobs?user_id=${user_id}`, {
    headers,
  });
  return res.json();
}
