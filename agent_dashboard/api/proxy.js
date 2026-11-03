const { isAuthenticated } = require("../lib/auth");

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
  if (!backendUrl || !process.env.BACKEND_API_KEY) {
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
    "X-API-Key": process.env.BACKEND_API_KEY,
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
