const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}

test("patient can register, log in, create a UI-shaped request, and retrieve matches", async () => {
  const registration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName: "Test Patient", email: "patient@example.com", bloodType: "O-", role: "patient", password: "secure-password" }),
  });
  assert.equal(registration.response.status, 201);
  assert.equal(registration.body.user.passwordHash, undefined);

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "patient@example.com", password: "secure-password" }),
  });
  assert.equal(login.response.status, 200);
  const authorization = { authorization: `Bearer ${login.body.accessToken}` };

  const created = await request("/blood-requests", {
    method: "POST", headers: authorization,
    body: JSON.stringify({ bloodType: "O-", urgency: "Critical", location: "Prishtina Regional Hospital", unitsNeeded: 2, latitude: 42.6629, longitude: 21.1655 }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.urgency, "critical");
  const matches = await request(`/blood-requests/${created.body.id}/matches?radiusKm=10`);
  assert.equal(matches.response.status, 200);
  assert.ok(matches.body.some((donor) => donor.bloodType === "O-"));
});

test("donors cannot create patient blood requests", async () => {
  const registration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName: "Test Donor", email: "donor@example.com", bloodType: "A+", role: "donor", password: "secure-password" }),
  });
  const denied = await request("/blood-requests", {
    method: "POST", headers: { authorization: `Bearer ${registration.body.accessToken}` },
    body: JSON.stringify({ bloodType: "A+", urgency: "Normal", location: "Clinic", unitsNeeded: 1 }),
  });
  assert.equal(denied.response.status, 403);
});