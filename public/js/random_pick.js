// Stores user's own recipes (fetched from backend)
let myRecipes = [];

// Stores answers from the 5 quiz questions
let answers = {};

// Currently displayed recipe
let currentRecipe = null;

// Keeps track of already generated recipes to avoid duplicates
let seenTitles = new Set();


// Escape HTML to prevent injection issues when rendering
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


// Get the correct message element depending on which screen is visible
function getMsgEl() {
  return document.getElementById("recipeResult").style.display === "block"
    ? document.getElementById("resultMsg")
    : document.getElementById("msg");
}

// Get element showing how many recipes were generated
function getSeenEl() {
  return document.getElementById("recipeResult").style.display === "block"
    ? document.getElementById("resultSeenNote")
    : document.getElementById("seenNote");
}


// Show a message (info, error, success)
function showMsg(text, type = "info") {
  const el = getMsgEl();
  el.className = "msg-" + type;
  el.textContent = text;
}

// Clear all messages
function clearMsg() {
  const msg1 = document.getElementById("msg");
  const msg2 = document.getElementById("resultMsg");
  msg1.className = "";
  msg2.className = "";
  msg1.textContent = "";
  msg2.textContent = "";
}


// Load user's saved recipes from backend
async function loadRecipes() {
  const res = await fetch("/recipes/all", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load recipes");
  const data = await res.json();
  myRecipes = data.mine || [];
}


// Handles selecting an answer button
function select(btn) {
  const group = btn.closest(".options");

  // Remove selection from other buttons in the same group
  group.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("selected"));

  // Mark this button as selected
  btn.classList.add("selected");

  // Store answer
  const q = group.dataset.q;
  answers[q] = btn.dataset.value;
}


// Reset quiz to initial state
function resetQuiz() {
  answers = {};
  currentRecipe = null;
  seenTitles.clear();

  document.querySelectorAll(".option-btn").forEach((b) => b.classList.remove("selected"));

  document.getElementById("recipeResult").style.display = "none";
  document.getElementById("quiz").style.display = "block";

  document.getElementById("seenNote").textContent = "";
  document.getElementById("resultSeenNote").textContent = "";

  clearMsg();
}


// Go back from result screen to quiz
function backToQuiz() {
  document.getElementById("recipeResult").style.display = "none";
  document.getElementById("quiz").style.display = "block";
  clearMsg();
}


// Request a generated recipe from backend
async function requestGeneratedRecipe() {
  const res = await fetch("/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      answers,
      excludeTitles: [...seenTitles] // avoid duplicates
    })
  });

  if (!res.ok) {
    throw new Error("Failed to generate recipe");
  }

  const data = await res.json();
  return data.recipe;
}


// Main function when user clicks "Find Recipe"
async function findRecipe() {
  clearMsg();

  // Ensure all 5 questions are answered
  const required = ["time", "type", "spicy", "cost", "dietary"];
  const missing = required.filter((q) => !answers[q]);

  if (missing.length) {
    document.getElementById("quiz").style.display = "block";
    document.getElementById("recipeResult").style.display = "none";
    showMsg("Please answer all 5 questions first!", "err");
    return;
  }

  try {
    await loadRecipes();

    // Show loading message
    document.getElementById("quiz").style.display = "block";
    document.getElementById("recipeResult").style.display = "none";
    showMsg("Generating a brand-new recipe...", "info");

    const recipe = await requestGeneratedRecipe();

    currentRecipe = recipe;

    // Add to seen set to prevent repeats
    seenTitles.add(String(recipe.title).trim().toLowerCase());

    // Render recipe UI
    renderRecipeCard(recipe);

    // Switch to result screen
    document.getElementById("quiz").style.display = "none";
    document.getElementById("recipeResult").style.display = "block";

    // Update count of generated recipes
    document.getElementById("resultSeenNote").textContent =
      `Generated ${seenTitles.size} unique recipe(s) for these answers this session.`;

    clearMsg();
  } catch (err) {
    console.error(err);
    showMsg("Could not generate a recipe. Please try again.", "err");
  }
}


// Render recipe card UI
function renderRecipeCard(r) {
  const tags = r.dietaryTags || [];

  // Total time = prep + cook
  const totalTime = (r.prepTime || 0) + (r.cookTime || 0);

  // Check if recipe already exists in user's collection
  const alreadyMine = myRecipes.some(
    (m) => m.title.trim().toLowerCase() === r.title.trim().toLowerCase()
  );

  const saveBtn = document.getElementById("saveBtn");

  if (alreadyMine) {
    saveBtn.textContent = "✅ Already in My Collection";
    saveBtn.disabled = true;
  } else {
    saveBtn.textContent = "💾 Save to My Collection";
    saveBtn.disabled = false;
  }

  // Inject HTML into recipe card
  document.getElementById("recipeCard").innerHTML = `
    <h3>${esc(r.title)}</h3>
    <p style="color:#555; margin:0 0 10px;">${esc(r.description || "")}</p>

    <div class="meta">
      <span>⏱ ${totalTime} min</span>
      <span>💰 $${Number(r.cost || 0).toFixed(2)}</span>
      <span>✨ AI-style generated</span>
    </div>

    <div>
      ${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
    </div>

    <h4>Ingredients</h4>
    <ul>
      ${(r.ingredients || []).map((i) => `<li>${esc(i)}</li>`).join("")}
    </ul>

    <h4>Steps</h4>
    <ul>
      ${(r.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}
    </ul>
  `;
}


// Generate another recipe with same answers
async function tryAnother() {
  if (!answers.time || !answers.type || !answers.spicy || !answers.cost || !answers.dietary) {
    showMsg("Answer all 5 questions first.", "err");
    return;
  }

  try {
    clearMsg();
    showMsg("Generating another new recipe...", "info");

    const recipe = await requestGeneratedRecipe();

    currentRecipe = recipe;
    seenTitles.add(String(recipe.title).trim().toLowerCase());

    renderRecipeCard(recipe);

    document.getElementById("resultSeenNote").textContent =
      `Generated ${seenTitles.size} unique recipe(s) for these answers this session.`;

    clearMsg();
  } catch (err) {
    console.error(err);
    showMsg("Could not generate another recipe. Try changing your answers.", "err");
  }
}


// Save generated recipe to database
async function saveRecipe() {
  if (!currentRecipe) return;

  clearMsg();

  // Check for duplicates before saving
  const isDuplicate = myRecipes.some(
    (r) => r.title.trim().toLowerCase() === currentRecipe.title.trim().toLowerCase()
  );

  if (isDuplicate) {
    showMsg("⚠️ This recipe is already in your collection!", "err");
    document.getElementById("saveBtn").disabled = true;
    document.getElementById("saveBtn").textContent = "✅ Already in My Collection";
    return;
  }

  try {
    const res = await fetch("/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        title: currentRecipe.title,
        description: currentRecipe.description || "",
        prepTime: currentRecipe.prepTime || 0,
        cookTime: currentRecipe.cookTime || 0,
        cost: currentRecipe.cost || 0,
        ingredients: currentRecipe.ingredients || [],
        steps: currentRecipe.steps || [],
        dietaryTags: currentRecipe.dietaryTags || []
      })
    });

    if (!res.ok) throw new Error("Server error");

    showMsg("✅ Recipe saved to your collection!", "ok");

    document.getElementById("saveBtn").textContent = "✅ Saved!";
    document.getElementById("saveBtn").disabled = true;

    // Update local cache
    myRecipes.push(currentRecipe);
  } catch (err) {
    console.error(err);
    showMsg("❌ Failed to save. Please try again.", "err");
  }
}


// Load recipes when page loads
loadRecipes().catch(console.error);
