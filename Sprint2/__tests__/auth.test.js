const request = require("supertest");
const app = require("../server");
const { initDb, run } = require("../db");

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await run("DELETE FROM users");
});

test("GET /me returns loggedIn false when not logged in", async () => {
  const res = await request(app).get("/me");
  expect(res.status).toBe(200);
  expect(res.body.loggedIn).toBe(false);
});
