const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const register = asyncHandler(async (req, res) => res.status(201).json(await authService.register(req.body)));
const login = asyncHandler(async (req, res) => res.json(await authService.login(req.body)));
const logout = asyncHandler(async (req, res) => {
  // Cognito logout/revocation happens in Cognito; local sessions are still revoked here.
  if (req.auth?.provider !== "cognito") await authService.invalidateSessions(req.user.id);
  res.status(204).send();
});
const syncCognitoUser = asyncHandler(async (req, res) => res.status(201).json({ user: await authService.syncCognitoUser(req.auth.claims, req.body) }));

module.exports = { register, login, logout, syncCognitoUser };
