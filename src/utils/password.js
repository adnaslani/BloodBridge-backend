const { randomBytes, scrypt: scryptCallback, timingSafeEqual } = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(scryptCallback);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedValue) {
  const [salt, storedHash] = storedValue.split(":");
  if (!salt || !storedHash) return false;
  const derivedKey = await scrypt(password, salt, 64);
  const storedBuffer = Buffer.from(storedHash, "hex");
  return storedBuffer.length === derivedKey.length && timingSafeEqual(storedBuffer, derivedKey);
}

module.exports = { hashPassword, verifyPassword };