const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const meals = ["breakfast","lunch","dinner"];

let plan = {};
let allMine = [];
let allGlobal = [];
let selectedDay = null;
let selectedMeal = null;

// Fetch recipes
async function loadRecipes() {
  try {
    const res = await fetch("/recipes/all");
    if (!res.ok) throw new Error("Failed to load recipes");
    const data = await res.json();
    allMine = data.mine || [];
    allGlobal = data.global || [];
  } catch (err) {
    console.error("Failed to load recipes:", err);
  }
}

// Render weekly planner
function renderPlanner() {
  const container = document.getElementById("planner");
  container.innerHTML = "";

  days.forEach(day => {
    const card = document.createElement("div");
    card.className = "day-card";

    const title = document.createElement("div");
    title.className = "day-title";
    title.textContent = day;
    card.appendChild(title);

    meals.forEach(meal => {
      const mealDiv = document.createElement("div");
      mealDiv.className = `meal ${meal}`;
      const item = plan?.[day]?.[meal];

      mealDiv.innerHTML = item
        ? `<strong>${meal}</strong><br>${item.title}`
        : `<strong>${meal}</strong><br><span class="empty">+ Add</span>`;

      // Left click: open recipe selection modal
      mealDiv.onclick = () => openModal(day, meal);

      // Right click: delete meal from meal plan
      mealDiv.oncontextmenu = async (e) => {
        e.preventDefault();
        if (item && confirm("Remove this meal from the plan?")) {
          try {
            await fetch("/plan/delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ day, meal })
            });

            // Remove from frontend memory
            delete plan[day][meal];
            if (Object.keys(plan[day]).length === 0) delete plan[day];

            renderPlanner();
          } catch (err) {
            console.error("Failed to delete meal from plan:", err);
            alert("Could not delete meal. Try again.");
          }
        }
      };

      card.appendChild(mealDiv);
    });

    // Clear entire day
    const clearBtn = document.createElement("button");
    clearBtn.className = "clear-day";
    clearBtn.textContent = "Clear Day";
    clearBtn.onclick = async () => {
      if (confirm(`Clear all meals for ${day}?`)) {
        try {
          await fetch("/plan/clear-day", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ day })
          });

          delete plan[day];
          renderPlanner();
        } catch (err) {
          console.error("Failed to clear day:", err);
          alert("Could not clear day. Try again.");
        }
      }
    };
    card.appendChild(clearBtn);

    container.appendChild(card);
  });
}
function openModal(day, meal) {
  selectedDay = day;
  selectedMeal = meal;

  document.getElementById("recipeModal").style.display = "block";
  document.getElementById("searchInput").value = "";

  const recipes = [...allMine, ...allGlobal];
  renderRecipeList(recipes);
}

function closeModal() {
  document.getElementById("recipeModal").style.display = "none";
}

// Render recipe list in modal
function renderRecipeList(list) {
  const container = document.getElementById("recipeList");
  container.innerHTML = "";

  list.forEach(r => {
    const item = document.createElement("div");
    item.className = "recipe-item";
    item.textContent = r.title;

    // Click handler to add recipe to the plan AND save to database
    item.onclick = async () => {
      // --- DUPLICATE CHECK ---
      // Check if this recipe ID already exists anywhere in the current plan
      const isDuplicate = Object.values(plan).some(dayMeals =>
        Object.values(dayMeals).some(meal => String(meal.id) === String(r.id))
      );

      if (isDuplicate) {
        const proceed = confirm(`"${r.title}" is already in your plan for this week. Do you want to add it again?`);
        if (!proceed) return; // Exit if user cancels
      }
      // --- END DUPLICATE CHECK ---

      // 1. Update in-memory plan
      if (!plan[selectedDay]) plan[selectedDay] = {};
      plan[selectedDay][selectedMeal] = r;

      try {
        // 2. Save to database
        const response = await fetch("/plan/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            day: selectedDay,
            meal: selectedMeal,
            recipeId: r.id
          })
        });

        if (!response.ok) throw new Error("Server failed to save");

        // 3. Update UI and close modal
        renderPlanner();
        closeModal();

      } catch (err) {
        console.error("Failed to save meal:", err);
        alert("Could not save meal. Please try again.");

        // Rollback local change if server fails
        delete plan[selectedDay][selectedMeal];
      }
    };

    container.appendChild(item);
  });
}

// Search recipes
document.getElementById("searchInput").addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase();
  const recipes = [...allMine, ...allGlobal];

  // Filter and re-render the list based on search query
  const filtered = recipes.filter(r => r.title.toLowerCase().includes(query));
  renderRecipeList(filtered);
});
async function loadMealPlan() {
  try {
    const res = await fetch("/plan");
    if (!res.ok) throw new Error("Failed to load meal plan");
    const data = await res.json();

    // Clear current plan
    plan = {};

    // Map recipe IDs to actual recipe objects from allMine + allGlobal
    const allRecipes = [...allMine, ...allGlobal];

    (data.meals || []).forEach(m => {
      const recipe = allRecipes.find(r => String(r.id) === String(m.recipe_id));
      if (recipe) {
        if (!plan[m.day]) plan[m.day] = {};
        plan[m.day][m.meal] = recipe;
      }
    });
  } catch (err) {
    console.error("Failed to load meal plan:", err);
  }
}

// Initialize
async function init() {
  await loadRecipes();    // Get the list of all available recipes
  await loadMealPlan();   // Get the user's saved weekly plan
  renderPlanner();        // Draw the UI with the data
}

init();
