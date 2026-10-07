// Gus: the real GVAS booking chat. Gus collects the details, offers openings,
// and a picked time waits for the owner's approval under "Needs you".
(function () {
  const cfg = window.LARKSPUR;
  const STORAGE_KEY = "larkspur_gus_conversation";
  const CONSENT_KEY = "larkspur_gus_sms_consent";
  const POLL_MS = 10000;
  const SLOT_PREFIX = "slot:";
  const SMS_COPY =
    "Text me updates about my booking and quote at the number I provide (msg & data rates may apply, reply STOP to opt out)";

  const TERMINAL = {
    declined: {
      title: "That time didn't work out.",
      body: "Larkspur couldn't make that time. Start a new conversation to pick another one.",
    },
    closed: {
      title: "This conversation is closed.",
      body: "Start a new one if you still need an estimate.",
    },
  };

  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const zoneFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", timeZoneName: "short" });

  function zone(date) {
    const part = zoneFmt.formatToParts(date).find((p) => p.type === "timeZoneName");
    return part ? ` ${part.value}` : "";
  }
  function slotLabel(slot) {
    const start = new Date(slot.start);
    return `${dayFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(new Date(slot.end))}${zone(start)}`;
  }
  function bookingLabel(booking) {
    const start = new Date(booking.start);
    let label = `${dayFmt.format(start)}, ${timeFmt.format(start)}`;
    if (booking.end) label += `–${timeFmt.format(new Date(booking.end))}`;
    return label + zone(start);
  }
  // A slot pick is stored as the raw `slot:<iso>` message; show it as a time.
  function pickLabel(content) {
    const start = new Date(content.slice(SLOT_PREFIX.length));
    if (Number.isNaN(start.getTime())) return content;
    return `${dayFmt.format(start)}, ${timeFmt.format(start)}${zone(start)}`;
  }
  function mapMessages(messages) {
    return messages.map((m) => ({
      role: m.role,
      content: m.role === "user" && m.content.startsWith(SLOT_PREFIX) ? pickLabel(m.content) : m.content,
    }));
  }
  function returningGreeting(booking) {
    const label = bookingLabel(booking);
    return booking.status === "confirmed"
      ? `You have a walk-through booked for ${label}. Want to keep it, change it, or ask me anything?`
      : `Your request for ${label} is with Larkspur. Want to keep it, change it, or ask me anything?`;
  }

  class HttpError extends Error {
    constructor(status) {
      super(`Request failed (${status}).`);
      this.status = status;
    }
  }

  async function api(path, { method = "GET", body, token } = {}) {
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(cfg.apiUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new HttpError(res.status);
    return res.json();
  }

  function errorCopy(err) {
    if (window.LarkspurSandbox && err instanceof window.LarkspurSandbox.SandboxError) return err.message;
    if (err instanceof HttpError) {
      if (err.status === 429) return "Too many messages. Please try again in a minute.";
      if (err.status >= 500) return "Gus is unavailable right now. Please try again shortly.";
      return "Something went wrong. Please try again.";
    }
    return "Couldn't reach Gus. Check your connection and try again.";
  }

  function readStored() {
    try {
      const value = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      return value && value.conversationId && value.conversationToken ? value : null;
    } catch {
      return null;
    }
  }
  // The SMS opt-in is kept apart from the conversation so ticking it before the
  // chat has started, or while a poll is in flight, is never lost.
  function readConsent() {
    try {
      return sessionStorage.getItem(CONSENT_KEY) === "1";
    } catch {
      return false;
    }
  }
  function writeConsent(checked) {
    try {
      if (checked) sessionStorage.setItem(CONSENT_KEY, "1");
      else sessionStorage.removeItem(CONSENT_KEY);
    } catch {
      // private mode: the box still works for this page
    }
  }
  function writeStored(value) {
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // private mode: the chat still works, it just won't resume
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  const enc = encodeURIComponent;
  let instance = 0;

  class GusChat {
    constructor(root) {
      instance += 1;
      this.root = root;
      this.state = "collecting";
      this.phase = "booting";
      this.messages = [];
      this.slots = null;
      this.booking = null;
      this.error = null;
      this.stored = null;
      this.greeting = null;
      this.timer = null;
      this.build(`gus-${instance}`);
      this.boot();
    }

    build(id) {
      this.root.classList.add("gus");
      this.root.dataset.intakeState = this.state;

      this.banner = el("div", "gus-banner");
      this.banner.setAttribute("role", "status");
      this.banner.hidden = true;

      this.log = el("div", "gus-log");
      this.log.setAttribute("role", "log");
      this.log.setAttribute("aria-live", "polite");
      this.log.setAttribute("aria-label", "Conversation with Gus");

      this.form = el("form", "gus-form");
      const label = el("label", "sr-only", "Your message");
      label.htmlFor = `${id}-message`;
      this.input = el("input", "gus-input");
      this.input.id = `${id}-message`;
      this.input.type = "text";
      this.input.autocomplete = "off";
      this.sendBtn = el("button", "gus-send", "Send");
      this.sendBtn.type = "submit";
      this.form.append(label, this.input, this.sendBtn);
      this.form.addEventListener("submit", (event) => {
        event.preventDefault();
        const text = this.input.value.trim();
        if (!text) return;
        this.input.value = "";
        this.send(text).then((sent) => {
          if (!sent && this.phase === "ready" && !this.input.value) {
            this.input.value = text;
            this.renderControls();
          }
        });
      });
      this.input.addEventListener("input", () => this.renderControls());

      const consent = el("div", "gus-consent");
      this.consent = el("input");
      this.consent.type = "checkbox";
      this.consent.id = `${id}-sms`;
      const consentLabel = el("label", null, SMS_COPY);
      consentLabel.htmlFor = this.consent.id;
      this.consent.checked = readConsent();
      this.consent.addEventListener("change", () => writeConsent(this.consent.checked));
      consent.append(this.consent, consentLabel);

      // Only a visitor's own copy knows Sam; the shared demo business still asks.
      const demo = el("div", "gus-demo");
      this.samLine = el("span");
      this.samLine.append(
        el("b", null, "You're Sam Rivera, a homeowner in Oakland. "),
        "Gus already has Sam's contact details, so just tell him about the yard. ",
      );
      this.samLine.hidden = true;
      demo.append(this.samLine, "Larkspur is a fictional business.");

      this.root.append(this.banner, demo, this.log, this.form, consent);
    }

    async boot() {
      this.phase = "booting";
      this.error = null;
      this.render();
      try {
        const stored = readStored();
        if (stored) this.samLine.hidden = !stored.sam;
        if (stored && (await this.resume(stored))) return;
        const res = await this.startConversation();
        this.stored = {
          conversationId: res.conversationId,
          conversationToken: res.conversationToken,
          sam: !this.samLine.hidden,
        };
        writeStored(this.stored);
        this.state = res.state;
        this.slots = res.slots;
        this.booking = null;
        this.greeting = null;
        this.messages = res.reply ? [{ role: "agent", content: res.reply }] : [];
        this.phase = "ready";
      } catch (err) {
        this.error = errorCopy(err);
        this.phase = "error";
      }
      this.render();
    }

    async startConversation() {
      const sandbox = window.LarkspurSandbox;
      for (let attempt = 0; ; attempt += 1) {
        const key = sandbox ? await sandbox.businessKey() : cfg.businessKey;
        this.samLine.hidden = key === cfg.businessKey;
        try {
          return await api(`/v1/businesses/${enc(key)}/intake/conversations`, { method: "POST", body: {} });
        } catch (err) {
          if (!sandbox || attempt > 0 || !(err instanceof HttpError && err.status === 404)) throw err;
          sandbox.forget();
        }
      }
    }

    async resume(stored) {
      try {
        const res = await api(`/v1/intake/conversations/${enc(stored.conversationId)}`, {
          token: stored.conversationToken,
        });
        this.stored = stored;
        this.applyView(res);
        this.greeting = res.booking ? { role: "agent", content: returningGreeting(res.booking) } : null;
        if (this.greeting) this.messages.push(this.greeting);
        this.phase = "ready";
        this.render();
        return true;
      } catch (err) {
        if (err instanceof HttpError && (err.status === 401 || err.status === 404)) {
          writeStored(null);
          return false;
        }
        throw err;
      }
    }

    applyView(view) {
      this.state = view.state;
      this.slots = view.slots;
      this.booking = view.booking || null;
      this.messages = mapMessages(view.messages);
    }

    async send(message, echo = message) {
      if (!this.stored || this.phase === "sending") return false;
      const previousSlots = this.slots;
      const echoed = { role: "user", content: echo };
      this.messages.push(echoed);
      this.slots = null;
      this.error = null;
      this.phase = "sending";
      this.render();
      try {
        const res = await api(`/v1/intake/conversations/${enc(this.stored.conversationId)}/messages`, {
          method: "POST",
          token: this.stored.conversationToken,
          body: { message, sms_consent: this.consent.checked },
        });
        this.state = res.state;
        this.slots = res.slots;
        this.booking = res.booking || null;
        if (res.reply) this.messages.push({ role: "agent", content: res.reply });
        this.phase = "ready";
        this.render();
        if (!this.input.disabled) this.input.focus();
        return true;
      } catch (err) {
        if (err instanceof HttpError && err.status === 401) {
          writeStored(null);
          this.phase = "expired";
        } else {
          this.messages = this.messages.filter((m) => m !== echoed);
          this.slots = previousSlots;
          this.error = errorCopy(err);
          this.phase = "ready";
        }
        this.render();
        return false;
      }
    }

    restart() {
      writeStored(null);
      this.stored = null;
      this.state = "collecting";
      this.messages = [];
      this.slots = null;
      this.booking = null;
      this.greeting = null;
      this.consent.checked = false;
      writeConsent(false);
      this.boot();
    }

    // While a request waits on the owner, keep the transcript current so the
    // approval (or a decline) shows up here without a reload.
    syncPolling() {
      const wanted = this.state === "awaiting_owner" && this.phase === "ready" && this.stored;
      if (wanted && !this.timer) {
        this.timer = window.setInterval(() => this.poll(), POLL_MS);
      } else if (!wanted && this.timer) {
        window.clearInterval(this.timer);
        this.timer = null;
      }
    }

    async poll() {
      const stored = this.stored;
      if (this.phase !== "ready" || !stored) return;
      try {
        const res = await api(`/v1/intake/conversations/${enc(stored.conversationId)}`, {
          token: stored.conversationToken,
        });
        if (this.stored?.conversationId !== stored.conversationId || this.phase !== "ready") return;
        this.applyView(res);
        if (this.greeting) this.messages.push(this.greeting);
        this.render();
      } catch (err) {
        if (this.stored?.conversationId === stored.conversationId && err instanceof HttpError && err.status === 401) {
          writeStored(null);
          this.phase = "expired";
          this.render();
        }
      }
    }

    render() {
      this.root.dataset.intakeState = this.state;
      const terminal = TERMINAL[this.state];

      if (this.booking && !terminal) {
        const confirmed = this.booking.status === "confirmed";
        this.banner.replaceChildren(
          el("b", null, `${confirmed ? "Walk-through booked" : "Request sent to Larkspur"}: ${bookingLabel(this.booking)}`),
          el(
            "span",
            null,
            confirmed ? "Keep chatting, or ask me to move or cancel it." : "Larkspur confirms every visit. You can keep chatting meanwhile.",
          ),
        );
        if (confirmed && window.LarkspurBookCall) {
          const call = el("a", "gus-call", "Like it? Book a call with Güd Vector");
          call.href = window.LarkspurBookCall;
          call.target = "_blank";
          call.rel = "noopener";
          this.banner.append(call);
        }
        this.banner.hidden = false;
      } else {
        this.banner.hidden = true;
      }

      const nodes = [];
      if (this.phase === "booting" && this.messages.length === 0) {
        nodes.push(el("p", "gus-muted", "Starting your conversation…"));
      }
      this.messages.forEach((m) => {
        const row = el("div", `gus-row ${m.role}`);
        const bubble = el("div", "gus-bubble");
        if (m.role === "owner") bubble.append(el("span", "gus-owner-label", "Larkspur"));
        bubble.append(document.createTextNode(m.content));
        row.append(bubble);
        nodes.push(row);
      });
      if (this.phase === "sending") {
        const row = el("div", "gus-row agent");
        const dots = el("div", "gus-typing");
        dots.setAttribute("aria-label", "Gus is typing");
        dots.append(el("i"), el("i"), el("i"));
        row.append(dots);
        nodes.push(row);
      }
      if (this.slots && this.slots.length > 0 && this.phase === "ready") {
        const group = el("div", "gus-slots");
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", "Open times");
        group.append(el("p", "gus-slots-title", "Pick a walk-through time:"));
        const grid = el("div", "gus-slot-grid");
        for (const slot of this.slots) {
          const start = new Date(slot.start);
          const button = el("button", "gus-slot");
          button.type = "button";
          button.setAttribute("aria-label", slotLabel(slot));
          button.append(
            el("small", null, dayFmt.format(start)),
            document.createTextNode(`${timeFmt.format(start)}–${timeFmt.format(new Date(slot.end))}`),
          );
          button.addEventListener("click", () => this.send(`${SLOT_PREFIX}${slot.start}`, slotLabel(slot)));
          grid.append(button);
        }
        group.append(grid, el("p", "gus-note", `Times shown in your time zone${zone(new Date())}.`));
        nodes.push(group);
      }
      if (terminal && this.phase === "ready") {
        nodes.push(this.card(terminal.title, terminal.body, "Start a new conversation"));
      }
      if (this.phase === "expired") {
        nodes.push(this.card("This conversation expired.", "Conversations last a day.", "Start over"));
      }
      if (this.error) {
        const p = el("p", "gus-error", this.error);
        p.setAttribute("role", "alert");
        if (this.phase === "error") {
          const retry = el("button", "gus-link", "Try again");
          retry.type = "button";
          retry.addEventListener("click", () => this.restart());
          p.append(" ", retry);
        }
        nodes.push(p);
      }
      this.log.replaceChildren(...nodes);
      this.log.scrollTop = this.log.scrollHeight;
      this.renderControls();
      this.syncPolling();
    }

    card(title, body, action) {
      const card = el("div", "gus-card");
      card.setAttribute("role", "status");
      const button = el("button", "gus-link", action);
      button.type = "button";
      button.addEventListener("click", () => this.restart());
      card.append(el("b", null, title), el("p", null, body), button);
      return card;
    }

    renderControls() {
      const terminal = Boolean(TERMINAL[this.state]);
      const disabled = this.phase !== "ready" || terminal || this.state === "proposing_slots";
      this.input.disabled = disabled;
      this.input.placeholder = terminal
        ? "This conversation is complete."
        : this.state === "proposing_slots"
          ? "Pick a time above."
          : "Type your reply…";
      this.sendBtn.disabled = disabled || !this.input.value.trim();
    }
  }

  const CHAT_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
  const CLOSE_ICON =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function chatHeader(onClose) {
    const head = el("div", "gus-head");
    const avatar = el("span", "gus-avatar", "G");
    avatar.setAttribute("aria-hidden", "true");
    const text = el("div");
    text.append(el("div", "gus-title", "Gus · Larkspur's booking assistant"));
    text.append(el("div", "gus-sub", "A few questions, then pick a time. Larkspur confirms every visit."));
    head.append(avatar, text);
    if (onClose) {
      const close = el("button", "gus-close");
      close.type = "button";
      close.setAttribute("aria-label", "Close chat");
      close.innerHTML = CLOSE_ICON;
      close.addEventListener("click", onClose);
      head.append(close);
    }
    return head;
  }

  function mountInline(host) {
    host.classList.add("gus-inline");
    host.append(chatHeader(null));
    const body = el("div");
    host.append(body);
    new GusChat(body);
  }

  function mountLauncher() {
    const launcher = el("button", "gus-launcher");
    launcher.type = "button";
    launcher.setAttribute("aria-haspopup", "dialog");
    launcher.innerHTML = `${CHAT_ICON}<span>Chat with Gus</span>`;
    const panel = el("div", "gus-panel");
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat with Gus");
    let chat = null;

    function open() {
      panel.hidden = false;
      launcher.hidden = true;
      if (!chat) {
        const body = el("div");
        panel.append(body);
        chat = new GusChat(body);
      }
      window.setTimeout(() => (chat.input.disabled ? panel.querySelector(".gus-close") : chat.input).focus(), 0);
    }
    function close() {
      panel.hidden = true;
      launcher.hidden = false;
      launcher.focus();
    }
    panel.append(chatHeader(close));
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    launcher.addEventListener("click", open);
    document.querySelectorAll("[data-open-gus]").forEach((link) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        open();
      }),
    );
    document.body.append(launcher, panel);
  }

  document.querySelectorAll("[data-gus-inline]").forEach(mountInline);
  if (!document.body.hasAttribute("data-no-launcher")) mountLauncher();
})();
