const { isAuthenticated } = require("../lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!isAuthenticated(req)) {
    return res.status(401).json({ authenticated: false });
  }
  return res.status(200).json({ authenticated: true });
};
