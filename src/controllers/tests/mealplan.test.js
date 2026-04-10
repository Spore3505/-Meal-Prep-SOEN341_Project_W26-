const request = require("supertest");
const app = require("../../../server");
const { initDb, run } = require("../../models/db");

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await run("DELETE FROM meal_plans");
  await run("DELETE FROM user_allergies");
  await run("DELETE FROM recipe_steps");
  await run("DELETE FROM recipe_ingredients");
  await run("DELETE FROM recipe_tags");
  await run("DELETE FROM recipes");
  await run("DELETE FROM users");
});

async function registerAndLogin(agent, username = "mealuser", password = "mealpass") {
  await agent.post("/register").send({ username, password }).expect(200);
  await agent.post("/login").send({ username, password }).expect(200);
}

async function createRecipe(agent, title = "Sample Recipe") {
  const res = await agent.post("/recipes")
    .set("Content-Type", "application/json")
    .send({
      title,
      ingredients: ["ingredient1"],
      steps: ["step1"],
      prepTime: 10,
      cookTime: 15,
      cost: 5
    });
  // Ensure we return the ID as a Number to match the DB's behavior
  return Number(res.body.recipe.id);
}

test("POST /plan/save adds a meal plan; GET /plan returns it", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const recipeId = await createRecipe(agent);

  // Save meal plan
  const saveRes = await agent.post("/plan/save")
    .set("Content-Type", "application/json")
    .send({ day: "Monday", meal: "Lunch", recipeId });

  expect(saveRes.status).toBe(200);
  expect(saveRes.body.success).toBe(true);

  // Get meal plan
  const getRes = await agent.get("/plan");
  expect(getRes.status).toBe(200);
  expect(getRes.body.meals).toHaveLength(1);

  // FIX: Match against the numeric recipeId
  expect(getRes.body.meals[0]).toMatchObject({
    day: "Monday",
    meal: "Lunch",
    recipe_id: recipeId // Removed .toString() so it stays a Number
  });
});

test("POST /plan/delete removes a meal plan", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const recipeId = await createRecipe(agent);

  await agent.post("/plan/save")
    .set("Content-Type", "application/json")
    .send({ day: "Tuesday", meal: "Dinner", recipeId });

  const delRes = await agent.post("/plan/delete")
    .set("Content-Type", "application/json")
    .send({ day: "Tuesday", meal: "Dinner" });

  expect(delRes.status).toBe(200);
  expect(delRes.body.success).toBe(true);

  const getRes = await agent.get("/plan");
  expect(getRes.body.meals).toHaveLength(0);
});

test("POST /plan/clear-day clears all meals for a day", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent);

  const recipeId1 = await createRecipe(agent, "Recipe 1");
  const recipeId2 = await createRecipe(agent, "Recipe 2");

  await agent.post("/plan/save").send({
    day: "Wednesday", meal: "Lunch", recipeId: recipeId1
  });
  await agent.post("/plan/save").send({
    day: "Wednesday", meal: "Dinner", recipeId: recipeId2
  });

  const clearRes = await agent.post("/plan/clear-day")
    .send({ day: "Wednesday" });

  expect(clearRes.status).toBe(200);
  expect(clearRes.body.success).toBe(true);

  const getRes = await agent.get("/plan");
  expect(getRes.body.meals).toHaveLength(0);
});
