// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");

const app = express();

app.use(express.json());

// Sessions + cookies
app.use(
  session({
    name: "mealmj_sid", // cookie name
    secret: "CHANGE_THIS_SECRET", // change in real use
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
      // secure: true, // enable only if using HTTPS
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
  if (req.session?.user)
    return res.json({ loggedIn: true, user: req.session.user });
  res.json({ loggedIn: false });
});

/* =========================
   PROFILE ROUTES
   ========================= */

function isBadUsername(username) {
  return (
    !username ||
    username.includes("/") ||
    username.includes("\\") ||
    username.includes("..")
  );
}

// Read logged-in user's allergies/preferences
app.get("/profile", requireAuth, (req, res) => {
  const username = req.session.user.username;
  if (isBadUsername(username)) return res.status(400).send("Invalid username");

  const userFilePath = path.join(__dirname, `${username}.txt`);

  fs.readFile(userFilePath, "utf8", (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        return res.json({ username, allergies: [], preferences: [] });
      }
      return res.status(500).send("Error reading user profile");
    }

    const lines = data.split("\n").map((l) => l.trim());
    const allergiesLine =
      lines.find((l) => l.startsWith("Allergies:")) || "Allergies:";
    const prefsLine =
      lines.find((l) => l.startsWith("Preferences:")) || "Preferences:";

    const allergies = allergiesLine
      .replace("Allergies:", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const preferences = prefsLine
      .replace("Preferences:", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    res.json({ username, allergies, preferences });
  });
});

// Update logged-in user's allergies/preferences (overwrite)
app.post("/profile", requireAuth, (req, res) => {
  const username = req.session.user.username;
  if (isBadUsername(username)) return res.status(400).send("Invalid username");

  let allergies = req.body.allergies || [];
  let preferences = req.body.preferences || [];

  if (!Array.isArray(allergies)) allergies = [allergies];
  if (!Array.isArray(preferences)) preferences = [preferences];

  allergies = allergies.map((a) => String(a).trim()).filter(Boolean);
  preferences = preferences.map((p) => String(p).trim()).filter(Boolean);

  const userFilePath = path.join(__dirname, `${username}.txt`);

  const fileContent =
    `Username: ${username}\n` +
    `Allergies: ${allergies.join(", ")}\n` +
    `Preferences: ${preferences.join(", ")}\n`;

  fs.writeFile(userFilePath, fileContent, (err) => {
    if (err) return res.status(500).send("Error saving profile");
    res.send("Profile updated");
  });
});

/* =========================
   RECIPES ROUTES (PERSONAL)
   ========================= */

// Save recipe (append to per-user JSON file)
app.post("/recipes", requireAuth, (req, res) => {
  const username = req.session.user.username;
  if (isBadUsername(username)) return res.status(400).send("Invalid username");

  const { title, description, prepTime, cookTime, cost, ingredients, steps } =
    req.body || {};

  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) return res.status(400).send("Recipe name is required");

  const recipe = {
    id: String(Date.now()),
    title: cleanTitle,
    description: String(description || "").trim(),
    prepTime: Number(prepTime || 0),
    cookTime: Number(cookTime || 0),
    cost: Number(cost || 0),
    ingredients: Array.isArray(ingredients) ? ingredients.map(String) : [],
    steps: Array.isArray(steps) ? steps.map(String) : [],
    createdAt: new Date().toISOString(),
    isGlobal: false,
  };

  const filePath = path.join(__dirname, `${username}_recipes.json`);

  fs.readFile(filePath, "utf8", (err, data) => {
    let list = [];
    if (!err && data) {
      try {
        list = JSON.parse(data);
      } catch {
        list = [];
      }
    }

    if (!Array.isArray(list)) list = [];
    list.push(recipe);

    fs.writeFile(filePath, JSON.stringify(list, null, 2), (wErr) => {
      if (wErr) return res.status(500).send("Error saving recipe");
      res.json({ ok: true, recipe });
    });
  });
});

// Get all personal recipes for logged-in user
app.get("/recipes", requireAuth, (req, res) => {
  const username = req.session.user.username;
  if (isBadUsername(username)) return res.status(400).send("Invalid username");

  const filePath = path.join(__dirname, `${username}_recipes.json`);

  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      if (err.code === "ENOENT") return res.json([]);
      return res.status(500).send("Error reading recipes");
    }

    try {
      const list = JSON.parse(data);
      return res.json(Array.isArray(list) ? list : []);
    } catch {
      return res.json([]);
    }
  });
});

/* =========================
   GLOBAL RECIPES (NEW)
   ========================= */

const GLOBAL_RECIPES_FILE = path.join(__dirname, "global_recipes.json");

function ensureGlobalRecipesFile() {
  if (!fs.existsSync(GLOBAL_RECIPES_FILE)) {
    const seed = [
      {
        id: "g1",
        title: "Overnight Oats",
        description: "Easy breakfast prep for the week",
        prepTime: 5,
        cookTime: 0,
        cost: 3.5,
        ingredients: ["1 cup oats", "1 cup milk", "1 tbsp honey", "berries"],
        steps: ["Mix everything in a jar", "Refrigerate overnight", "Eat cold"],
        createdAt: new Date().toISOString(),
        isGlobal: true,
      },
      {
        id: "g2",
        title: "Chicken & Rice Bowl",
        description: "Simple meal prep lunch",
        prepTime: 10,
        cookTime: 20,
        cost: 7.0,
        ingredients: [
          "200 g chicken",
          "1 cup rice",
          "salt",
          "pepper",
          "frozen veggies",
        ],
        steps: ["Cook rice", "Cook chicken", "Add veggies", "Assemble bowls"],
        createdAt: new Date().toISOString(),
        isGlobal: true,
      },
    ];
    fs.writeFileSync(GLOBAL_RECIPES_FILE, JSON.stringify(seed, null, 2));
  }
}

// Get global recipes
app.get("/recipes/global", requireAuth, (req, res) => {
  ensureGlobalRecipesFile();

  fs.readFile(GLOBAL_RECIPES_FILE, "utf8", (err, data) => {
    if (err) return res.status(500).send("Error reading global recipes");
    try {
      const list = JSON.parse(data);
      return res.json(Array.isArray(list) ? list : []);
    } catch {
      return res.json([]);
    }
  });
});

// Get both: mine + global
app.get("/recipes/all", requireAuth, (req, res) => {
  const username = req.session.user.username;
  if (isBadUsername(username)) return res.status(400).send("Invalid username");

  ensureGlobalRecipesFile();

  const minePath = path.join(__dirname, `${username}_recipes.json`);

  const readMine = () =>
    new Promise((resolve) => {
      fs.readFile(minePath, "utf8", (err, data) => {
        if (err) return resolve([]); // no file => no recipes yet
        try {
          const list = JSON.parse(data);
          resolve(Array.isArray(list) ? list : []);
        } catch {
          resolve([]);
        }
      });
    });

  const readGlobal = () =>
    new Promise((resolve) => {
      fs.readFile(GLOBAL_RECIPES_FILE, "utf8", (err, data) => {
        if (err) return resolve([]);
        try {
          const list = JSON.parse(data);
          resolve(Array.isArray(list) ? list : []);
        } catch {
          resolve([]);
        }
      });
    });

  Promise.all([readMine(), readGlobal()]).then(([mine, global]) => {
    res.json({ mine, global });
  });
});

/* =========================
   AUTH ROUTES
   ========================= */

app.post("/register", (req, res) => {
  let { username, password } = req.body;

  username = (username || "").trim();
  password = (password || "").trim();

  fs.readFile("users.txt", "utf8", (err, data) => {
    if (err && err.code !== "ENOENT") {
      return res.status(500).send("Error reading users file");
    }
    const users = data || "";

    if (username.length < 6) {
      return res
        .status(400)
        .send("Username must be at least 6 characters long");
    }

    const lines = users.split("\n");
    const exists = lines.some((line) =>
      line.startsWith(`Username: ${username},`)
    );
    if (exists) return res.status(400).send("Username already exists");

    if (password.length < 6) {
      return res.status(400).send("Password must be at least 6 characters long");
    }

    const line = `Username: ${username}, Password: ${password}\n`;
    fs.appendFile("users.txt", line, (err) => {
      if (err) return res.status(500).send("Error saving user");

      if (isBadUsername(username)) {
        return res.status(400).send("Invalid username for filename");
      }

      const userFilePath = path.join(__dirname, `${username}.txt`);

      // Grab allergies & preferences from request (optional)
      let allergies = req.body.allergies || [];
      let preferences = req.body.preferences || [];

      if (!Array.isArray(allergies)) allergies = [allergies];
      if (!Array.isArray(preferences)) preferences = [preferences];

      allergies = allergies.map((a) => String(a).trim()).filter(Boolean);
      preferences = preferences.map((p) => String(p).trim()).filter(Boolean);

      const fileContent =
        `Username: ${username}\n` +
        `Allergies: ${allergies.join(", ")}\n` +
        `Preferences: ${preferences.join(", ")}\n`;

      fs.writeFile(userFilePath, fileContent, { flag: "wx" }, (fileErr) => {
        if (fileErr && fileErr.code !== "EEXIST") {
          return res
            .status(500)
            .send("User registered, but failed to create user file");
        }
        return res.send("User registered successfully");
      });
    });
  });
});

app.post("/login", (req, res) => {
  let { username, password } = req.body;
  username = (username || "").trim();
  password = (password || "").trim();

  fs.readFile("users.txt", "utf8", (err, data) => {
    if (err) return res.status(500).send("Error reading users file");

    const users = data.split("\n");

    for (let line of users) {
      if (line.includes(`Username: ${username}, Password: ${password}`)) {
        req.session.user = { username };
        return req.session.save(() => res.send("Login successful"));
      }
    }

    res.status(401).send("Invalid username or password");
  });
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Could not log out");
    res.clearCookie("mealmj_sid");
    res.send("Logged out");
  });
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});