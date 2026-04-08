    const form = document.getElementById("registerForm");
    const msg = document.getElementById("msg");

    function getCheckedValues(name) {
        return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
            .map(cb => cb.value);
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        msg.textContent = "";
        msg.style.color = "#333";

        const username = document.getElementById("username").value.trim();
        const password = document.getElementById("password").value.trim();

        const allergies = getCheckedValues("allergy");
        const other = document.getElementById("other").value.trim();
        if (other) allergies.push(other);

        const preferences = getCheckedValues("preference");
        const otherPref = document.getElementById("other_pref").value.trim();
        if (otherPref) preferences.push(otherPref);

        try {
            const res = await fetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, allergies, preferences })
            });

            const text = await res.text();

            if (!res.ok) {
                msg.style.color = "crimson";
                msg.textContent = text || "Registration failed";
                return;
            }

            msg.style.color = "green";
            msg.textContent = text || "User registered successfully";

            setTimeout(() => {
                window.location.href = "login.html";
            }, 700);

        } catch (err) {
            console.error(err);
            msg.style.color = "crimson";
            msg.textContent = "Network/server error";
        }
    });
