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

  // Inside the page the site's own header is enough: hide the dashboard's.
  function tidyFrame() {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head || doc.getElementById("larkspur-embed")) return;
      const link = doc.createElement("link");
      link.id = "larkspur-embed";
      link.rel = "stylesheet";
      link.href = "/css/embed.css";
      doc.head.append(link);
    } catch {
      // not the proxied dashboard
    }
  }

  // The chat and dashboard fill the screen below the intro, so only they scroll.
  function fit() {
    const panes = document.querySelector(".split-panes");
    const top = panes.getBoundingClientRect().top + window.scrollY;
    document.documentElement.style.setProperty("--split-top", `${Math.round(top)}px`);
  }
  fit();
  window.addEventListener("resize", fit);

  frame.addEventListener("load", () => {
    tidyFrame();
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

  // A new copy replaced a deleted one: the dashboard signs in to it, and the
  // chat finds out its conversation is gone.
  document.addEventListener("larkspur:new-copy", () => {
    reload();
    document.dispatchEvent(new CustomEvent("gus:refresh"));
  });

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
  const saved = recall(VIEW);
  setView(saved === "phone" || saved === "texts" ? saved : "desktop");

  // Narrow screens show one side at a time; Texts is the dashboard side's Texts view.
  document.querySelectorAll("[data-pane-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.paneTab;
      main.dataset.pane = tab === "chat" ? "chat" : "dash";
      if (tab === "texts") setView("texts");
      else if (tab === "dash" && box.dataset.view === "texts") setView("desktop");
      document.querySelectorAll("[data-pane-tab]").forEach((other) => {
        other.setAttribute("aria-pressed", String(other === button));
      });
      if (tab === "dash" && newBadge) newBadge.hidden = true;
    });
  });

  // Texts view: the owner texts Gus, answered by the demo backend in the page.
  const texts = document.querySelector("[data-texts]");
  if (texts) {
    const list = texts.querySelector("[data-texts-list]");
    const form = texts.querySelector("[data-texts-form]");
    const input = texts.querySelector("[data-texts-input]");
    const send = form.querySelector("button");
    const history = [];
    let busy = false;
    const zone = window.LARKSPUR.timeZone || "America/Los_Angeles";
    const stamp = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: zone });
    const larkspurDay = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    const visitorDay = new Intl.DateTimeFormat("en-CA");
    const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: zone });
    // "Today" only when Larkspur's date is also the visitor's date.
    function timeLabel(now) {
      const day = larkspurDay.format(now) === visitorDay.format(now) ? "Today" : weekday.format(now);
      return `${day} ${stamp.format(now)}`;
    }
    function add(cls, text) {
      const node = document.createElement("p");
      node.className = cls;
      node.textContent = text;
      list.append(node);
      list.scrollTop = list.scrollHeight;
      return node;
    }
    function failure(err) {
      if (err && err.status === 429) return "That's a lot of texts at once. Give it a minute and try again.";
      if (err && err.status === 503) return "Texts are off on the demo right now.";
      return "I couldn't answer just now. Please try again in a moment.";
    }
    async function ask(text) {
      text = text.trim().slice(0, 500);
      if (!text || busy) return;
      busy = true;
      send.disabled = true;
      if (!list.querySelector(".msg")) add("msg-time", timeLabel(new Date()));
      list.querySelectorAll(".msg-delivered").forEach((node) => node.remove());
      add("msg sent", text);
      const delivered = add("msg-delivered", "Delivered");
      const typing = add("msg got typing", "•••");
      let reply;
      try {
        reply = await window.LarkspurSandbox.ownerText(text, history.slice(-10));
        history.push({ role: "owner", text }, { role: "assistant", text: reply.slice(0, 1000) });
      } catch (err) {
        reply = failure(err);
      }
      typing.remove();
      delivered.remove();
      add("msg got", reply);
      busy = false;
      send.disabled = false;
      // A YES may have just changed the copy: show it on the dashboard.
      reload();
    }
    // Earlier answers were about the deleted copy.
    document.addEventListener("larkspur:new-copy", () => {
      history.length = 0;
      add("msg-time", "Your earlier demo copy expired. This is a fresh one.");
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value;
      input.value = "";
      ask(text);
    });
    texts.querySelectorAll("[data-texts-chips] button").forEach((chip) => {
      chip.addEventListener("click", () => ask(chip.textContent));
    });
  }

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
