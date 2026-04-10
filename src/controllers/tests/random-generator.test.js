const request = require("supertest");
const app = require("../../../server");
const { initDb, run } = require("../../models/db");

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await run("DELETE FROM user_allergies");
  await run("DELETE FROM user_preferences");
  await run("DELETE FROM recipe_steps");
  await run("DELETE FROM recipe_ingredients");
  await run("DELETE FROM recipe_tags");
  await run("DELETE FROM recipes");
  await run("DELETE FROM meal_plans");
  await run("DELETE FROM users");
});

async function registerAndLogin(agent, username = "generatoruser", password = "generatorpass") {
  await agent.post("/register").send({ username, password }).expect(200);
  await agent.post("/login").send({ username, password }).expect(200);
}

function lowerList(arr) {
  return (arr || []).map((x) => String(x).toLowerCase());
}

function textContainsAny(list, bannedWords) {
  return (list || []).some((item) =>
    bannedWords.some((word) => String(item).toLowerCase().includes(word))
  );
}

test("POST /recipes/generate requires login", async () => {
  const res = await request(app).post("/recipes/generate").send({
    answers: {
      time: "quick",
      type: "protein",
      spicy: "mild",
      cost: "cheap",
      dietary: "any",
    },
  });

  expect(res.status).toBe(302);
  expect(res.headers.location).toBe("/login.html");
});

test("POST /recipes/generate returns a generated recipe with all required fields", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "generatoruser1", "generatorpass1");

  const res = await agent.post("/recipes/generate").send({
    answers: {
      time: "quick",
      type: "protein",
      spicy: "mild",
      cost: "cheap",
      dietary: "any",
    },
  });

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  const recipe = res.body.recipe;

  expect(recipe).toBeDefined();
  expect(typeof recipe.title).toBe("string");
  expect(recipe.title.length).toBeGreaterThan(0);

  expect(typeof recipe.description).toBe("string");
  expect(typeof recipe.prepTime).toBe("number");
  expect(typeof recipe.cookTime).toBe("number");
  expect(typeof recipe.cost).toBe("number");

  expect(Array.isArray(recipe.ingredients)).toBe(true);
  expect(recipe.ingredients.length).toBeGreaterThan(0);

  expect(Array.isArray(recipe.steps)).toBe(true);
  expect(recipe.steps.length).toBeGreaterThan(0);

  expect(Array.isArray(recipe.dietaryTags)).toBe(true);
  expect(recipe.generatedByAI).toBe(true);
  expect(recipe.isGlobal).toBe(false);
});

test("POST /recipes/generate respects dairy-free requirement and dairy allergy", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "generatoruser2", "generatorpass2");

  await agent.post("/profile").send({
    allergies: ["dairy"],
    preferences: [],
  }).expect(200);

  const res = await agent.post("/recipes/generate").send({
    answers: {
      time: "medium",
      type: "vegetarian",
      spicy: "mild",
      cost: "moderate",
      dietary: "dairy-free",
    },
  });

  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);

  const recipe = res.body.recipe;
  const banned = [
    "milk",
    "cheese",
    "cream",
    "butter",
    "yogurt",
    "parmesan",
    "mozzarella",
    "feta",
    "halloumi",
    "tzatziki",
  ];

  const allText = [
    recipe.title,
    recipe.description,
    ...(recipe.ingredients || []),
    ...(recipe.steps || []),
    ...(recipe.dietaryTags || []),
  ];

  expect(textContainsAny(allText, banned)).toBe(false);
  expect(lowerList(recipe.dietaryTags)).toContain("dairy-free");
});

test("POST /recipes/generate respects excludeTitles and returns a different title", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "generatoruser3", "generatorpass3");

  const first = await agent.post("/recipes/generate").send({
    answers: {
      time: "quick",
      type: "any",
      spicy: "any",
      cost: "any",
      dietary: "any",
    },
  });

  expect(first.status).toBe(200);
  expect(first.body.ok).toBe(true);

  const firstTitle = first.body.recipe.title;
  expect(typeof firstTitle).toBe("string");
  expect(firstTitle.length).toBeGreaterThan(0);

  const second = await agent.post("/recipes/generate").send({
    answers: {
      time: "quick",
      type: "any",
      spicy: "any",
      cost: "any",
      dietary: "any",
    },
    excludeTitles: [firstTitle],
  });

  expect(second.status).toBe(200);
  expect(second.body.ok).toBe(true);
  expect(second.body.recipe.title).not.toBe(firstTitle);
});

test("POST /recipes/generate returns 400 when quiz answers are missing", async () => {
  const agent = request.agent(app);
  await registerAndLogin(agent, "generatoruser4", "generatorpass4");

  const res = await agent.post("/recipes/generate").send({
    answers: {
      time: "quick",
      type: "protein",
      spicy: "mild",
    },
  });

  expect(res.status).toBe(400);
  expect(res.body.error).toBe("Missing quiz answers");
});
