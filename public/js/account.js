const msg = document.getElementById("msg");

// Tag state (only for "other" items)
const otherAllergySet = new Set();
const otherPrefSet = new Set();

function normalize(str) {
  return String(str || "").trim().toLowerCase();
}

function showMsg(text, ok) {
  msg.innerText = text;
  msg.style.color = ok ? "green" : "red";
}

function setChecked(groupName, values) {
  const set = new Set(values.map(v => normalize(v)));
  document.querySelectorAll(`input[name="${groupName}"]`).forEach(cb => {
    cb.checked = set.has(normalize(cb.value));
  });
}

function collectChecked(groupName) {
  return Array.from(document.querySelectorAll(`input[name="${groupName}"]:checked`))
    .map(cb => cb.value);
}

function knownValues(groupName) {
  return new Set(
    Array.from(document.querySelectorAll(`input[name="${groupName}"]`))
      .map(cb => normalize(cb.value))
  );
}

function renderTags(containerId, setRef) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  Array.from(setRef).sort().forEach(label => {
    const pill = document.createElement("span");
    pill.className = "tag";
    pill.textContent = label;

    const x = document.createElement("button");
    x.type = "button";
    x.innerHTML = "✕";
    x.title = "Remove";
    x.addEventListener("click", () => {
      setRef.delete(label);
      renderTags(containerId, setRef);
    });

    pill.appendChild(x);
    container.appendChild(pill);
  });
}

function addTag(setRef, containerId, raw) {
  const clean = normalize(raw);
  if (!clean) return;

  if (!setRef.has(clean)) setRef.add(clean);
  renderTags(containerId, setRef);
}

document.getElementById("addAllergyTagBtn").addEventListener("click", () => {
  const input = document.getElementById("otherAllergyInput");
  addTag(otherAllergySet, "allergyTags", input.value);
  input.value = "";
  input.focus();
});

document.getElementById("otherAllergyInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("addAllergyTagBtn").click();
  }
});

document.getElementById("addPrefTagBtn").addEventListener("click", () => {
  const input = document.getElementById("otherPrefInput");
  addTag(otherPrefSet, "prefTags", input.value);
  input.value = "";
  input.focus();
});

document.getElementById("otherPrefInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("addPrefTagBtn").click();
  }
});

(async function loadProfile() {
  try {
    const res = await fetch("/profile", { credentials: "include" });
    if (!res.ok) throw new Error("Failed to load profile");
    const data = await res.json();

    const allergies = data.allergies || [];
    const preferences = data.preferences || [];

    setChecked("allergy", allergies);
    setChecked("preference", preferences);

    const knownAll = knownValues("allergy");
    const knownPref = knownValues("preference");

    otherAllergySet.clear();
    otherPrefSet.clear();

    allergies.forEach(a => {
      const n = normalize(a);
      if (n && !knownAll.has(n)) otherAllergySet.add(n);
    });

    preferences.forEach(p => {
      const n = normalize(p);
      if (n && !knownPref.has(n)) otherPrefSet.add(n);
    });

    renderTags("allergyTags", otherAllergySet);
    renderTags("prefTags", otherPrefSet);
  } catch (e) {
    console.error(e);
    showMsg("Could not load your profile", false);
  }
})();

document.getElementById("saveBtn").addEventListener("click", async () => {
  msg.innerText = "";

  const allergies = [
    ...collectChecked("allergy"),
    ...Array.from(otherAllergySet)
  ];

  const preferences = [
    ...collectChecked("preference"),
    ...Array.from(otherPrefSet)
  ];

  try {
    const res = await fetch("/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allergies, preferences })
    });

    const text = await res.text();
    if (res.ok) showMsg(text || "Profile updated", true);
    else showMsg(text || "Save failed", false);
  } catch (e) {
    console.error(e);
    showMsg("Server error", false);
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  const res = await fetch("/logout", { method: "POST" });

  if (res.ok) {
    window.location.href = "/";
  } else {
    alert("Logout failed");
  }
});
