const asyncHandler = require("../utils/asyncHandler");
const authService = require("../services/authService");

const register = asyncHandler(async (req, res) => res.status(201).json(await authService.register(req.body)));
const login = asyncHandler(async (req, res) => res.json(await authService.login(req.body)));

module.exports = { register, login };