const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const register = asyncHandler(async (req, res) => res.status(201).json(await authService.register(req.body)));
const login = asyncHandler(async (req, res) => res.json(await authService.login(req.body)));
const logout = asyncHandler(async (req, res) => {
  await authService.invalidateSessions(req.user.id);
  res.status(204).send();
});

module.exports = { register, login, logout };
