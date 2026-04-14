const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

// Path to SQLite database file
const DB_PATH = path.join(__dirname, "../models/mealmajor.db");

// Create database connection
const db = new sqlite3.Database(DB_PATH);

// ------------------------
// Promise helper functions
// ------------------------

// Run INSERT, UPDATE, DELETE queries
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // gives access to lastID, changes, etc.
    });
  });
}

// Run SELECT query for a single row
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

// Run SELECT query for multiple rows
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ------------------------
// Database initialization
// ------------------------

async function initDb() {
  // Enable foreign key constraints
  await run("PRAGMA foreign_keys = ON");

  // ------------------------
  // Users table
  // ------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Stores allergies per user
  await run(`
    CREATE TABLE IF NOT EXISTS user_allergies (
      user_id INTEGER NOT NULL,
      allergy TEXT NOT NULL,
      PRIMARY KEY (user_id, allergy),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Stores food preferences per user
  await run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER NOT NULL,
      preference TEXT NOT NULL,
      PRIMARY KEY (user_id, preference),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // ------------------------
  // Recipes table
  // ------------------------
  await run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER, // null = global recipe
      title TEXT NOT NULL,
      description TEXT,
      prep_time INTEGER NOT NULL DEFAULT 0,
      cook_time INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_global INTEGER NOT NULL DEFAULT 0, // 1 = global recipe
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Ingredients for each recipe
  await run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      ingredient TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  // Steps for each recipe (ordered by step_index)
  await run(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL,
      step_text TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  // Dietary tags (e.g., vegetarian, vegan, high-protein)
  await run(`
    CREATE TABLE IF NOT EXISTS recipe_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  // Meal planner (links user + day + meal to a recipe)
  await run(`
    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      meal TEXT NOT NULL,
      recipe_id INTEGER NOT NULL,
      UNIQUE(user_id, day, meal), // prevents duplicates
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  // ------------------------
  // Indexes (for performance)
  // ------------------------
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_global ON recipes(is_global)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title)`);

  // ------------------------
  // Seed global recipes (only if none exist)
  // ------------------------
  const countRow = await get(`SELECT COUNT(*) AS c FROM recipes WHERE is_global`);
  if ((countRow?.c || 0) === 0) {
    const globalPath = path.join(__dirname, "..", "..", "global_recipes.json");

    let seed = null;

    // Try loading recipes from JSON file
    if (fs.existsSync(globalPath)) {
      try {
        const raw = fs.readFileSync(globalPath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) seed = parsed;
      } catch {
        seed = null;
      }
    }

    // Fallback default recipes
    if (!seed) {
      seed = [
        {
          title: "Overnight Oats",
          description: "Easy breakfast prep for the week",
          prepTime: 5,
          cookTime: 0,
          cost: 3.5,
          dietaryTags: ["vegetarian"],
          ingredients: ["1 cup oats", "1 cup milk", "1 tbsp honey", "berries"],
          steps: ["Mix everything in a jar", "Refrigerate overnight", "Eat cold"],
        },
        {
          title: "Chicken & Rice Bowl",
          description: "Simple meal prep lunch",
          prepTime: 10,
          cookTime: 20,
          cost: 7.0,
          dietaryTags: ["high-protein"],
          ingredients: ["200 g chicken", "1 cup rice", "salt", "pepper", "frozen veggies"],
          steps: ["Cook rice", "Cook chicken", "Add veggies", "Assemble bowls"],
        }
      ];
    }

    // Insert seed recipes into DB
    for (const r of seed) {
      const title = String(r.title || "").trim();
      if (!title) continue;

      const ins = await run(
        `INSERT INTO recipes (owner_user_id, title, description, prep_time, cook_time, cost, is_global)
         VALUES (NULL, ?, ?, ?, ?, ?, 1)`,
        [
          title,
          String(r.description || "").trim(),
          Number(r.prepTime || 0),
          Number(r.cookTime || 0),
          Number(r.cost || 0),
        ]
      );

      const recipeId = ins.lastID;

      const ingredients = Array.isArray(r.ingredients) ? r.ingredients.map(String) : [];
      const steps = Array.isArray(r.steps) ? r.steps.map(String) : [];
      const tags = Array.isArray(r.dietaryTags) ? r.dietaryTags.map(String) : [];

      // Insert ingredients
      for (const ing of ingredients) {
        const clean = String(ing).trim();
        if (clean) {
          await run(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)`,
            [recipeId, clean]
          );
        }
      }

      // Insert steps (ordered)
      for (let i = 0; i < steps.length; i++) {
        const st = String(steps[i]).trim();
        if (st) {
          await run(
            `INSERT INTO recipe_steps (recipe_id, step_index, step_text) VALUES (?, ?, ?)`,
            [recipeId, i, st]
          );
        }
      }

      // Insert dietary tags
      for (const t of tags) {
        const clean = String(t).trim();
        if (clean) {
          await run(
            `INSERT INTO recipe_tags (recipe_id, tag) VALUES (?, ?)`,
            [recipeId, clean]
          );
        }
      }
    }
  }
}

// Export DB functions
module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
