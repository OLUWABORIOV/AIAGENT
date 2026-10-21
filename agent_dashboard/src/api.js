const BASE = import.meta.env.VITE_API_URL || "/api";

const headers = {
  "Content-Type": "application/json",
};

const requestOptions = {
  credentials: "same-origin",
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function getSession() {
  if (import.meta.env.DEV) {
    return { authenticated: true };
  }

  const res = await fetch(`${BASE}/session`, requestOptions);
  if (res.status === 401) return { authenticated: false };
  if (!res.ok) throw new Error("Could not check the session");
  return res.json();
}

export async function login(password) {
  const res = await fetch(`${BASE}/login`, {
    ...requestOptions,
    method: "POST",
    headers,
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Incorrect password.");
  }
  return res.json();
}

export async function logout() {
  await fetch(`${BASE}/logout`, {
    ...requestOptions,
    method: "POST",
  });
}

export async function getHealth() {
  const res = await fetch(`${BASE}/health`, { ...requestOptions, headers });
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
    ...requestOptions,
    method: "POST",
    headers,
    body: JSON.stringify({ question, user_id, documents }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit job");
  }
  return res.json();
}

export async function getJob(job_id) {
  const res = await fetch(`${BASE}/v1/agent/jobs/${job_id}`, { ...requestOptions, headers });
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
    ...requestOptions,
    headers,
  });
  return res.json();
}
