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

async function registerAndLogin(agent, username = "profileuser", password = "profilepass") {
  await agent.post("/register").send({ username, password }).expect(200);
  await agent.post("/login").send({ username, password }).expect(200);
}

test("POST /profile saves allergies/preferences; GET /profile returns them", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "profileuser1", "profilepass1");

  await agent
    .post("/profile")
    .send({
      allergies: ["peanuts", "milk"],
      preferences: ["spicy", "high-protein"],
    })
    .expect(200);

  const res = await agent.get("/profile");
  expect(res.status).toBe(200);
  expect(res.body.username).toBe("profileuser1");
  expect(res.body.allergies).toEqual(["milk", "peanuts"]);
  expect(res.body.preferences).toEqual(["high-protein", "spicy"]);
});

test("POST /profile overwrites old values", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "profileuser2", "profilepass2");

  await agent.post("/profile").send({ allergies: ["eggs"], preferences: ["sweet"] }).expect(200);
  await agent.post("/profile").send({ allergies: ["soy"], preferences: [] }).expect(200);

  const res = await agent.get("/profile");
  expect(res.status).toBe(200);
  expect(res.body.allergies).toEqual(["soy"]);
  expect(res.body.preferences).toEqual([]);
});
