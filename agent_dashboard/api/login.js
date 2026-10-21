const { createSessionToken, sessionCookie } = require("../lib/auth");

function readBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ detail: "Method not allowed" });
  }

  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return res.status(503).json({ detail: "Authentication is not configured." });
  }

  const { password } = readBody(req.body);
  if (typeof password !== "string" || password !== process.env.APP_PASSWORD) {
    // Small delay to make repeated guessing less pleasant.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return res.status(401).json({ detail: "Incorrect password." });
  }

  res.setHeader("Set-Cookie", sessionCookie(createSessionToken()));
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ authenticated: true });
};
