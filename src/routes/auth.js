const router = require("express").Router();
const authService = require("../services/authService");
const { verifyToken } = require("../middleware/auth");
const userModel = require("../models/userModel");

const PUBLIC_ROLES = ["APPLICANT"];
const ALL_ROLES = ["APPLICANT", "REVIEWER", "APPROVER", "ADMIN"];

router.post("/register", async (req, res, next) => {
  const { email, password, full_name, role, organization } = req.body;

  if (!email || !password || !full_name || !role) {
    return res
      .status(400)
      .json({ error: "email, password, full_name and role are required" });
  }

  if (!ALL_ROLES.includes(role)) {
    return res
      .status(400)
      .json({ error: `Invalid role. Must be one of: ${ALL_ROLES.join(", ")}` });
  }

  if (!PUBLIC_ROLES.includes(role)) {
    return res
      .status(403)
      .json({ error: "Staff accounts must be created by an administrator" });
  }

  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  try {
    const user = await authService.register({
      email,
      password,
      full_name,
      role,
      organization,
    });
    res.status(201).json({ user });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const tokens = await authService.refresh(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    await authService.logout(refreshToken);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
