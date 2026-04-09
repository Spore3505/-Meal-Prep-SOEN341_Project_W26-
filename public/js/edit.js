  const editId = new URLSearchParams(window.location.search).get("id");

  if (!editId) {
    alert("No recipe ID provided.");
    window.location.href = "recipes.html";
  }

  function createTag(text, container) {
    const tag = document.createElement("div");
    tag.className = "tag";

    const span = document.createElement("span");
    span.textContent = text;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "✕";
    btn.onclick = () => tag.remove();

    tag.appendChild(span);
    tag.appendChild(btn);
    container.appendChild(tag);
  }

  function addIngredient() {
    const qty = document.getElementById("ingredientQty").value;
    const unit = document.getElementById("ingredientUnit").value;
    const name = document.getElementById("ingredientName").value;

    if (name.trim() !== "") {
      let text = "";
      if (qty) text += qty + " ";
      if (unit) text += unit + " ";
      text += name;

      createTag(text, document.getElementById("ingredients"));

      document.getElementById("ingredientQty").value = "";
      document.getElementById("ingredientUnit").value = "";
      document.getElementById("ingredientName").value = "";
    }
  }

  function addStep() {
    const input = document.getElementById("stepInput");
    if (input.value.trim() !== "") {
      createTag(input.value, document.getElementById("steps"));
      input.value = "";
    }
  }

  function addDietaryTag() {
    const input = document.getElementById("dietaryInput");
    if (input.value.trim() !== "") {
      createTag(input.value.trim(), document.getElementById("dietaryTags"));
      input.value = "";
    }
  }

  function getTagsText(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll(".tag span"))
      .map(span => span.textContent.trim())
      .filter(Boolean);
  }

  async function loadRecipeForEdit() {
    try {
      const res = await fetch(`/recipes/${editId}`, {
        credentials: "include"
      });

      if (!res.ok) throw new Error("Failed to load recipe");

      const r = await res.json();

      document.getElementById("title").value = r.title || "";
      document.getElementById("description").value = r.description || "";
      document.getElementById("prepTime").value = r.prepTime || "";
      document.getElementById("cookTime").value = r.cookTime || "";
      document.getElementById("cost").value = r.cost || "";

      document.getElementById("ingredients").innerHTML = "";
      document.getElementById("steps").innerHTML = "";
      document.getElementById("dietaryTags").innerHTML = "";

      (r.ingredients || []).forEach(i =>
        createTag(i, document.getElementById("ingredients"))
      );

      (r.steps || []).forEach(s =>
        createTag(s, document.getElementById("steps"))
      );

      (r.dietaryTags || []).forEach(t =>
        createTag(t, document.getElementById("dietaryTags"))
      );

    } catch (err) {
      console.error(err);
      alert("Error loading recipe.");
    }
  }

  async function saveRecipe() {
    const msg = document.getElementById("msg");

    const payload = {
      title: document.getElementById("title").value.trim(),
      description: document.getElementById("description").value.trim(),
      prepTime: document.getElementById("prepTime").value,
      cookTime: document.getElementById("cookTime").value,
      cost: document.getElementById("cost").value,
      ingredients: getTagsText("ingredients"),
      steps: getTagsText("steps"),
      dietaryTags: getTagsText("dietaryTags")
    };

    try {
      const res = await fetch(`/recipes/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to update");

      msg.style.color = "green";
      msg.innerText = "Recipe updated successfully!";

    } catch (err) {
      console.error(err);
      msg.style.color = "red";
      msg.innerText = "Server error while saving.";
    }
  }

  loadRecipeForEdit();