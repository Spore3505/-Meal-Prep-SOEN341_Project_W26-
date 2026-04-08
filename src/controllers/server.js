// server.js
const express = require("express");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { initDb, run, get, all } = require("../models/db");
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
app.get("/", (req, res) => res.sendFile(view("Home.html")));
app.get("/register.html", (req, res) => res.sendFile(view("register.html")));
app.get("/login.html", (req, res) => res.sendFile(view("login.html")));
app.get("/random_pick.html", requireAuth, (req, res) => res.sendFile(view("random_pick.html")));
app.get("/view_mealplan.html", requireAuth, (req, res) => res.sendFile(view("view_mealplan.html")));
app.get("/recipes.html", requireAuth, (req, res) => res.sendFile(view("recipes.html")));
app.get("/create.html", requireAuth, (req, res) => res.sendFile(view("create.html")));
app.get("/edit.html", requireAuth, (req, res) => res.sendFile(view("edit.html")));
app.get("/account.html", requireAuth, (req, res) => res.sendFile(view("account.html")));


function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.sendFile(path.join(__dirname, "src/views/login.html"));
}

// Serve static files (protect these pages)
app.use(
  ["/account.html", "/create.html", "/edit.html", "/recipes.html"],
  requireAuth
);






// Check login status
app.get("/me", (req, res) => {
  if (req.session?.user) {
    return res.json({ loggedIn: true, user: req.session.user });
  }
  res.json({ loggedIn: false });
});

const view = (name) => path.join(__dirname, "..", "views", name);
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

    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).send("Error reading recipes");
  }
});

/* =========================
   GLOBAL RECIPES (SQL)
   ========================= */

// Get global recipes
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

// Get both: mine + global
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

    console.log("Saving meal plan:", { day, meal, recipeId });

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