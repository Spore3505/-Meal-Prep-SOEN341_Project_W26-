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
    secret: "CHANGE_THIS_SECRET", 
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, 
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
      // secure: true,              // enable only if using HTTPS
    },
  })
);

// Helper middleware: require login
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // Not logged in -> send them to login page
  return res.redirect("/login.html");
}

// Serve static files 
app.use(["/account.html", "/create.html", "/edit.html"], requireAuth);
app.use(express.static(__dirname));

// Default route 
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Home.html"));
});

// Protect account page
app.get("/account.html", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "account.html"));
});

app.get("/me", (req, res) => {
  if (req.session?.user)
    return res.json({ loggedIn: true, user: req.session.user });
  res.json({ loggedIn: false });
});

app.post("/register", (req, res) => {
  let { username, password } = req.body;

  // Basic cleanup
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

    // More exact match than includes (avoid partial collisions)
    const lines = users.split("\n");
    const exists = lines.some((line) =>
      line.startsWith(`Username: ${username},`)
    );
    if (exists) {
      return res.status(400).send("Username already exists");
    }

    if (password.length < 6) {
      return res.status(400).send("Password must be at least 6 characters long");
    }

    const line = `Username: ${username}, Password: ${password}\n`;
    fs.appendFile("users.txt", line, (err) => {
      if (err) return res.status(500).send("Error saving user");

      // Create a new text file EXACTLY named like the username
      // Small safety block so username can't escape folders
      if (
        username.includes("/") ||
        username.includes("\\") ||
        username.includes("..")
      ) {
        return res.status(400).send("Invalid username for filename");
      }

      const userFileName = `${username}.txt`;
      const userFilePath = path.join(__dirname, userFileName);

      //Grab allergies & preferences from the request
      let allergies = req.body.allergies || [];
      let preferences = req.body.preferences || [];

      // Normalize 
      if (!Array.isArray(allergies)) allergies = [allergies];
      if (!Array.isArray(preferences)) preferences = [preferences];

      // Clean list values
      allergies = allergies
        .map((a) => String(a).trim())
        .filter((a) => a.length > 0);
      preferences = preferences
        .map((p) => String(p).trim())
        .filter((p) => p.length > 0);

      //Write data into the user's file
      const fileContent =
        `Username: ${username}\n` +
        `Allergies: ${allergies.join(", ")}\n` +
        `Preferences: ${preferences.join(", ")}\n`;

      // "wx" => create only if it doesn't already exist (prevents overwriting)
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
        //Create session on successful login
        req.session.user = { username };

        // save session before responding (avoid rare race)
        return req.session.save(() => {
          res.send("Login successful");
        });
      }
    }

    res.status(401).send("Invalid username or password");
  });
});

// Logout: destroys session + clears cookie
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
