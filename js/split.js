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

  // The guided walkthrough starts the first time Texts is shown.
  let autoplay = () => {};
  function setView(view) {
    box.dataset.view = view;
    if (view === "texts") autoplay();
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
    function begin(text) {
      if (!list.querySelector(".msg")) add("msg-time", timeLabel(new Date()));
      list.querySelectorAll(".msg-delivered").forEach((node) => node.remove());
      add("msg sent", text);
      const delivered = add("msg-delivered", "Delivered");
      const typing = add("msg got typing", "\u2022\u2022\u2022");
      return () => {
        typing.remove();
        delivered.remove();
      };
    }
    function finish(text, reply) {
      history.push({ role: "owner", text }, { role: "assistant", text: reply.slice(0, 1000) });
      add("msg got", reply);
      // A YES may have just changed the copy: show it on the dashboard.
      reload();
    }
    const queued = [];
    function setBusy(value) {
      busy = value;
      send.disabled = value;
      if (replay) replay.disabled = value;
      if (guideNext) guideNext.disabled = value;
      if (!value && queued.length) ask(queued.shift());
    }
    async function ask(text) {
      text = text.trim().slice(0, 500);
      if (!text) return;
      // Sent while a walkthrough step is still on its way: goes right after it.
      if (busy) {
        queued.push(text);
        return;
      }
      setBusy(true);
      const done = begin(text);
      let reply;
      let ok = true;
      try {
        reply = await window.LarkspurSandbox.ownerText(text, history.slice(-10));
      } catch (err) {
        reply = failure(err);
        ok = false;
      }
      done();
      if (ok) finish(text, reply);
      else add("msg got", reply);
      setBusy(false);
    }

    // The guided walkthrough (js/guided-script.js): it texts Gus for real on
    // the visitor's copy, retries an odd answer once, then shows the saved one.
    const steps = window.LARKSPUR_GUIDED || [];
    const guide = texts.querySelector("[data-guide]");
    const guideStatus = guide && guide.querySelector("[data-guide-status]");
    const replay = guide && guide.querySelector("[data-guide-replay]");
    const guidePause = guide && guide.querySelector("[data-guide-pause]");
    const guideNext = guide && guide.querySelector("[data-guide-next]");
    const intro = list.innerHTML;
    let run = 0;
    let played = false;
    const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const playing = (id) => id === run;
    function guideSays(text) {
      if (guideStatus) guideStatus.textContent = text;
    }
    // Pacing: a beat before each step, Gus "typing" for a moment, then the
    // reply stays up long enough to read. Pause holds at the next reply;
    // Next skips the wait, and while paused plays exactly one more step.
    let paused = false;
    let skip = false;
    let through = false;
    let stepLabel = "";
    function showStep() {
      guideSays(paused ? `${stepLabel} \u00b7 Paused` : stepLabel);
    }
    function setPaused(value) {
      paused = value;
      if (guidePause) {
        guidePause.textContent = value ? "Play" : "Pause";
        guidePause.setAttribute("aria-pressed", String(value));
      }
      showStep();
    }
    function showControls(on) {
      if (guidePause) guidePause.hidden = !on;
      if (guideNext) guideNext.hidden = !on;
    }
    function readTime(text) {
      const words = text.split(/\s+/).filter(Boolean).length;
      const longer = /\bYES\b|\n|\u2022/.test(text) ? 2500 : 0;
      return Math.min(16000, Math.max(3000, 1000 + words * 260) + longer);
    }
    // Waits `ms` of unpaused time; false once the walkthrough has stopped.
    async function hold(id, ms, reading) {
      if (reading) through = false;
      skip = false;
      let left = ms;
      while (playing(id) && !skip && ((paused && !through) || left > 0)) {
        await pause(100);
        if (!paused || through) left -= 100;
      }
      skip = false;
      return playing(id);
    }
    function takeOver() {
      if (!run || !guide || guide.dataset.state !== "playing") return;
      // A request already on its way still lands; only the next steps stop.
      run += 1;
      guide.dataset.state = "done";
      showControls(false);
      guideSays("Your turn. Text Gus anything.");
      input.placeholder = "Now try your own";
      // Drop a half-typed walkthrough text; keydown runs before the visitor's key lands.
      input.value = "";
    }
    // The live reply; null for an odd answer; undefined when Gus can't be reached.
    async function live(text, expect) {
      let reached = false;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const reply = await window.LarkspurSandbox.ownerText(text, history.slice(-10));
          reached = true;
          if (expect.test(reply)) return reply;
        } catch {
          // A refusal (e.g. too many texts a minute) gets a short wait, so the retry can land.
          if (attempt === 0) await pause(10000);
        }
      }
      return reached ? null : undefined;
    }
    async function typeOut(id, text) {
      input.value = "";
      for (const char of text) {
        if (!playing(id)) return false;
        input.value += char;
        await pause(55);
      }
      await pause(600);
      if (!playing(id)) return false;
      input.value = "";
      return true;
    }
    async function play() {
      if (!steps.length || !guide) return;
      const id = (run += 1);
      played = true;
      list.innerHTML = intro;
      history.length = 0;
      guide.dataset.state = "playing";
      showControls(true);
      setPaused(false);
      input.placeholder = "Type to take over";
      let lastLive = false;
      // Once Gus can't be reached, the rest of the run shows saved answers at once.
      let offline = false;
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        stepLabel = `Step ${i + 1} of ${steps.length}`;
        showStep();
        if (!(await hold(id, 1500))) return;
        if (!(await typeOut(id, step.text))) return;
        setBusy(true);
        const done = begin(step.text);
        // A YES to a change that was never set up live would only confuse Gus.
        const [reply] = await Promise.all([
          offline || (step.confirm && !lastLive) ? null : live(step.text, step.expect),
          pause(1600),
        ]);
        if (reply === undefined) offline = true;
        done();
        lastLive = typeof reply === "string";
        if (lastLive) finish(step.text, reply);
        else {
          add("msg got", step.fallback);
          add("msg-saved", "Saved example: the live answer didn't come through, so this step didn't change your copy.");
        }
        setBusy(false);
        if (!(await hold(id, readTime(lastLive ? reply : step.fallback), true))) return;
      }
      guide.dataset.state = "done";
      showControls(false);
      guideSays("Now try your own.");
      input.placeholder = "Now try your own";
    }
    // Disabled while a reply is on its way, so an old reply never lands in a replay.
    if (replay) replay.addEventListener("click", () => {
      if (!busy) play();
    });
    if (guidePause) guidePause.addEventListener("click", () => setPaused(!paused));
    if (guideNext) guideNext.addEventListener("click", () => {
      if (busy) return;
      skip = true;
      if (paused) through = true;
    });
    // Typing, sending or a chip hands the conversation to the visitor.
    input.addEventListener("keydown", (event) => {
      if (event.isTrusted) takeOver();
    });
    input.addEventListener("pointerdown", takeOver);
    // Only once Texts is on screen: a hidden walkthrough would spend texts.
    autoplay = () => {
      if (!played && texts.getClientRects().length > 0) play();
    };
    // Also when Texts appears without a view change, e.g. a phone turned wide.
    if ("ResizeObserver" in window) new ResizeObserver(() => autoplay()).observe(texts);

    // Earlier answers were about the deleted copy.
    document.addEventListener("larkspur:new-copy", () => {
      history.length = 0;
      add("msg-time", "Your earlier demo copy expired. This is a fresh one.");
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      takeOver();
      const text = input.value;
      input.value = "";
      ask(text);
    });
    texts.querySelectorAll("[data-texts-chips] button").forEach((chip) => {
      chip.addEventListener("click", () => {
        takeOver();
        ask(chip.textContent);
      });
    });
    if (box.dataset.view === "texts") autoplay();
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
