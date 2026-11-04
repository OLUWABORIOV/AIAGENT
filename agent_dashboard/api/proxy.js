const { isAuthenticated } = require("../lib/auth");

// Render stores API_KEYS as a JSON array (`["key"]`), but the backend compares
// the X-API-Key header against a single key. Accept whatever was pasted into
// BACKEND_API_KEY — JSON array, JSON string, comma-separated list, or a plain
// key — and send the first key. This removes the need to hand-edit the value
// after copying it from the Render dashboard.
function primaryApiKey(raw) {
  let value = String(raw ?? "").trim();
  if (!value) return "";

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      value = String(parsed.find((item) => String(item ?? "").trim()) ?? "");
    } else if (typeof parsed === "string") {
      value = parsed;
    }
  } catch {
    // Not JSON: treat it as a comma-separated list.
    value = value.split(",")[0] ?? "";
  }

  return value.trim().replace(/^["'\[]+|["'\]]+$/g, "").trim();
}

if (process.env.BACKEND_API_KEY) {
  const normalized = primaryApiKey(process.env.BACKEND_API_KEY);
  if (normalized !== process.env.BACKEND_API_KEY) {
    console.warn(
      "BACKEND_API_KEY had surrounding formatting (brackets/quotes/list); using the first key.",
    );
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!isAuthenticated(req)) {
    return res
      .status(401)
      .json({ detail: "Please sign in to use this workspace." });
  }

  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/+$/, "");
  const apiKey = primaryApiKey(process.env.BACKEND_API_KEY);
  if (!backendUrl || !apiKey) {
    return res
      .status(503)
      .json({ detail: "The agent service is not configured." });
  }

  const query = req.query || {};
  const p = Array.isArray(query.p) ? query.p.join("/") : query.p || "";
  if (p !== "health" && !p.startsWith("v1/")) {
    return res.status(404).json({ detail: "Not found" });
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "p") continue;
    (Array.isArray(value) ? value : [value]).forEach((v) =>
      params.append(key, v),
    );
  }
  const search = params.toString() ? `?${params}` : "";
  const target = `${backendUrl}/${p}${search}`;

  const headers = {
    "X-API-Key": apiKey,
  };
  if (req.headers["content-type"])
    headers["content-type"] = req.headers["content-type"];
  if (req.headers.accept) headers.accept = req.headers.accept;

  let body;
  if (!["GET", "HEAD"].includes(req.method)) {
    body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  }

  let upstream;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(25000),
    });
  } catch (error) {
    console.error("Backend request failed:", error);
    return res
      .status(502)
      .json({ detail: "The agent service is unavailable." });
  }

  const responseBody = await upstream.text();
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("content-type", contentType);

  return res.status(upstream.status).send(responseBody);
};
