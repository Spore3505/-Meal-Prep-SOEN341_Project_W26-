// db.js
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "mealmajor.db");
const db = new sqlite3.Database(DB_PATH);const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = path.join(__dirname, "..", "..", "mealmajor.db");
const db = new sqlite3.Database(DB_PATH);

// Promise helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_allergies (
      user_id INTEGER NOT NULL,
      allergy TEXT NOT NULL,
      PRIMARY KEY (user_id, allergy),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER NOT NULL,
      preference TEXT NOT NULL,
      PRIMARY KEY (user_id, preference),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      prep_time INTEGER NOT NULL DEFAULT 0,
      cook_time INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_global INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      ingredient TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL,
      step_text TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipe_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      meal TEXT NOT NULL,
      recipe_id INTEGER NOT NULL,
      UNIQUE(user_id, day, meal),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_global ON recipes(is_global)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title)`);

  const countRow = await get(`SELECT COUNT(*) AS c FROM recipes WHERE is_global = 1`);
  if ((countRow?.c || 0) === 0) {
    const globalPath = path.join(__dirname, "..", "..", "global_recipes.json");

    let seed = null;
    if (fs.existsSync(globalPath)) {
      try {
        const raw = fs.readFileSync(globalPath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) seed = parsed;
      } catch {
        seed = null;
      }
    }

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

      for (const ing of ingredients) {
        const clean = String(ing).trim();
        if (clean) {
          await run(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)`,
            [recipeId, clean]
          );
        }
      }

      for (let i = 0; i < steps.length; i++) {
        const st = String(steps[i]).trim();
        if (st) {
          await run(
            `INSERT INTO recipe_steps (recipe_id, step_index, step_text) VALUES (?, ?, ?)`,
            [recipeId, i, st]
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
    }
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};

// Promise helpers
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this); // this.lastID
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_allergies (
      user_id INTEGER NOT NULL,
      allergy TEXT NOT NULL,
      PRIMARY KEY (user_id, allergy),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER NOT NULL,
      preference TEXT NOT NULL,
      PRIMARY KEY (user_id, preference),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      prep_time INTEGER NOT NULL DEFAULT 0,
      cook_time INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      is_global INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      ingredient TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      step_index INTEGER NOT NULL,
      step_text TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS recipe_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS meal_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      meal TEXT NOT NULL,
      recipe_id INTEGER NOT NULL,
      UNIQUE(user_id, day, meal),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )
  `);

  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_owner ON recipes(owner_user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_global ON recipes(is_global)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_recipes_title ON recipes(title)`);

  // Seed global recipes ONCE if none exist
  const countRow = await get(`SELECT COUNT(*) AS c FROM recipes WHERE is_global = 1`);
  if ((countRow?.c || 0) === 0) {
    const globalPath = path.join(__dirname, "global_recipes.json");

    let seed = null;
    if (fs.existsSync(globalPath)) {
      try {
        const raw = fs.readFileSync(globalPath, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) seed = parsed;
      } catch {
        seed = null;
      }
    }

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
        },
        {
          title: "Greek Yogurt Parfait",
          description: "Quick breakfast with fruit and granola",
          prepTime: 5,
          cookTime: 0,
          cost: 4.0,
          dietaryTags: ["vegetarian", "high-protein"],
          ingredients: ["1 cup Greek yogurt", "granola", "berries", "1 tbsp honey"],
          steps: ["Add yogurt to a bowl", "Top with granola and berries", "Drizzle honey on top"],
        },
        {
          title: "Veggie Pasta",
          description: "Simple pasta with mixed vegetables",
          prepTime: 10,
          cookTime: 15,
          cost: 6.5,
          dietaryTags: ["vegetarian"],
          ingredients: ["200 g pasta", "zucchini", "bell pepper", "olive oil", "parmesan"],
          steps: ["Boil pasta", "Cook vegetables in a pan", "Mix with pasta", "Top with parmesan"],
        },
        {
          title: "Turkey Wrap",
          description: "Fast wrap for lunch",
          prepTime: 8,
          cookTime: 0,
          cost: 5.5,
          dietaryTags: ["high-protein"],
          ingredients: ["1 tortilla", "sliced turkey", "lettuce", "tomato", "mustard"],
          steps: ["Lay out tortilla", "Add fillings", "Wrap tightly", "Slice and serve"],
        },
        {
          title: "Lentil Soup",
          description: "Warm and filling soup",
          prepTime: 10,
          cookTime: 30,
          cost: 5.0,
          dietaryTags: ["vegan", "vegetarian", "dairy-free"],
          ingredients: ["1 cup lentils", "carrots", "celery", "onion", "vegetable broth"],
          steps: ["Chop vegetables", "Add everything to pot", "Simmer until lentils are soft", "Serve hot"],
        },
        {
          title: "Avocado Toast",
          description: "Quick breakfast or snack",
          prepTime: 5,
          cookTime: 3,
          cost: 4.5,
          dietaryTags: ["vegetarian"],
          ingredients: ["2 slices bread", "1 avocado", "salt", "pepper", "chili flakes"],
          steps: ["Toast bread", "Mash avocado", "Spread on toast", "Season and serve"],
        },
        {
          title: "Tofu Stir Fry",
          description: "Easy plant-based dinner",
          prepTime: 12,
          cookTime: 15,
          cost: 7.0,
          dietaryTags: ["vegan", "vegetarian", "high-protein", "dairy-free"],
          ingredients: ["200 g tofu", "broccoli", "carrots", "soy sauce", "rice"],
          steps: ["Cook rice", "Pan-fry tofu", "Add vegetables", "Add soy sauce and serve over rice"],
        },
        {
          title: "Egg Muffins",
          description: "Meal prep breakfast bites",
          prepTime: 10,
          cookTime: 20,
          cost: 5.0,
          dietaryTags: ["vegetarian", "high-protein", "gluten-free"],
          ingredients: ["6 eggs", "spinach", "cheese", "bell pepper", "salt"],
          steps: ["Whisk eggs", "Add chopped vegetables and cheese", "Pour into muffin tray", "Bake until set"],
        },
        {
          title: "Salmon Rice Plate",
          description: "Balanced dinner with protein and carbs",
          prepTime: 10,
          cookTime: 18,
          cost: 9.5,
          dietaryTags: ["high-protein", "gluten-free"],
          ingredients: ["1 salmon fillet", "1 cup rice", "broccoli", "olive oil", "lemon"],
          steps: ["Cook rice", "Bake or pan-cook salmon", "Steam broccoli", "Serve together with lemon"],
        },
        {
          title: "Bean Burrito Bowl",
          description: "Budget-friendly meal prep bowl",
          prepTime: 10,
          cookTime: 12,
          cost: 6.0,
          dietaryTags: ["vegetarian", "high-protein", "gluten-free"],
          ingredients: ["1 cup rice", "black beans", "corn", "salsa", "cheese"],
          steps: ["Cook rice", "Heat beans and corn", "Assemble bowl", "Top with salsa and cheese"],
        },
        {
          title: "Chickpea Salad",
          description: "Fresh no-cook lunch idea",
          prepTime: 10,
          cookTime: 0,
          cost: 5.5,
          dietaryTags: ["vegan", "vegetarian", "gluten-free", "dairy-free"],
          ingredients: ["1 can chickpeas", "cucumber", "tomato", "olive oil", "lemon juice"],
          steps: ["Drain chickpeas", "Chop vegetables", "Mix together", "Dress with oil and lemon"],
        },
        {
          title: "Halal Chicken Plate",
          description: "Spiced chicken with rice and salad",
          prepTime: 15,
          cookTime: 20,
          cost: 8.5,
          dietaryTags: ["halal", "high-protein"],
          ingredients: ["chicken breast", "rice", "lettuce", "tomato", "garlic sauce"],
          steps: ["Season chicken", "Cook rice", "Grill chicken", "Serve with salad and sauce"],
        },
        {
          title: "Gluten-Free Pancakes",
          description: "Soft pancakes made without wheat flour",
          prepTime: 8,
          cookTime: 10,
          cost: 4.5,
          dietaryTags: ["vegetarian", "gluten-free"],
          ingredients: ["gluten-free flour", "milk", "egg", "baking powder", "maple syrup"],
          steps: ["Mix batter", "Cook on pan", "Flip once bubbles form", "Serve warm"],
        },
        {
          title: "Quinoa Veggie Bowl",
          description: "Healthy grain bowl with roasted vegetables",
          prepTime: 12,
          cookTime: 20,
          cost: 7.0,
          dietaryTags: ["vegan", "vegetarian", "gluten-free", "dairy-free"],
          ingredients: ["1 cup quinoa", "zucchini", "carrots", "olive oil", "lemon"],
          steps: ["Cook quinoa", "Roast vegetables", "Assemble bowl", "Finish with lemon"],
        },
        {
          title: "Beef and Broccoli",
          description: "Simple stir fry with tender beef strips",
          prepTime: 12,
          cookTime: 15,
          cost: 9.0,
          dietaryTags: ["high-protein"],
          ingredients: ["beef strips", "broccoli", "soy sauce", "garlic", "rice"],
          steps: ["Cook rice", "Sear beef", "Add broccoli and sauce", "Serve hot"],
        },
        {
          title: "Peanut Butter Banana Toast",
          description: "Quick breakfast with healthy fats",
          prepTime: 4,
          cookTime: 2,
          cost: 3.0,
          dietaryTags: ["vegetarian"],
          ingredients: ["2 slices bread", "peanut butter", "1 banana", "cinnamon"],
          steps: ["Toast bread", "Spread peanut butter", "Add banana slices", "Sprinkle cinnamon"],
        },
        {
          title: "Shrimp Pasta",
          description: "Fast pasta dinner with garlic shrimp",
          prepTime: 10,
          cookTime: 15,
          cost: 8.5,
          dietaryTags: ["high-protein"],
          ingredients: ["pasta", "shrimp", "garlic", "olive oil", "parsley"],
          steps: ["Boil pasta", "Cook shrimp with garlic", "Combine with pasta", "Serve immediately"],
        },
        {
          title: "Stuffed Sweet Potatoes",
          description: "Baked sweet potatoes filled with beans",
          prepTime: 10,
          cookTime: 35,
          cost: 6.0,
          dietaryTags: ["vegetarian", "gluten-free"],
          ingredients: ["2 sweet potatoes", "black beans", "corn", "cheese", "green onion"],
          steps: ["Bake sweet potatoes", "Heat beans and corn", "Split potatoes", "Stuff and top with cheese"],
        },
        {
          title: "Couscous Chicken Salad",
          description: "Light lunch with chicken and herbs",
          prepTime: 12,
          cookTime: 10,
          cost: 7.5,
          dietaryTags: ["high-protein", "halal"],
          ingredients: ["couscous", "chicken", "cucumber", "parsley", "lemon juice"],
          steps: ["Cook couscous", "Cook chicken", "Chop vegetables", "Mix everything together"],
        },
        {
          title: "Dairy-Free Smoothie Bowl",
          description: "Fruit smoothie bowl without dairy",
          prepTime: 6,
          cookTime: 0,
          cost: 4.0,
          dietaryTags: ["vegan", "vegetarian", "dairy-free", "gluten-free"],
          ingredients: ["frozen banana", "berries", "almond milk", "chia seeds", "granola"],
          steps: ["Blend fruit with almond milk", "Pour into bowl", "Add toppings", "Serve cold"],
        },
        {
          title: "Tuna Salad Sandwich",
          description: "Classic sandwich for a fast lunch",
          prepTime: 8,
          cookTime: 0,
          cost: 4.5,
          dietaryTags: ["high-protein"],
          ingredients: ["canned tuna", "mayonnaise", "bread", "lettuce", "pepper"],
          steps: ["Mix tuna with mayo", "Toast bread if desired", "Assemble sandwich", "Serve"],
        },
        {
          title: "Vegetable Fried Rice",
          description: "Quick rice dish with mixed vegetables",
          prepTime: 10,
          cookTime: 12,
          cost: 5.0,
          dietaryTags: ["vegetarian"],
          ingredients: ["cooked rice", "peas", "carrots", "egg", "soy sauce"],
          steps: ["Cook vegetables", "Add rice", "Stir in egg", "Season with soy sauce"],
        },
        {
          title: "Baked Cod with Potatoes",
          description: "Simple oven-baked fish dinner",
          prepTime: 10,
          cookTime: 25,
          cost: 9.0,
          dietaryTags: ["high-protein", "gluten-free"],
          ingredients: ["cod fillet", "potatoes", "olive oil", "lemon", "garlic"],
          steps: ["Slice potatoes", "Season fish and potatoes", "Bake until cooked through", "Serve with lemon"],
        },
        {
          title: "Falafel Wrap",
          description: "Plant-based wrap with crunchy falafel",
          prepTime: 10,
          cookTime: 10,
          cost: 6.5,
          dietaryTags: ["vegetarian"],
          ingredients: ["falafel", "tortilla", "lettuce", "tomato", "tzatziki"],
          steps: ["Warm falafel", "Prepare wrap", "Add fillings", "Roll and serve"],
        },
        {
          title: "Mushroom Omelette",
          description: "Fast breakfast with eggs and mushrooms",
          prepTime: 6,
          cookTime: 8,
          cost: 4.0,
          dietaryTags: ["vegetarian", "high-protein", "gluten-free"],
          ingredients: ["3 eggs", "mushrooms", "cheese", "butter", "salt"],
          steps: ["Cook mushrooms", "Whisk eggs", "Pour eggs into pan", "Fold and serve"],
        },
      ];
    }

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

      for (const ing of ingredients) {
        const clean = String(ing).trim();
        if (clean) {
          await run(
            `INSERT INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)`,
            [recipeId, clean]
          );
        }
      }

      for (let i = 0; i < steps.length; i++) {
        const st = String(steps[i]).trim();
        if (st) {
          await run(
            `INSERT INTO recipe_steps (recipe_id, step_index, step_text) VALUES (?, ?, ?)`,
            [recipeId, i, st]
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
    }
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  initDb,
};
