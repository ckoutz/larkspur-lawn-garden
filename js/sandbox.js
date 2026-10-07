// Every visitor gets their own copy of Larkspur on the demo backend: their chat
// with Gus lands in their own owner dashboard, and the copy is deleted two
// hours after their last click. The copy is remembered in this browser only.
(function () {
  const cfg = window.LARKSPUR;
  const KEY = "larkspur_sandbox";

  class SandboxError extends Error {
    constructor(status) {
      super(
        status === 429
          ? "You've opened a few demos already. Please try again in an hour."
          : status === 503
            ? "The demo is busy right now. Please try again in a few minutes."
            : "The demo is unavailable right now. Please try again shortly.",
      );
      this.status = status;
    }
  }

  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || "null");
      return value && value.publicKey && value.sandboxToken ? value : null;
    } catch {
      return null;
    }
  }
  function write(value) {
    try {
      if (value) localStorage.setItem(KEY, JSON.stringify(value));
      else localStorage.removeItem(KEY);
    } catch {
      // private mode: the copy lasts for this page only
    }
  }

  let current = read();
  let creating = null;

  async function post(path, token) {
    const headers = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    return fetch(cfg.apiUrl + path, { method: "POST", headers });
  }

  // Resolves to the visitor's copy, or null where sandboxes are off (the shared
  // demo business is used then).
  function ensure() {
    if (!cfg.sandbox) return Promise.resolve(null);
    // Another tab may have made the copy since this page loaded.
    current = current || read();
    if (current) return Promise.resolve(current);
    if (!creating) {
      creating = (async () => {
        const res = await post("/v1/demo/sandboxes");
        if (res.status === 404) return null;
        if (!res.ok) throw new SandboxError(res.status);
        const body = await res.json();
        // Two tabs that both started without a copy: the first one saved wins.
        const saved = read();
        if (saved) return (current = saved);
        current = { publicKey: body.publicKey, sandboxToken: body.sandboxToken };
        write(current);
        return current;
      })().finally(() => {
        creating = null;
      });
    }
    return creating;
  }

  // The copy was swept (idle too long): forget it so the next call makes a new one.
  function forget() {
    current = null;
    write(null);
  }

  async function businessKey() {
    const sandbox = await ensure();
    return sandbox ? sandbox.publicKey : cfg.businessKey;
  }

  // Signs the visitor in to their own owner dashboard, no e-mail involved.
  async function openOwnerView() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const sandbox = await ensure();
      if (!sandbox) throw new SandboxError(404);
      const res = await post("/v1/demo/sandboxes/sign-in", sandbox.sandboxToken);
      if (res.status === 401) {
        forget();
        continue;
      }
      if (!res.ok) throw new SandboxError(res.status);
      const { signInToken } = await res.json();
      window.location.assign(`${cfg.dashboardOrigin}/portal/session?token=${encodeURIComponent(signInToken)}`);
      return;
    }
    throw new SandboxError(401);
  }

  window.LarkspurSandbox = { ensure, forget, businessKey, openOwnerView, SandboxError };

  document.querySelectorAll("[data-owner-view]").forEach((button) => {
    const status = document.getElementById(button.getAttribute("aria-describedby") || "");
    button.addEventListener("click", async () => {
      button.disabled = true;
      if (status) status.hidden = true;
      try {
        await openOwnerView();
      } catch (err) {
        if (status) {
          status.textContent =
            err instanceof SandboxError ? err.message : "Couldn't reach the demo. Check your connection and try again.";
          status.hidden = false;
        }
        button.disabled = false;
      }
    });
  });
})();
