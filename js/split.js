// The owner view: Gus on the left as the customer, the visitor's own owner
// dashboard on the right. The dashboard is served under this site's address
// (netlify.toml), so this page can tell where it is and reload it.
(function () {
  const main = document.querySelector(".split");
  const frame = document.querySelector("[data-split-frame]");
  if (!main || !frame || !window.LarkspurSandbox) return;
  const box = frame.closest(".split-dash");
  const status = document.getElementById("split-status");
  const newBadge = document.querySelector(".split-new");
  const SIGNED_IN_FOR = "larkspur_dashboard_for";
  const VIEW = "larkspur_dashboard_view";
  const OWNER = "/portal/owner";
  let signingIn = false;
  let retried = false;

  function remember(key, value) {
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch {
      // private mode: this page only
    }
  }
  function recall(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function framePath() {
    try {
      return frame.contentWindow.location.pathname;
    } catch {
      return "";
    }
  }
  function showError(err) {
    status.textContent =
      err instanceof window.LarkspurSandbox.SandboxError
        ? err.message
        : "Couldn't reach the demo. Check your connection and try again.";
    status.hidden = false;
  }

  async function signIn() {
    signingIn = true;
    status.hidden = true;
    try {
      const path = await window.LarkspurSandbox.ownerSignInPath();
      const sandbox = await window.LarkspurSandbox.ensure();
      remember(SIGNED_IN_FOR, sandbox && sandbox.publicKey);
      frame.src = path;
    } catch (err) {
      signingIn = false;
      showError(err);
    }
  }

  // The dashboard's cookie is for the visitor's current copy: open it, or sign
  // in again (first visit, or a new copy after the old one was deleted).
  async function open() {
    try {
      const sandbox = await window.LarkspurSandbox.ensure();
      if (sandbox && recall(SIGNED_IN_FOR) === sandbox.publicKey) frame.src = OWNER;
      else await signIn();
    } catch (err) {
      showError(err);
    }
  }

  async function reload() {
    // A sign-in under way lands on the fresh dashboard; its link works only once.
    if (signingIn) return;
    const sandbox = await window.LarkspurSandbox.ensure().catch(() => null);
    if (sandbox && recall(SIGNED_IN_FOR) !== sandbox.publicKey) return signIn();
    const path = framePath();
    if (path.startsWith("/portal") && !path.startsWith("/portal/session")) frame.contentWindow.location.reload();
    else frame.src = OWNER;
  }

  frame.addEventListener("load", () => {
    const path = framePath();
    if (path.startsWith("/portal/session")) return;
    const wasSigningIn = signingIn;
    signingIn = false;
    // Signed out (the cookie expired): sign in once more, then leave it.
    if (path.startsWith("/portal/login") && !wasSigningIn && !retried) {
      retried = true;
      signIn();
      return;
    }
    // The owner may have just approved or declined: let the chat catch up.
    document.dispatchEvent(new CustomEvent("gus:refresh"));
  });

  // The visitor picked, moved or cancelled a time in the chat.
  document.addEventListener("gus:change", () => {
    reload();
    if (main.dataset.pane === "chat" && newBadge) newBadge.hidden = false;
  });

  document.querySelector("[data-split-refresh]").addEventListener("click", reload);

  function setView(view) {
    box.dataset.view = view;
    document.querySelectorAll("[data-view-btn]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.viewBtn === view));
    });
    remember(VIEW, view);
  }
  document.querySelectorAll("[data-view-btn]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewBtn));
  });
  setView(recall(VIEW) === "phone" ? "phone" : "desktop");

  // Narrow screens show one side at a time.
  document.querySelectorAll("[data-pane-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      main.dataset.pane = button.dataset.paneTab;
      document.querySelectorAll("[data-pane-tab]").forEach((other) => {
        other.setAttribute("aria-pressed", String(other === button));
      });
      if (button.dataset.paneTab === "dash" && newBadge) newBadge.hidden = true;
    });
  });

  // The phones' status-bar clock, in Larkspur's time zone.
  const clockFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: window.LARKSPUR.timeZone || "America/Los_Angeles",
  });
  function tick() {
    const label = clockFmt.format(new Date()).replace(/\s?[AP]M$/, "");
    document.querySelectorAll("[data-iphone-time]").forEach((node) => (node.textContent = label));
  }
  tick();
  window.setInterval(tick, 30000);

  open();
})();
