const request = require("supertest");
const app = require("../server");
const { initDb, run } = require("../db");
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

async function registerAndLogin(agent, username = "recipeuser", password = "recipepass") {
  await agent.post("/register").send({ username, password }).expect(200);
  await agent.post("/login").send({ username, password }).expect(200);
}

test("POST /recipes creates recipe; GET /recipes returns it", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "recipeuser1", "recipepass1");

  const create = await agent.post("/recipes").send({
    title: "Chicken Rice",
    description: "Easy meal prep",
    prepTime: 10,
    cookTime: 25,
    cost: 12,
    ingredients: ["chicken", "rice", "salt"],
    steps: ["cook rice", "cook chicken", "mix"],
  });

  expect(create.status).toBe(200);
  expect(create.body.ok).toBe(true);
  expect(create.body.recipe.title).toBe("Chicken Rice");
  const recipeId = create.body.recipe.id;

  const list = await agent.get("/recipes");
  expect(list.status).toBe(200);
  expect(Array.isArray(list.body)).toBe(true);
  expect(list.body.length).toBe(1);
  expect(list.body[0].id).toBe(String(recipeId));
});

test("GET /recipes/:id returns recipe; PUT updates; DELETE removes", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "recipeuser2", "recipepass2");

  const create = await agent.post("/recipes").send({
    title: "Pasta",
    description: "initial",
    prepTime: 5,
    cookTime: 15,
    cost: 8,
    ingredients: ["pasta"],
    steps: ["boil"],
  });

  const id = create.body.recipe.id;

  const get1 = await agent.get(`/recipes/${id}`);
  expect(get1.status).toBe(200);
  expect(get1.body.title).toBe("Pasta");

  const upd = await agent.put(`/recipes/${id}`).send({
    title: "Pasta Updated",
    description: "updated",
    prepTime: 6,
    cookTime: 16,
    cost: 9,
    ingredients: ["pasta", "sauce"],
    steps: ["boil", "mix"],
  });

  expect(upd.status).toBe(200);
  expect(upd.body.success).toBe(true);

  const get2 = await agent.get(`/recipes/${id}`);
  expect(get2.status).toBe(200);
  expect(get2.body.title).toBe("Pasta Updated");
  expect(get2.body.ingredients).toEqual(["pasta", "sauce"]);
  expect(get2.body.steps).toEqual(["boil", "mix"]);

  const del = await agent.delete(`/recipes/${id}`);
  expect(del.status).toBe(200);
  expect(del.body.success).toBe(true);

  const get3 = await agent.get(`/recipes/${id}`);
  expect(get3.status).toBe(404);
});

test("cannot access another user's recipe (403)", async () => {
  const agentA = request.agent(app);
  await registerAndLogin(agentA, "userA123", "passA123");

  const create = await agentA.post("/recipes").send({
    title: "Secret Recipe",
    ingredients: ["x"],
    steps: ["y"],
  });
  const id = create.body.recipe.id;

  const agentB = request.agent(app);
  await registerAndLogin(agentB, "userB123", "passB123");

  const res = await agentB.get(`/recipes/${id}`);
  expect(res.status).toBe(403);
});
