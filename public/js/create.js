    function createTag(text, container) {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.innerHTML = `${text} <button type="button" onclick="this.parentElement.remove()">✕</button>`;
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
      return Array.from(container.querySelectorAll(".tag"))
        .map(tag => tag.textContent.replace("✕", "").trim())
        .filter(Boolean);
    }

    async function saveRecipe() {
      const msg = document.getElementById("msg");

      const payload = {
        title: document.getElementById("title").value,
        description: document.getElementById("description").value,
        prepTime: document.getElementById("prepTime").value,
        cookTime: document.getElementById("cookTime").value,
        cost: document.getElementById("cost").value,
        ingredients: getTagsText("ingredients"),
        steps: getTagsText("steps"),
        dietaryTags: getTagsText("dietaryTags")
      };

      try {
        const res = await fetch("/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          msg.style.color = "red";
          msg.innerText = (data && (data.message || data.error)) || "Failed to save recipe";
          return;
        }

        msg.style.color = "green";
        msg.innerText = "Recipe saved!";
      } catch (e) {
        console.error(e);
        msg.style.color = "red";
        msg.innerText = "Server error while saving";
      }
    }