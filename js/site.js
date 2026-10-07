// Mobile menu and the sign-in form.
(function () {
  const menuBtn = document.querySelector(".menu-btn");
  const menu = document.getElementById("mobile-nav");
  if (menuBtn && menu) {
    menuBtn.addEventListener("click", () => {
      const open = menu.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    menu.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        menu.classList.remove("open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  const form = document.getElementById("signin-form");
  if (form) {
    const cfg = window.LARKSPUR;
    const status = document.getElementById("signin-status");
    const button = form.querySelector("button[type=submit]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.email.value.trim();
      if (!email) return;
      button.disabled = true;
      status.hidden = true;
      status.className = "notice";
      try {
        const res = await fetch(
          `${cfg.apiUrl}/v1/businesses/${encodeURIComponent(cfg.businessKey)}/portal/login`,
          {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ email }),
          },
        );
        if (res.status === 429) throw new Error("Too many tries. Please wait a minute and try again.");
        if (!res.ok) throw new Error("Sign-in is unavailable right now. Please try again shortly.");
        status.textContent = `If ${email} is on file with us, a sign-in link is on its way. It works once and expires in 15 minutes.`;
      } catch (err) {
        status.classList.add("error");
        status.textContent =
          err instanceof TypeError ? "Couldn't reach Larkspur. Check your connection and try again." : err.message;
      } finally {
        status.hidden = false;
        button.disabled = false;
      }
    });
  }
})();
