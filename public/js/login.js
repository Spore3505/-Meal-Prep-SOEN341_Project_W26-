  // =========================
  // Check if already logged in
  // =========================
  (async function () {
    try {
      const res = await fetch("/me");
      const data = await res.json();

      const authLink = document.getElementById("authLink");

      if (data.loggedIn) {
        // Change nav to ACCOUNT
        if (authLink) {
          authLink.textContent = "ACCOUNT";
          authLink.href = "account.html"; // or recipes.html
        }

        // Redirect automatically
        window.location.href = "recipes.html"; // or account.html
      } else {
        if (authLink) {
          authLink.textContent = "LOGIN";
          authLink.href = "login.html";
        }
      }
    } catch (e) {
      console.error("Session check failed:", e);
    }
  })();

  // =========================
  // Login form submit
  // =========================
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    try {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        window.location.href = "recipes.html";
      } else {
        alert("Wrong username or password");
      }
    } catch (err) {
      console.error(err);
      alert("Server error");
    }
  });
