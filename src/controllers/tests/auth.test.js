const request = require("supertest");
const app = require("../../../server");
const { initDb, run } = require("../../models/db");

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await run("DELETE FROM meal_plans");
  await run("DELETE FROM user_allergies");
  await run("DELETE FROM user_preferences");
  await run("DELETE FROM recipe_steps");
  await run("DELETE FROM recipe_ingredients");
  await run("DELETE FROM recipe_tags");
  await run("DELETE FROM recipes");
  await run("DELETE FROM users");
});

test("GET /me returns loggedIn=false when not logged in", async () => {
  const res = await request(app).get("/me");
  expect(res.status).toBe(200);
  expect(res.body.loggedIn).toBe(false);
});

test("register works (valid username/password)", async () => {
  const res = await request(app)
    .post("/register")
    .send({ username: "testuser1", password: "testpass1" });

  expect(res.status).toBe(200);
});

test("register rejects short username/password", async () => {
  const res = await request(app)
    .post("/register")
    .send({ username: "abc", password: "123" });

  expect(res.status).toBe(400);
});

test("login works after register; /me shows logged in", async () => {
  const agent = request.agent(app);

  await agent
    .post("/register")
    .send({ username: "testuser2", password: "testpass2" })
    .expect(200);

  await agent
    .post("/login")
    .send({ username: "testuser2", password: "testpass2" })
    .expect(200);

  const me = await agent.get("/me");
  expect(me.status).toBe(200);
  expect(me.body.loggedIn).toBe(true);
  expect(me.body.user.username).toBe("testuser2");
});

