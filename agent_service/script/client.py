#!/usr/bin/env python3
"""
client.py — Example client that submits a job and polls for the result.

Run this after starting the service:
  docker compose up -d
  python scripts/client.py

TEACHING NOTE:
  This shows the complete request-poll lifecycle that any client
  (Python app, frontend, mobile app) would implement.
"""

import httpx
import time
import sys

BASE_URL = "http://localhost:8000"
API_KEY  = "dev-key-123"            # must match API_KEYS in .env
HEADERS  = {"X-API-Key": API_KEY}


def submit_job(question: str, user_id: str, documents: list[str] | None = None) -> str:
    """Submit a job and return the job_id."""
    response = httpx.post(
        f"{BASE_URL}/v1/agent/run",
        headers=HEADERS,
        json={
            "question": question,
            "user_id": user_id,
            "documents": documents or [],
        },
        timeout=10.0,
    )
    response.raise_for_status()
    data = response.json()
    print(f"✅ Job queued: {data['job_id']}")
    print(f"   Poll URL: {data['poll_url']}")
    return data["job_id"]


def poll_until_done(job_id: str, interval: float = 3.0, max_wait: float = 300.0) -> dict:
    """Poll until the job completes or times out."""
    deadline = time.time() + max_wait
    attempt = 0

    while time.time() < deadline:
        attempt += 1
        response = httpx.get(
            f"{BASE_URL}/v1/agent/jobs/{job_id}",
            headers=HEADERS,
            timeout=10.0,
        )
        response.raise_for_status()
        result = response.json()
        status = result["status"]

        print(f"   [{attempt}] Status: {status}")

        if status == "completed":
            return result
        elif status == "failed":
            raise RuntimeError(f"Job failed: {result.get('error', 'Unknown error')}")
        elif status == "cancelled":
            raise RuntimeError("Job was cancelled")

        time.sleep(interval)

    raise TimeoutError(f"Job {job_id} did not complete within {max_wait}s")


def run(question: str, user_id: str = "script_user") -> None:
    print(f"\n📤 Submitting: {question[:60]}")
    print("-" * 50)

    job_id = submit_job(question, user_id)
    print("\n⏳ Polling for result...")

    result = poll_until_done(job_id)

    print("\n" + "=" * 50)
    print("✅ COMPLETED")
    print(f"Answer:    {result['answer']}")
    print(f"Tokens:    {result['input_tokens']} in / {result['output_tokens']} out")
    print(f"Cost:      ${result['cost_usd']:.6f}")
    print(f"Duration:  {result['duration_secs']:.2f}s")
    print(f"Steps:     {result['steps_taken']}")
    print("=" * 50)


if __name__ == "__main__":
    question = " ".join(sys.argv[1:]) or "What is the capital of France and what is 7 * 8?"
    run(question)