  // ── State ──
  let allRecipes   = [];
  let myRecipes    = [];
  let answers      = {};           // { time, type, spicy, cost, dietary }
  let currentRecipe = null;
  let seenIds      = new Set();    // IDs shown this session — avoid repeats

  // ── Helpers ──
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function showMsg(text, type = "info") {
    const el = document.getElementById("msg");
    el.className = "msg-" + type;
    el.textContent = text;
  }

  function clearMsg() {
    const el = document.getElementById("msg");
    el.className = "";
    el.textContent = "";
  }

  // ── Load recipes from server ──
  async function loadRecipes() {
    const res  = await fetch("/recipes/all");
    const data = await res.json();
    myRecipes  = data.mine   || [];
    allRecipes = [...(data.mine || []), ...(data.global || [])];
  }

  // ── Quiz selection ──
  function select(btn) {
    const group = btn.closest(".options");
    group.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");

    const q = group.dataset.q;
    answers[q] = btn.dataset.value;
  }

  function resetQuiz() {
    answers = {};
    seenIds.clear();
    document.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
    clearMsg();
    document.getElementById("seenNote").textContent = "";
    document.getElementById("recipeResult").style.display = "none";
    document.getElementById("quiz").style.display = "block";
  }

  function backToQuiz() {
    document.getElementById("recipeResult").style.display = "none";
    document.getElementById("quiz").style.display = "block";
    clearMsg();
  }

  // ── Filtering logic (UT.14.2 + UT.14.3) ──
  function applyFilters(recipes) {
    return recipes.filter(r => {

      const tags        = (r.dietaryTags || []).map(t => t.toLowerCase());
      const totalTime   = (r.prepTime || 0) + (r.cookTime || 0);
      const cost        = r.cost || 0;

      // Q1 – time
      if (answers.time && answers.time !== "any") {
        if (answers.time === "quick"  && totalTime > 15) return false;
        if (answers.time === "medium" && (totalTime <= 15 || totalTime > 30)) return false;
        if (answers.time === "long"   && totalTime <= 30) return false;
      }

      // Q2 – meal type
      if (answers.type && answers.type !== "any") {
        if (answers.type === "vegetarian" && !tags.includes("vegetarian")) return false;
        if (answers.type === "vegan"      && !tags.includes("vegan"))      return false;
        if (answers.type === "protein"    && !tags.includes("high-protein"))return false;
      }

      // Q3 – spicy (spicy tag or chili/jalapeño/sriracha in ingredients)
      if (answers.spicy && answers.spicy !== "any") {
        const isSpicy =
          tags.some(t => t.includes("spic") || t.includes("hot")) ||
          (r.ingredients || []).some(i =>
            /chili|jalape|sriracha|cayenne|spicy/i.test(i)
          );

        if (answers.spicy === "spicy" && !isSpicy) return false;
        if (answers.spicy === "mild"  && isSpicy)  return false;
      }

      // Q4 – cost
      if (answers.cost && answers.cost !== "any") {
        if (answers.cost === "cheap"    && cost >= 5)  return false;
        if (answers.cost === "moderate" && (cost > 8)) return false;
        if (answers.cost === "splurge"  && cost <= 8)  return false;
      }

      // Q5 – dietary requirement
      if (answers.dietary && answers.dietary !== "any") {
        if (!tags.includes(answers.dietary)) return false;
      }

      return true;
    });
  }

  // ── Find & display recipe (UT.14.4) ──
  async function findRecipe() {
    clearMsg();

    // Validate all 5 questions answered
    const required = ["time","type","spicy","cost","dietary"];
    const missing  = required.filter(q => !answers[q]);
    if (missing.length) {
      showMsg("Please answer all 5 questions first!", "err");
      return;
    }

    await loadRecipes();

    const filtered = applyFilters(allRecipes);

    // Exclude already-seen recipes this session
    const unseen = filtered.filter(r => !seenIds.has(String(r.id)));

    if (!unseen.length) {
      if (filtered.length) {
        // All matching ones have been shown — reset seen and try again
        seenIds.clear();
        const fresh = filtered.filter(r => !seenIds.has(String(r.id)));
        if (!fresh.length) {
          showMsg("No recipes match your filters. Try relaxing some answers!", "err");
          return;
        }
        pickAndShow(fresh, filtered.length);
      } else {
        showMsg("No recipes match your filters. Try changing some answers!", "err");
      }
      return;
    }

    pickAndShow(unseen, filtered.length);
  }

  function pickAndShow(pool, totalMatches) {
    // Random pick from filtered pool
    currentRecipe = pool[Math.floor(Math.random() * pool.length)];
    seenIds.add(String(currentRecipe.id));

    renderRecipeCard(currentRecipe);

    document.getElementById("quiz").style.display = "none";
    document.getElementById("recipeResult").style.display = "block";

    clearMsg();

    // Update seen counter in quiz area
    const note = document.getElementById("seenNote");
    note.textContent = `Shown ${seenIds.size} of ${totalMatches} matching recipe(s) this session.`;
  }

  function renderRecipeCard(r) {
    const tags        = (r.dietaryTags || []);
    const totalTime   = (r.prepTime || 0) + (r.cookTime || 0);
    const alreadyMine = myRecipes.some(
      m => m.title.trim().toLowerCase() === r.title.trim().toLowerCase()
    );

    const saveBtn = document.getElementById("saveBtn");
    if (alreadyMine) {
      saveBtn.textContent = "✅ Already in My Collection";
      saveBtn.disabled = true;
    } else {
      saveBtn.textContent = "💾 Save to My Collection";
      saveBtn.disabled = false;
    }

    document.getElementById("recipeCard").innerHTML = `
      <h3>${esc(r.title)}</h3>
      <p style="color:#555; margin:0 0 10px;">${esc(r.description || "")}</p>

      <div class="meta">
        <span>⏱ ${totalTime} min</span>
        <span>💰 $${Number(r.cost || 0).toFixed(2)}</span>
        ${r.isGlobal ? '<span>🌍 Global recipe</span>' : '<span>👤 My recipe</span>'}
      </div>

      <div>
        ${tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}
      </div>

      <h4>Ingredients</h4>
      <ul>
        ${(r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join("")}
      </ul>

      <h4>Steps</h4>
      <ul>
        ${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join("")}
      </ul>
    `;
  }

  // ── Try another (skip current, pick next unseen) ──
  function tryAnother() {
    clearMsg();
    const filtered = applyFilters(allRecipes);
    const unseen   = filtered.filter(r => !seenIds.has(String(r.id)));

    if (!unseen.length) {
      // Wrap around: reset seen except the very last one shown
      const keepId = currentRecipe ? String(currentRecipe.id) : null;
      seenIds.clear();
      if (keepId) seenIds.add(keepId);

      const fresh = filtered.filter(r => !seenIds.has(String(r.id)));
      if (!fresh.length) {
        showMsg("You've seen all matching recipes! Change your answers to see more.", "err");
        return;
      }
      pickAndShow(fresh, filtered.length);
      return;
    }

    pickAndShow(unseen, filtered.length);
  }

  // ── Save to my collection (duplicate check) ──
  async function saveRecipe() {
    if (!currentRecipe) return;
    clearMsg();

    // Duplicate check by title (case-insensitive)
    const isDuplicate = myRecipes.some(
      r => r.title.trim().toLowerCase() === currentRecipe.title.trim().toLowerCase()
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
        body: JSON.stringify({
          title:       currentRecipe.title,
          description: currentRecipe.description || "",
          prepTime:    currentRecipe.prepTime || 0,
          cookTime:    currentRecipe.cookTime || 0,
          cost:        currentRecipe.cost || 0,
          ingredients: currentRecipe.ingredients || [],
          steps:       currentRecipe.steps || [],
          dietaryTags: currentRecipe.dietaryTags || []
        })
      });

      if (!res.ok) throw new Error("Server error");

      showMsg("✅ Recipe saved to your collection!", "ok");

      document.getElementById("saveBtn").textContent = "✅ Saved!";
      document.getElementById("saveBtn").disabled = true;

      // Add to local myRecipes so duplicate check works for rest of session
      myRecipes.push(currentRecipe);

    } catch (err) {
      console.error(err);
      showMsg("❌ Failed to save. Please try again.", "err");
    }
  }

  // ── Init: pre-load recipes on page load ──
  loadRecipes().catch(console.error);
