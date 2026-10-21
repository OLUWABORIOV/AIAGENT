const crypto = require("crypto");

const COOKIE_NAME = "stillwork_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function sessionSecret() {
  return process.env.SESSION_SECRET || "";
}

function sign(payload) {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createSessionToken() {
  const expiresAt = String(Date.now() + SESSION_TTL_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !sessionSecret()) return false;

  const separator = token.indexOf(".");
  if (separator === -1) return false;

  const expiresAt = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!expiresAt || !signature) return false;
  if (!safeEqual(signature, sign(expiresAt))) return false;

  const expiry = Number(expiresAt);
  return Number.isFinite(expiry) && Date.now() < expiry;
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        const name = part.slice(0, index);
        const rawValue = part.slice(index + 1);
        try {
          return [name, decodeURIComponent(rawValue)];
        } catch {
          return [name, rawValue];
        }
      })
  );
}

function isAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = {
  clearSessionCookie,
  createSessionToken,
  isAuthenticated,
  sessionCookie,
};
