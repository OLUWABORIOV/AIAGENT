const { clearSessionCookie } = require("../lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ authenticated: false });
};
