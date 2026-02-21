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
app.use(express.static(__dirname));

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
  if (req.session?.user) return res.json({ loggedIn: true, user: req.session.user });
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

    const allergies = (await all(`SELECT allergy FROM user_allergies WHERE user_id = ? ORDER BY allergy`, [userId]))
      .map((r) => r.allergy);

    const preferences = (await all(`SELECT preference FROM user_preferences WHERE user_id = ? ORDER BY preference`, [userId]))
      .map((r) => r.preference);

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
      await run(`INSERT INTO user_allergies (user_id, allergy) VALUES (?, ?)`, [userId, a]);
    }
    for (const p of preferences) {
      await run(`INSERT INTO user_preferences (user_id, preference) VALUES (?, ?)`, [userId, p]);
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

    const { title, description, prepTime, cookTime, cost, ingredients, steps } = req.body || {};
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) return res.status(400).send("Recipe name is required");

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

    for (const i of ing) {
      const clean = String(i).trim();
      if (clean) await run(`INSERT INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)`, [recipeId, clean]);
    }
    for (let idx = 0; idx < stp.length; idx++) {
      const s = String(stp[idx]).trim();
      if (s) await run(`INSERT INTO recipe_steps (recipe_id, step_index, step_text) VALUES (?, ?, ?)`, [recipeId, idx, s]);
    }

    // Return same shape your frontend expects
    const recipe = {
      id: String(recipeId),
      title: cleanTitle,
      description: String(description || "").trim(),
      prepTime: Number(prepTime || 0),
      cookTime: Number(cookTime || 0),
      cost: Number(cost || 0),
      ingredients: ing,
      steps: stp,
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
      const ingredients = (await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [r.id]))
        .map((x) => x.ingredient);

      const steps = (await all(`SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`, [r.id]))
        .map((x) => x.step_text);

      out.push({
        id: String(r.id),
        title: r.title,
        description: r.description || "",
        prepTime: r.prep_time,
        cookTime: r.cook_time,
        cost: r.cost,
        ingredients,
        steps,
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
      const ingredients = (await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [r.id]))
        .map((x) => x.ingredient);

      const steps = (await all(`SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`, [r.id]))
        .map((x) => x.step_text);

      out.push({
        id: "g" + String(r.id),
        title: r.title,
        description: r.description || "",
        prepTime: r.prep_time,
        cookTime: r.cook_time,
        cost: r.cost,
        ingredients,
        steps,
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
        const ingredients = (await all(`SELECT ingredient FROM recipe_ingredients WHERE recipe_id = ?`, [r.id]))
          .map((x) => x.ingredient);

        const steps = (await all(`SELECT step_text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_index`, [r.id]))
          .map((x) => x.step_text);

        out.push({
          id: String(r.id),
          title: r.title,
          description: r.description || "",
          prepTime: r.prep_time,
          cookTime: r.cook_time,
          cost: r.cost,
          ingredients,
          steps,
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

    const existing = await get(`SELECT id FROM users WHERE username = ?`, [username]);
    if (existing) return res.status(400).send("Username already exists");

    const password_hash = await bcrypt.hash(password, 10);
    const ins = await run(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [username, password_hash]);
    const userId = ins.lastID;

    // Grab allergies & preferences from request (optional)
    let allergies = req.body.allergies || [];
    let preferences = req.body.preferences || [];

    if (!Array.isArray(allergies)) allergies = [allergies];
    if (!Array.isArray(preferences)) preferences = [preferences];

    allergies = allergies.map((a) => String(a).trim()).filter(Boolean);
    preferences = preferences.map((p) => String(p).trim()).filter(Boolean);

    for (const a of allergies) {
      await run(`INSERT OR IGNORE INTO user_allergies (user_id, allergy) VALUES (?, ?)`, [userId, a]);
    }
    for (const p of preferences) {
      await run(`INSERT OR IGNORE INTO user_preferences (user_id, preference) VALUES (?, ?)`, [userId, p]);
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

    const user = await get(`SELECT id, username, password_hash FROM users WHERE username = ?`, [username]);
    if (!user) return res.status(401).send("Invalid username or password");

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).send("Invalid username or password");

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
   BOOT
   ========================= */

initDb()
  .then(() => {
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000");
    });
  })
  .catch((e) => {
    console.error("DB init failed:", e);
    process.exit(1);
  });