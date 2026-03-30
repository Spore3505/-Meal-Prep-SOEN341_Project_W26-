// server.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { initDb, run, get, all } = require("./db");

const app = express();

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

// Serve static files (protect these pages)
app.use(
  ["/account.html", "/create.html", "/edit.html", "/recipes.html"],
  requireAuth
);

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Home.html"));
});

// Protect account page (explicit)
app.get("/account.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "account.html"));
});

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

// Read logged-in user's allergies/preferences
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

// Update logged-in user's allergies/preferences (overwrite)
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

// Save recipe (personal)
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

// Get all personal recipes for logged-in user
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
