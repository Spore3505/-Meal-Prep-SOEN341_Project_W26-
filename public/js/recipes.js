    let allMine = [];
    let allGlobal = [];
    const filters = {};

    function esc(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
    }

    function fmtNumber(n) {
      const num = Number(n);
      return Number.isFinite(num) ? num : 0;
    }

    function renderRecipeCard(r, index) {
      const prep = fmtNumber(r.prepTime);
      const cook = fmtNumber(r.cookTime);
      const cost = fmtNumber(r.cost);

      const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
      const steps = Array.isArray(r.steps) ? r.steps : [];
      const dietaryTags = Array.isArray(r.dietaryTags) ? r.dietaryTags : [];

      return `
        <div class="card" style="--i:${index}">
          <h3>${esc(r.title || "Untitled")}</h3>
          <div class="meta">
            Prep: ${prep} min · Cook: ${cook} min · Cost: $${cost.toFixed(2)}
          </div>
          ${r.description ? `<div class="desc">${esc(r.description)}</div>` : ""}

          <div class="listTitle">Dietary Tags</div>
          ${
            dietaryTags.length
              ? `<ul>${dietaryTags.map(tag => `<li>${esc(tag)}</li>`).join("")}</ul>`
              : "<div class=\"meta\">No dietary tags listed.</div>"
          }

          <div class="listTitle">Ingredients</div>
          ${
            ingredients.length
              ? `<ul>${ingredients.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`
              : "<div class=\"meta\">No ingredients listed.</div>"
          }

          <div class="listTitle">Steps</div>
          ${
            steps.length
              ? `<ul>${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`
              : "<div class=\"meta\">No steps listed.</div>"
          }

          <div style="margin-top:12px; display:flex; gap:8px;">
            <button class="btn" data-id="${r.id}" onclick="editRecipe(this.dataset.id)">Edit</button>
            <button class="btn" data-id="${r.id}" onclick="deleteRecipe(this.dataset.id)" style="background:#c94b4b;">Delete</button>
          </div>
        </div>
      `;
    }

    function renderSection(containerId, recipes) {
      const el = document.getElementById(containerId);

      if (!recipes || !recipes.length) {
        el.innerHTML = "<div class=\"empty\">No recipes found.</div>";
        return;
      }

      el.innerHTML = recipes.map((r, i) => renderRecipeCard(r, i)).join("");
    }

    function renderFilterTags() {
      const activeFiltersEl = document.getElementById("activeFilters");
      activeFiltersEl.innerHTML = "";

      for (const key in filters) {
        let text = "";

        if (key === "dietaryTag") {
          text = `dietaryTag: ${filters[key]}`;
        } else {
          const f = filters[key];
          text = `${key}: ${f.min || 0} - ${f.max || "∞"}`;
        }

        const tag = document.createElement("div");
        tag.className = "filterTag";
        tag.innerHTML = `${text} <span class="remove" onclick="removeFilter('${key}')">×</span>`;

        activeFiltersEl.appendChild(tag);
      }
    }

    function removeFilter(key) {
      delete filters[key];

      if (key === "prepTime") {
        document.getElementById("minPrepTime").value = "";
        document.getElementById("maxPrepTime").value = "";
      }

      if (key === "cookTime") {
        document.getElementById("minCookTime").value = "";
        document.getElementById("maxCookTime").value = "";
      }

      if (key === "cost") {
        document.getElementById("minCost").value = "";
        document.getElementById("maxCost").value = "";
      }

      if (key === "dietaryTag") {
        document.getElementById("dietaryTagFilter").value = "";
      }

      renderFilterTags();
      applySearch();
    }

    function applyFilter() {
      const minPrepTime = document.getElementById("minPrepTime").value;
      const maxPrepTime = document.getElementById("maxPrepTime").value;
      const minCookTime = document.getElementById("minCookTime").value;
      const maxCookTime = document.getElementById("maxCookTime").value;
      const minCost = document.getElementById("minCost").value;
      const maxCost = document.getElementById("maxCost").value;
      const dietaryTag = document.getElementById("dietaryTagFilter").value.trim();

      if (minPrepTime || maxPrepTime) {
        filters.prepTime = { min: minPrepTime, max: maxPrepTime };
      } else {
        delete filters.prepTime;
      }

      if (minCookTime || maxCookTime) {
        filters.cookTime = { min: minCookTime, max: maxCookTime };
      } else {
        delete filters.cookTime;
      }

      if (minCost || maxCost) {
        filters.cost = { min: minCost, max: maxCost };
      } else {
        delete filters.cost;
      }

      if (dietaryTag) {
        filters.dietaryTag = dietaryTag.toLowerCase();
      } else {
        delete filters.dietaryTag;
      }

      renderFilterTags();
      applySearch();
    }

    function applySearch() {
      const query = document.getElementById("searchInput").value.toLowerCase();

      function matchFilter(r) {
        for (const key in filters) {
          if (key === "dietaryTag") continue;

          const f = filters[key];
          const val = Number(r[key] || 0);

          if (f.min !== "" && val < Number(f.min)) return false;
          if (f.max !== "" && val > Number(f.max)) return false;
        }

        if (filters.dietaryTag) {
          const tags = Array.isArray(r.dietaryTags) ? r.dietaryTags : [];
          const hasMatch = tags.some(tag =>
            String(tag).toLowerCase().includes(filters.dietaryTag)
          );
          if (!hasMatch) return false;
        }

        return String(r.title || "").toLowerCase().includes(query);
      }

      const filteredMine = allMine.filter(matchFilter);
      const filteredGlobal = allGlobal.filter(matchFilter);

      renderSection("mine", filteredMine);
      renderSection("global", filteredGlobal);
    }

    async function loadAll() {
      try {
        const res = await fetch("/recipes/all");
        if (!res.ok) throw new Error("Failed to load recipes");

        const data = await res.json();
        allMine = data.mine || [];
        allGlobal = data.global || [];

        applySearch();
      } catch (e) {
        console.error(e);
        alert("Could not load recipes (server error).");
      }
    }

    function scrollRow(id, dir) {
      const el = document.getElementById(id);
      if (!el) return;

      const card = el.querySelector(".card");
      const step = card ? (card.getBoundingClientRect().width + 14) : 320;
      el.scrollBy({ left: dir * step, behavior: "smooth" });
    }

    function editRecipe(id) {
      window.location.href = `edit.html?id=${id}`;
    }

    async function deleteRecipe(id) {
      console.log("Deleting recipe id:", id);
      if (!confirm("Are you sure you want to delete this recipe?")) return;

      try {
        const res = await fetch(`/recipes/${id}`, {
          method: "DELETE",
          credentials: "include"
        });

        if (!res.ok) throw new Error("Delete failed");
        loadAll();
      } catch (err) {
        console.error(err);
        alert("Failed to delete recipe.");
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
      const searchInput = document.getElementById("searchInput");
      const filterSidebar = document.getElementById("filterSidebar");
      const filterToggleBtn = document.getElementById("filterToggleBtn");
      const closeFilterBtn = document.getElementById("closeFilterBtn");
      const applyFilterBtn = document.getElementById("applyFilterBtn");

      searchInput.addEventListener("input", applySearch);

      if (filterToggleBtn && filterSidebar) {
        filterToggleBtn.addEventListener("click", () => {
          filterSidebar.classList.toggle("show");
        });
      }

      if (closeFilterBtn && filterSidebar) {
        closeFilterBtn.addEventListener("click", () => {
          filterSidebar.classList.remove("show");
        });
      }

      if (applyFilterBtn && filterSidebar) {
        applyFilterBtn.addEventListener("click", () => {
          applyFilter();
          filterSidebar.classList.remove("show");
        });
      }

      loadAll();
    });
