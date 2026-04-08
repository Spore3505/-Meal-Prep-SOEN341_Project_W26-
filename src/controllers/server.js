// server.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { initDb, run, get, all } = require("../models/db");

const app = express();

const view = (name) => path.join(__dirname, "..", "views", name);

app.use(express.json());

// Sessions + cookies
app.use(
  session({
    name: "mealmj_sid",
    secret: "CHANGE_THIS_SECRET",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 2,
      // secure: true,
    },
  })
);

// Helper middleware: require login
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.redirect("/login.html");
}

// View routes
app.get("/", (req, res) => res.sendFile(view("Home.html")));
app.get("/register.html", (req, res) => res.sendFile(view("register.html")));
app.get("/login.html", (req, res) => res.sendFile(view("login.html")));
app.get("/random_pick.html", requireAuth, (req, res) => res.sendFile(view("random_pick.html")));
app.get("/view_mealplan.html", requireAuth, (req, res) => res.sendFile(view("view_mealplan.html")));
app.get("/recipes.html", requireAuth, (req, res) => res.sendFile(view("recipes.html")));
app.get("/create.html", requireAuth, (req, res) => res.sendFile(view("create.html")));
app.get("/edit.html", requireAuth, (req, res) => res.sendFile(view("edit.html")));
app.get("/account.html", requireAuth, (req, res) => res.sendFile(view("account.html")));

// Check login status
app.get("/me", (req, res) => {
  if (req.session?.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

/* =========================
   PROFILE ROUTES (SQL)
   ========================= */

app.get("/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const username = req.session.user.username;

    const allergies = (
      await all(
        `SELECT allergy FROM user_allergies WHERE user_id = ? ORDER BY allergy`,
        [userId]
      )
    ).map((r) => r.allergy);

    const preferences = (
      await all(
        `SELECT preference FROM user_preferences WHERE user_id = ? ORDER BY preference`,
        [userId]
      )
    ).map((r) => r.preference);

    res.json({ username, allergies, preferences });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error reading user profile");
  }
});

app.post("/profile", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    let allergies = req.body.allergies || [];
    let preferences = req.body.preferences || [];

    if (!Array.isArray(allergies)) allergies = [allergies];
    if (!Array.isArray(preferences)) preferences = [preferences];

    allergies = allergies.map((a) => String(a).trim()).filter(Boolean);
    preferences = preferences.map((p) => String(p).trim()).filter(Boolean);

    await run(`DELETE FROM user_allergies WHERE user_id = ?`, [userId]);
    await run(`DELETE FROM user_preferences WHERE user_id = ?`, [userId]);

    for (const a of allergies) {
      await run(
        `INSERT INTO user_allergies (user_id, allergy) VALUES (?, ?)`,
        [userId, a]
      );
    }

    for (const p of preferences) {
      await run(
        `INSERT INTO user_preferences (user_id, preference) VALUES (?, ?)`,
        [userId, p]
      );
    }

    res.send("Profile updated");
  } catch (e) {
    console.error(e);
    res.status(500).send("Error saving profile");
  }
});

/* =========================
   RECIPES ROUTES (SQL)
   ========================= */

app.post("/recipes", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const {
      title,
      description,
      prepTime,
      cookTime,
      cost,
      ingredients,
      steps,
      dietaryTags,
    } = req.body || {};

    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) {
      return res.status(400).send("Recipe name is required");
    }

    const ins = await run(
      `INSERT INTO recipes (owner_user_id, title, description, prep_time, cook_time, cost, is_global)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        userId,
        cleanTitle,
        String(description || "").trim(),
        Number(prepTime || 0),
        Number(cookTime || 0),
        Number(cost || 0),
      ]
    );

    const recipeId = ins.lastID;

    const ing = Array.isArray(ingredients) ? ingredients.map(String) : [];
    const stp = Array.isArray(steps) ? steps.map(String) : [];
    const tags = Array.isArray(dietaryTags) ? dietaryTags.map(String) : [];

    for (const i of ing) {
      const clean = String(i).trim();
      if (clean) {
        await run(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)`,
          [recipeId, clean]
        );
      }
    }

    for (let idx = 0; idx < stp.length; idx++) {
      const s = String(stp[idx]).trim();
      if (s) {
        await run(
          `INSERT INTO recipe_steps (recipe_id, step_index, step_text) VALUES (?, ?, ?)`,
          [recipeId, idx, s]
        );
      }
    }

    for (const t of tags) {
      const clean = String(t).trim();
      if (clean) {
        await run(
          `INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)`,
          [recipeId, clean]
        );
      }
    }

    const recipe = {
      id: String(recipeId),
      title: cleanTitle,
      description: String(description || "").trim(),
      prepTime: Number(prepTime || 0),
      cookTime: Number(cookTime || 0),
      cost: Number(cost || 0),
      ingredients: ing,
      steps: stp,
      dietaryTags: tags,
      createdAt: new Date().toISOString(),
      isGlobal: false,
    };

    res.json({ ok: true, recipe });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error saving recipe");
  }
});

app.get("/recipes", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const rows = await all(
      `SELECT id, title, description, prep_time, cook_time, cost, created_at
       FROM recipes
       WHERE owner_user_id = ? AND is_global = 0
       ORDER BY id DESC`,
      [userId]
    );

    const out = [];
    for (const r of rows) {
      const ingredients = (
        await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [
          r.id,
        ])
      ).map((x) => x.ingredient);

      const steps = (
        await all(
          `SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`,
          [r.id]
        )
      ).map((x) => x.step_text);

      const dietaryTags = (
        await all(`SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag`, [
          r.id,
        ])
      ).map((x) => x.tag);

      out.push({
        id: String(r.id),
        title: r.title,
        description: r.description || "",
        prepTime: r.prep_time,
        cookTime: r.cook_time,
        cost: r.cost,
        ingredients,
        steps,
        dietaryTags,
        createdAt: r.created_at,
        isGlobal: false,
      });
    }

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error reading recipes");
  }
});

app.get("/recipes/global", requireAuth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT id, title, description, prep_time, cook_time, cost, created_at
       FROM recipes
       WHERE is_global = 1
       ORDER BY id DESC`
    );

    const out = [];
    for (const r of rows) {
      const ingredients = (
        await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [
          r.id,
        ])
      ).map((x) => x.ingredient);

      const steps = (
        await all(
          `SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`,
          [r.id]
        )
      ).map((x) => x.step_text);

      const dietaryTags = (
        await all(`SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag`, [
          r.id,
        ])
      ).map((x) => x.tag);

      out.push({
        id: "g" + String(r.id),
        title: r.title,
        description: r.description || "",
        prepTime: r.prep_time,
        cookTime: r.cook_time,
        cost: r.cost,
        ingredients,
        steps,
        dietaryTags,
        createdAt: r.created_at,
        isGlobal: true,
      });
    }

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error reading global recipes");
  }
});

app.get("/recipes/all", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;

    const mineRows = await all(
      `SELECT id, title, description, prep_time, cook_time, cost, created_at
       FROM recipes
       WHERE owner_user_id = ? AND is_global = 0
       ORDER BY id DESC`,
      [userId]
    );

    const globalRows = await all(
      `SELECT id, title, description, prep_time, cook_time, cost, created_at
       FROM recipes
       WHERE is_global = 1
       ORDER BY id DESC`
    );

    async function hydrate(rows, isGlobal) {
      const out = [];

      for (const r of rows) {
        const ingredients = (
          await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [
            r.id,
          ])
        ).map((x) => x.ingredient);

        const steps = (
          await all(
            `SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`,
            [r.id]
          )
        ).map((x) => x.step_text);

        const dietaryTags = (
          await all(`SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag`, [
            r.id,
          ])
        ).map((x) => x.tag);

        out.push({
          id: String(r.id),
          title: r.title,
          description: r.description || "",
          prepTime: r.prep_time,
          cookTime: r.cook_time,
          cost: r.cost,
          ingredients,
          steps,
          dietaryTags,
          createdAt: r.created_at,
          isGlobal,
        });
      }

      return out;
    }

    res.json({
      mine: await hydrate(mineRows, false),
      global: await hydrate(globalRows, true),
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error reading recipes");
  }
});

/* =========================
   AI-STYLE RECIPE GENERATOR
   ========================= */

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function pickN(arr, n) {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean).map((x) => String(x).trim()))];
}

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function titleCase(str) {
  return String(str || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

function includesAny(text, bannedWords) {
  const t = normalize(text);
  return bannedWords.some((w) => t.includes(normalize(w)));
}

function recipeViolates(recipe, bannedWords) {
  const tags = recipe.dietaryTags || [];
  const ingredients = recipe.ingredients || [];
  const title = recipe.title || "";
  const description = recipe.description || "";
  const steps = recipe.steps || [];

  if (includesAny(title, bannedWords)) return true;
  if (includesAny(description, bannedWords)) return true;
  if (tags.some((t) => includesAny(t, bannedWords))) return true;
  if (ingredients.some((i) => includesAny(i, bannedWords))) return true;
  if (steps.some((s) => includesAny(s, bannedWords))) return true;

  return false;
}

function getBannedWords(allergies = [], dietary = "any") {
  const banned = new Set();

  for (const a of allergies.map(normalize)) {
    if (a === "peanut") {
      ["peanut", "peanuts", "peanut butter", "satay"].forEach((x) => banned.add(x));
    }
    if (a === "dairy") {
      ["milk", "cheese", "cream", "butter", "yogurt", "parmesan", "mozzarella", "feta", "halloumi", "tzatziki"].forEach((x) => banned.add(x));
    }
    if (a === "gluten" || a === "wheat") {
      ["bread", "pasta", "flour", "tortilla", "breadcrumbs", "soy sauce", "couscous", "naan"].forEach((x) => banned.add(x));
    }
    if (a === "seafood") {
      ["fish", "salmon", "shrimp", "tuna", "cod"].forEach((x) => banned.add(x));
    }
    if (a === "soy") {
      ["tofu", "soy sauce", "edamame", "tempeh", "miso"].forEach((x) => banned.add(x));
    }
    if (a === "egg" || a === "eggs") {
      ["egg", "eggs", "mayo"].forEach((x) => banned.add(x));
    }
    if (a === "tree nuts" || a === "tree_nuts") {
      ["almond", "cashew", "walnut", "pecan", "pesto"].forEach((x) => banned.add(x));
    }
  }

  if (dietary === "gluten-free") {
    ["bread", "pasta", "flour", "tortilla", "breadcrumbs", "soy sauce", "couscous", "naan"].forEach((x) => banned.add(x));
  }

  if (dietary === "dairy-free") {
    ["milk", "cheese", "cream", "butter", "yogurt", "parmesan", "mozzarella", "feta", "halloumi", "tzatziki"].forEach((x) => banned.add(x));
  }

  return [...banned];
}

function buildProteinPool({ type, dietary, preferences = [] }) {
  const prefSet = new Set(preferences.map(normalize));

  let pool;

  if (type === "vegan") {
    pool = [
      { name: "crispy tofu", tags: ["vegan", "vegetarian", "high-protein", "dairy-free"] },
      { name: "chickpeas", tags: ["vegan", "vegetarian", "dairy-free"] },
      { name: "lentils", tags: ["vegan", "vegetarian", "dairy-free"] },
      { name: "black beans", tags: ["vegan", "vegetarian", "dairy-free"] },
      { name: "white beans", tags: ["vegan", "vegetarian", "dairy-free"] },
      { name: "tempeh", tags: ["vegan", "vegetarian", "high-protein", "dairy-free"] },
      { name: "spiced chickpeas", tags: ["vegan", "vegetarian", "dairy-free"] },
    ];
  } else if (type === "vegetarian") {
    pool = [
      { name: "halloumi", tags: ["vegetarian", "high-protein"] },
      { name: "eggs", tags: ["vegetarian", "high-protein", "gluten-free"] },
      { name: "chickpeas", tags: ["vegetarian", "dairy-free"] },
      { name: "black beans", tags: ["vegetarian", "gluten-free"] },
      { name: "tofu", tags: ["vegetarian", "vegan", "dairy-free", "high-protein"] },
      { name: "white beans", tags: ["vegetarian", "dairy-free"] },
      { name: "paneer", tags: ["vegetarian", "high-protein"] },
    ];
  } else if (type === "protein") {
    pool = [
      { name: "chicken", tags: ["high-protein"] },
      { name: "turkey", tags: ["high-protein"] },
      { name: "salmon", tags: ["high-protein", "gluten-free"] },
      { name: "lean beef", tags: ["high-protein"] },
      { name: "tofu", tags: ["high-protein", "vegan", "vegetarian", "dairy-free"] },
      { name: "eggs", tags: ["high-protein", "vegetarian", "gluten-free"] },
      { name: "shrimp", tags: ["high-protein", "gluten-free"] },
      { name: "ground turkey", tags: ["high-protein"] },
    ];
  } else {
    pool = [
      { name: "chicken", tags: ["high-protein"] },
      { name: "turkey", tags: ["high-protein"] },
      { name: "salmon", tags: ["high-protein", "gluten-free"] },
      { name: "lean beef", tags: ["high-protein"] },
      { name: "tofu", tags: ["vegan", "vegetarian", "dairy-free", "high-protein"] },
      { name: "chickpeas", tags: ["vegan", "vegetarian", "dairy-free"] },
      { name: "eggs", tags: ["vegetarian", "high-protein", "gluten-free"] },
      { name: "ground turkey", tags: ["high-protein"] },
      { name: "white beans", tags: ["vegan", "vegetarian", "dairy-free"] },
      { name: "shrimp", tags: ["high-protein", "gluten-free"] },
    ];
  }

  if (dietary === "halal") {
    pool = pool.filter((p) => !["lean beef", "shrimp", "salmon"].includes(p.name));
    pool.push({ name: "halal chicken", tags: ["high-protein", "halal"] });
    pool.push({ name: "halal beef strips", tags: ["high-protein", "halal"] });
  }

  const preferredOrder = [];
  const rest = [];

  for (const item of pool) {
    const n = normalize(item.name);
    if (
      (prefSet.has("chicken") && n.includes("chicken")) ||
      (prefSet.has("beef") && n.includes("beef")) ||
      (prefSet.has("fish") && (n.includes("salmon") || n.includes("shrimp"))) ||
      (prefSet.has("eggs") && n.includes("egg")) ||
      (prefSet.has("vegetarian") && item.tags.includes("vegetarian")) ||
      (prefSet.has("vegan") && item.tags.includes("vegan"))
    ) {
      preferredOrder.push(item);
    } else {
      rest.push(item);
    }
  }

  return [...preferredOrder, ...rest];
}

function buildBasePool({ time, dietary, type }) {
  let pool =
    time === "quick"
      ? ["rice", "quinoa", "mixed greens", "potatoes", "rice noodles"]
      : time === "medium"
      ? ["rice", "quinoa", "potatoes", "pasta", "couscous", "rice noodles", "orzo"]
      : ["rice", "quinoa", "potatoes", "pasta", "couscous", "orzo", "bulgur"];

  if (type === "vegan" || type === "vegetarian") {
    pool.push("farro");
  }

  if (dietary === "gluten-free") {
    pool = pool.filter((x) => !["pasta", "couscous", "orzo", "bulgur", "farro"].includes(x));
  }

  if (dietary === "halal") {
    pool.push("basmati rice");
  }

  return uniq(pool);
}

function buildVegPool() {
  return [
    "broccoli",
    "spinach",
    "bell pepper",
    "zucchini",
    "carrots",
    "onion",
    "mushrooms",
    "tomatoes",
    "cucumber",
    "corn",
    "green beans",
    "cauliflower",
    "sweet potato",
    "peas",
    "roasted red pepper",
    "kale",
    "eggplant",
    "cherry tomatoes",
    "red onion",
    "snap peas",
  ];
}

function buildHerbPool() {
  return [
    "parsley",
    "cilantro",
    "basil",
    "oregano",
    "mint",
    "chives",
  ];
}

function buildMethodPool(time, type) {
  const quick = ["Skillet", "Wrap", "Bowl", "Salad", "Toss", "Quick Plate"];
  const medium = ["Stir-Fry", "Rice Bowl", "Pasta", "Tacos", "Warm Bowl", "Sauté"];
  const long = ["Roast Bowl", "Bake", "Stew", "Curry", "Tray Bake", "Oven Bowl"];

  if (type === "vegan") {
    quick.push("Power Bowl");
    medium.push("Veggie Toss");
    long.push("Hearty Roast");
  }

  if (time === "quick") return quick;
  if (time === "medium") return medium;
  return long;
}

function buildSaucePool(spicy, dietary) {
  const mildSauces = [
    "garlic herb drizzle",
    "lemon olive dressing",
    "tomato basil sauce",
    "honey mustard glaze",
    "lime yogurt sauce",
    "roasted garlic dressing",
    "creamy herb sauce",
    "balsamic glaze",
    "pesto drizzle",
    "sesame ginger sauce",
  ];

  const spicySauces = [
    "chili garlic sauce",
    "spicy tomato sauce",
    "jalapeño lime drizzle",
    "sriracha glaze",
    "cayenne pepper oil",
    "harissa sauce",
    "chipotle drizzle",
    "spicy tahini sauce",
    "hot honey glaze",
    "peri-peri style sauce",
  ];

  let pool =
    spicy === "spicy"
      ? spicySauces
      : spicy === "mild"
      ? mildSauces
      : [...mildSauces, ...spicySauces];

  if (dietary === "dairy-free") {
    pool = pool.filter((s) => !normalize(s).includes("yogurt") && !normalize(s).includes("creamy"));
  }

  if (dietary === "gluten-free") {
    pool = pool.filter((s) => !normalize(s).includes("sesame ginger"));
  }

  return pool;
}

function buildSeasoningPool(spicy) {
  const mild = ["black pepper", "paprika", "garlic powder", "onion powder", "italian seasoning"];
  const hot = ["chili flakes", "cayenne", "smoked chili powder", "hot paprika", "jalapeño slices"];
  return spicy === "spicy" ? hot : spicy === "mild" ? mild : [...mild, ...hot];
}

function buildTitlePatterns() {
  return [
    "{adj} {protein} {method}",
    "{adj} {style} {protein} {method}",
    "{style} {protein} {method}",
    "{adj} {protein} with {base}",
    "{protein} and {veg} {method}",
    "{adj} {veg} {protein} {method}",
  ];
}

function buildDescriptionPatterns() {
  return [
    "A freshly generated {methodLower} built with {protein}, {base}, and {vegList}, finished with {sauce}.",
    "A flavorful combo of {protein}, {vegList}, and {base} with a {sauce}.",
    "A satisfying meal featuring {protein}, tender {vegList}, and {base}, tied together with {sauce}.",
    "A custom-made recipe with {protein}, {base}, and a mix of {vegList} for an easy homemade meal.",
    "A cozy plate centered around {protein}, tossed with {vegList} and served over {base} with {sauce}.",
  ];
}

function fillPattern(pattern, vars) {
  return pattern
    .replaceAll("{adj}", vars.adj)
    .replaceAll("{style}", vars.style)
    .replaceAll("{protein}", vars.protein)
    .replaceAll("{method}", vars.method)
    .replaceAll("{methodLower}", normalize(vars.method))
    .replaceAll("{base}", vars.base)
    .replaceAll("{veg}", vars.veg)
    .replaceAll("{vegList}", vars.vegList)
    .replaceAll("{sauce}", vars.sauce)
    .replace(/\s+/g, " ")
    .trim();
}

function buildCost(cost) {
  if (cost === "cheap") return Number((3.5 + Math.random() * 1.5).toFixed(2));
  if (cost === "moderate") return Number((5.2 + Math.random() * 2.8).toFixed(2));
  if (cost === "splurge") return Number((8.5 + Math.random() * 4.2).toFixed(2));
  return Number((4.5 + Math.random() * 5.5).toFixed(2));
}

function buildTimes(time, method) {
  const lower = normalize(method);

  if (time === "quick") {
    return {
      prepTime: 5 + Math.floor(Math.random() * 5),
      cookTime: 6 + Math.floor(Math.random() * 7),
    };
  }

  if (time === "medium") {
    return {
      prepTime: 8 + Math.floor(Math.random() * 7),
      cookTime: 12 + Math.floor(Math.random() * 12),
    };
  }

  if (lower.includes("stew") || lower.includes("curry") || lower.includes("bake") || lower.includes("roast")) {
    return {
      prepTime: 12 + Math.floor(Math.random() * 9),
      cookTime: 24 + Math.floor(Math.random() * 18),
    };
  }

  return {
    prepTime: 12 + Math.floor(Math.random() * 8),
    cookTime: 20 + Math.floor(Math.random() * 15),
  };
}

function inferExtraTags({ protein, base, sauce, dietary, spicy }) {
  const tags = [];

  const p = normalize(protein);
  const b = normalize(base);
  const s = normalize(sauce);

  if (p.includes("chicken") || p.includes("turkey") || p.includes("beef") || p.includes("salmon") || p.includes("shrimp") || p.includes("egg")) {
    tags.push("high-protein");
  }

  if (p.includes("tofu") || p.includes("chickpea") || p.includes("lentil") || p.includes("bean") || p.includes("tempeh")) {
    tags.push("vegan", "vegetarian", "dairy-free");
  }

  if (p.includes("halloumi") || p.includes("paneer") || p.includes("egg")) {
    tags.push("vegetarian");
  }

  if (["rice", "quinoa", "potatoes", "basmati rice", "rice noodles"].includes(b)) {
    tags.push("gluten-free");
  }

  if (spicy === "spicy" || s.includes("spicy") || s.includes("chili") || s.includes("chipotle") || s.includes("harissa") || s.includes("peri-peri")) {
    tags.push("spicy");
  }

  if (dietary && dietary !== "any") {
    tags.push(dietary);
  }

  return uniq(tags);
}

function buildSteps({ protein, base, vegs, sauce, herb, method, spicy }) {
  const lowerMethod = normalize(method);
  const seasoning = rand(buildSeasoningPool(spicy));
  const vegText = vegs.join(", ");

  if (lowerMethod.includes("salad")) {
    return [
      `Prep the ${protein}, ${base}, and vegetables: ${vegText}.`,
      normalize(base) === "mixed greens"
        ? `Arrange the mixed greens in a large bowl.`
        : `Cook the ${base} and let it cool slightly.`,
      `Cook the ${protein} with ${seasoning} until well seasoned.`,
      `Slice or toss together the vegetables and add the ${herb}.`,
      `Assemble everything and finish with the ${sauce}.`,
      `Serve immediately and enjoy.`,
    ];
  }

  if (lowerMethod.includes("wrap")) {
    return [
      `Prep the ${protein}, ${base}, and vegetables: ${vegText}.`,
      `Cook the ${protein} with ${seasoning} until golden and flavorful.`,
      normalize(base) === "mixed greens"
        ? `Toss the greens with part of the ${sauce}.`
        : `Cook the ${base} until tender.`,
      `Cook or warm the vegetables until just tender.`,
      `Layer everything together with the ${sauce} and ${herb}.`,
      `Wrap, slice, and serve.`,
    ];
  }

  if (lowerMethod.includes("stew") || lowerMethod.includes("curry")) {
    return [
      `Prep the ${protein}, ${base}, and vegetables: ${vegText}.`,
      `Cook the ${protein} with ${seasoning} until lightly browned.`,
      `Add the vegetables and cook until slightly softened.`,
      `Stir in the ${sauce} and simmer until everything is tender.`,
      `Cook the ${base} separately until ready.`,
      `Serve the mixture over the ${base} and finish with ${herb}.`,
    ];
  }

  if (lowerMethod.includes("bake") || lowerMethod.includes("roast") || lowerMethod.includes("tray")) {
    return [
      `Prep the ${protein}, ${base}, and vegetables: ${vegText}.`,
      `Season the ${protein} with ${seasoning}.`,
      `Arrange the protein and vegetables on a tray and roast or bake until tender.`,
      normalize(base) === "mixed greens"
        ? `Prepare the greens in a serving bowl.`
        : `Cook the ${base} until fluffy and ready to serve.`,
      `Drizzle everything with the ${sauce} and sprinkle over the ${herb}.`,
      `Plate and serve warm.`,
    ];
  }

  return [
    `Prep the ${protein}, ${base}, and vegetables: ${vegText}.`,
    normalize(base) === "mixed greens"
      ? `Wash and arrange the mixed greens in a bowl.`
      : `Cook the ${base} until tender.`,
    `Cook the ${protein} with ${seasoning} until fully done and well seasoned.`,
    `Sauté the vegetables — ${vegText} — until tender.`,
    `Combine everything and finish with the ${sauce} and ${herb}.`,
    `Taste, adjust seasoning, and serve warm.`,
  ];
}

function buildRecipeFromAnswers({ answers, allergies, preferences, excludeTitles }) {
  const {
    time = "any",
    type = "any",
    spicy = "any",
    cost = "any",
    dietary = "any",
  } = answers || {};

  const adjectives = [
    "Cozy",
    "Zesty",
    "Golden",
    "Smoky",
    "Fresh",
    "Savory",
    "Loaded",
    "Herby",
    "Bright",
    "Comfort",
    "Simple",
    "Hearty",
    "Crispy",
    "Sizzling",
    "Weeknight",
  ];

  const styles = [
    "Mediterranean",
    "Street-Style",
    "Roasted",
    "Garden",
    "Homestyle",
    "Spiced",
    "Lemon",
    "Garlic",
    "Chili",
    "Power",
    "Harvest",
    "Warm",
  ];

  const bannedWords = getBannedWords(allergies, dietary);

  let proteinPool = buildProteinPool({ type, dietary, preferences }).filter(
    (p) => !includesAny(p.name, bannedWords)
  );

  let basePool = buildBasePool({ time, dietary, type }).filter(
    (b) => !includesAny(b, bannedWords)
  );

  let vegPool = buildVegPool().filter((v) => !includesAny(v, bannedWords));
  let herbPool = buildHerbPool().filter((h) => !includesAny(h, bannedWords));
  let methodPool = buildMethodPool(time, type);
  let saucePool = buildSaucePool(spicy, dietary).filter((s) => !includesAny(s, bannedWords));

  if (!proteinPool.length) {
    proteinPool = [{ name: "chickpeas", tags: ["vegan", "vegetarian", "dairy-free"] }];
  }
  if (!basePool.length) {
    basePool = ["rice"];
  }
  if (vegPool.length < 3) {
    vegPool = ["broccoli", "carrots", "spinach", "bell pepper"];
  }
  if (!herbPool.length) {
    herbPool = ["parsley"];
  }
  if (!methodPool.length) {
    methodPool = ["Bowl"];
  }
  if (!saucePool.length) {
    saucePool = ["lemon olive dressing"];
  }

  const exclude = new Set((excludeTitles || []).map(normalize));
  const titlePatterns = buildTitlePatterns();
  const descriptionPatterns = buildDescriptionPatterns();

  for (let attempt = 0; attempt < 100; attempt++) {
    const proteinObj = rand(proteinPool);
    const protein = proteinObj.name;
    const base = rand(basePool);
    const vegs = pickN(vegPool, 3);
    const herb = rand(herbPool);
    const sauce = rand(saucePool);
    const method = rand(methodPool);
    const adj = rand(adjectives);
    const style = rand(styles);

    const vars = {
      adj,
      style,
      protein: titleCase(protein),
      method,
      base,
      veg: titleCase(rand(vegs)),
      vegList: vegs.join(", "),
      sauce,
    };

    let title = fillPattern(rand(titlePatterns), vars);
    title = title
      .replace(/^Halal chicken/i, "Halal Chicken")
      .replace(/^Halal beef strips/i, "Halal Beef Strips")
      .replace(/\s+/g, " ")
      .trim();

    if (exclude.has(normalize(title))) continue;

    const description = fillPattern(rand(descriptionPatterns), {
      ...vars,
      protein,
    });

    const times = buildTimes(time, method);

    const tags = uniq([
      ...proteinObj.tags,
      ...inferExtraTags({ protein, base, sauce, dietary, spicy }),
    ]);

    const recipe = {
      title,
      description,
      prepTime: times.prepTime,
      cookTime: times.cookTime,
      cost: buildCost(cost),
      dietaryTags: tags,
      ingredients: uniq([
        protein,
        base,
        ...vegs,
        sauce,
        herb,
        rand(buildSeasoningPool(spicy)),
        "olive oil",
        "salt",
      ]),
      steps: buildSteps({ protein, base, vegs, sauce, herb, method, spicy }),
      isGlobal: false,
      generatedByAI: true,
    };

    if (recipeViolates(recipe, bannedWords)) continue;

    return recipe;
  }

  return {
    title: "Custom Chickpea Rice Bowl",
    description: "A fallback generated recipe based on your answers.",
    prepTime: 8,
    cookTime: 12,
    cost: 4.75,
    dietaryTags: ["vegan", "vegetarian", "dairy-free", dietary !== "any" ? dietary : null].filter(Boolean),
    ingredients: ["chickpeas", "rice", "spinach", "carrots", "lemon olive dressing", "olive oil", "salt"],
    steps: [
      "Cook the rice.",
      "Cook the chickpeas with olive oil and seasoning.",
      "Sauté the vegetables until tender.",
      "Assemble everything in a bowl.",
      "Finish with the dressing and serve.",
    ],
    isGlobal: false,
    generatedByAI: true,
  };
}

app.post("/recipes/generate", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const answers = req.body?.answers || {};
    const excludeTitles = Array.isArray(req.body?.excludeTitles) ? req.body.excludeTitles : [];

    const required = ["time", "type", "spicy", "cost", "dietary"];
    const missing = required.filter((k) => !answers[k]);

    if (missing.length) {
      return res.status(400).json({ error: "Missing quiz answers" });
    }

    const allergies = (
      await all(`SELECT allergy FROM user_allergies WHERE user_id = ? ORDER BY allergy`, [userId])
    ).map((r) => r.allergy);

    const preferences = (
      await all(`SELECT preference FROM user_preferences WHERE user_id = ? ORDER BY preference`, [userId])
    ).map((r) => r.preference);

    const existingTitles = (
      await all(`SELECT title FROM recipes WHERE owner_user_id = ? OR is_global = 1`, [userId])
    ).map((r) => r.title);

    const recipe = buildRecipeFromAnswers({
      answers,
      allergies,
      preferences,
      excludeTitles: [...excludeTitles, ...existingTitles],
    });

    res.json({ ok: true, recipe });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to generate recipe" });
  }
});

/* =========================
   AUTH ROUTES (SQL)
   ========================= */

app.post("/register", async (req, res) => {
  try {
    let { username, password } = req.body;

    username = (username || "").trim();
    password = (password || "").trim();

    if (username.length < 6) {
      return res.status(400).send("Username must be at least 6 characters long");
    }

    if (password.length < 6) {
      return res.status(400).send("Password must be at least 6 characters long");
    }

    const existing = await get(`SELECT id FROM users WHERE username = ?`, [
      username,
    ]);

    if (existing) {
      return res.status(400).send("Username already exists");
    }

    const password_hash = await bcrypt.hash(password, 10);
    const ins = await run(
      `INSERT INTO users (username, password_hash) VALUES (?, ?)`,
      [username, password_hash]
    );
    const userId = ins.lastID;

    let allergies = req.body.allergies || [];
    let preferences = req.body.preferences || [];

    if (!Array.isArray(allergies)) allergies = [allergies];
    if (!Array.isArray(preferences)) preferences = [preferences];

    allergies = allergies.map((a) => String(a).trim()).filter(Boolean);
    preferences = preferences.map((p) => String(p).trim()).filter(Boolean);

    for (const a of allergies) {
      await run(
        `INSERT OR IGNORE INTO user_allergies (user_id, allergy) VALUES (?, ?)`,
        [userId, a]
      );
    }

    for (const p of preferences) {
      await run(
        `INSERT OR IGNORE INTO user_preferences (user_id, preference) VALUES (?, ?)`,
        [userId, p]
      );
    }

    return res.send("User registered successfully");
  } catch (e) {
    console.error(e);
    res.status(500).send("Error registering user");
  }
});

app.post("/login", async (req, res) => {
  try {
    let { username, password } = req.body;

    username = (username || "").trim();
    password = (password || "").trim();

    const user = await get(
      `SELECT id, username, password_hash FROM users WHERE username = ?`,
      [username]
    );

    if (!user) {
      return res.status(401).send("Invalid username or password");
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).send("Invalid username or password");
    }

    req.session.user = { id: user.id, username: user.username };
    return req.session.save(() => res.send("Login successful"));
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Could not log out");
    res.clearCookie("mealmj_sid");
    res.send("Logged out");
  });
});

/* =========================
   RECIPE CRUD (SQL)
   ========================= */

app.delete("/recipes/:id", requireAuth, async (req, res) => {
  const id = req.params.id;

  try {
    await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [id]);
    await run(`DELETE FROM recipe_steps WHERE recipe_id = ?`, [id]);
    await run(`DELETE FROM recipe_tags WHERE recipe_id = ?`, [id]);
    await run(`DELETE FROM recipes WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Open one recipe
app.get("/recipes/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({ error: "No recipe ID provided" });
    }

    const r = await get(
      `SELECT id, title, description, prep_time, cook_time, cost, owner_user_id
       FROM recipes
       WHERE id = ?`,
      [id]
    );

    if (!r) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    if (r.owner_user_id !== userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const ingredients = (
      await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [
        id,
      ])
    ).map((x) => x.ingredient);

    const steps = (
      await all(
        `SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`,
        [id]
      )
    ).map((x) => x.step_text);

    const dietaryTags = (
      await all(`SELECT tag FROM recipe_tags WHERE recipe_id = ? ORDER BY tag`, [id])
    ).map((x) => x.tag);

    res.json({
      id: String(r.id),
      title: r.title,
      description: r.description || "",
      prepTime: r.prep_time,
      cookTime: r.cook_time,
      cost: r.cost,
      ingredients,
      steps,
      dietaryTags,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error reading recipe" });
  }
});

// Update the recipe
app.put("/recipes/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const id = req.params.id;

    const {
      title,
      description,
      prepTime,
      cookTime,
      cost,
      ingredients,
      steps,
      dietaryTags,
    } = req.body;

    const existing = await get(
      `SELECT owner_user_id FROM recipes WHERE id = ?`,
      [id]
    );

    if (!existing) return res.status(404).send("Recipe not found");
    if (existing.owner_user_id !== userId) {
      return res.status(403).send("Not authorized");
    }

    await run(
      `UPDATE recipes
       SET title = ?, description = ?, prep_time = ?, cook_time = ?, cost = ?
       WHERE id = ?`,
      [
        String(title || "").trim(),
        String(description || "").trim(),
        Number(prepTime || 0),
        Number(cookTime || 0),
        Number(cost || 0),
        id,
      ]
    );

    await run(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`, [id]);
    await run(`DELETE FROM recipe_steps WHERE recipe_id = ?`, [id]);
    await run(`DELETE FROM recipe_tags WHERE recipe_id = ?`, [id]);

    if (Array.isArray(ingredients)) {
      for (const i of ingredients) {
        const clean = String(i).trim();
        if (clean) {
          await run(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)`,
            [id, clean]
          );
        }
      }
    }

    if (Array.isArray(steps)) {
      for (let idx = 0; idx < steps.length; idx++) {
        const s = String(steps[idx]).trim();
        if (s) {
          await run(
            `INSERT INTO recipe_steps (recipe_id, step_index, step_text)
             VALUES (?, ?, ?)`,
            [id, idx, s]
          );
        }
      }
    }

    if (Array.isArray(dietaryTags)) {
      for (const t of dietaryTags) {
        const clean = String(t).trim();
        if (clean) {
          await run(
            `INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)`,
            [id, clean]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).send("Error updating recipe");
  }
});

/* =========================
   MEAL PLAN BACKEND
   ========================= */

app.post("/plan/save", requireAuth, async (req, res) => {
  try {
    const { day, meal, recipeId } = req.body;

    if (!day || !meal || !recipeId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    await run(
      `INSERT INTO meal_plans (user_id, day, meal, recipe_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, day, meal)
       DO UPDATE SET recipe_id = excluded.recipe_id`,
      [req.session.user.id, day, meal, recipeId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("SAVE ERROR:", err);
    res.status(500).json({ error: "Failed to save meal plan" });
  }
});

app.post("/plan/delete", requireAuth, async (req, res) => {
  const { day, meal } = req.body;

  if (!day || !meal) {
    return res.status(400).json({ error: "Missing day or meal" });
  }

  try {
    await run(
      `DELETE FROM meal_plans WHERE user_id = ? AND day = ? AND meal = ?`,
      [req.session.user.id, day, meal]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete meal plan" });
  }
});

app.get("/plan", requireAuth, async (req, res) => {
  try {
    const rows = await all(
      `SELECT day, meal, recipe_id
       FROM meal_plans
       WHERE user_id = ?`,
      [req.session.user.id]
    );

    res.json({ meals: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load meal plan" });
  }
});

app.post("/plan/clear-day", requireAuth, async (req, res) => {
  const { day } = req.body;

  try {
    await run(
      `DELETE FROM meal_plans WHERE user_id = ? AND day = ?`,
      [req.session.user.id, day]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear day" });
  }
});

/* =========================
   STATIC + EXPORT
   ========================= */

app.use(express.static(path.join(__dirname, "..", "..", "public")));

initDb()
  .then(() => {
    const PORT = process.env.PORT || 3000;

    if (require.main === module) {
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
  });

module.exports = app;
