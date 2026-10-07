# Larkspur Lawn & Garden (fictional demo business)

Marketing site for the Güd Office demo. Larkspur, its address, phone, reviews and prices are made up.

- Plain HTML, CSS and JavaScript, no build step. Netlify publishes the repo root (`netlify.toml`).
- Pages: `index.html` (home), `services.html`, `book.html` (book an estimate), `signin.html`.
- **Gus** (`js/gus.js`) is the real GVAS booking chat, talking to the demo backend in `js/config.js`. A booking request waits under **Needs you** on the owner dashboard until the owner approves it, the same as in production.
- Sign-in asks GVAS for a one-time link. The demo backend only logs e-mail, so nothing is sent.
- The demo backend only accepts browser calls from the business's site address (and any `GVAS_PUBLIC_CORS_EXTRA_ORIGINS`), so the chat works on https://larkspur-lawn-garden.netlify.app.

Local preview: `python3 -m http.server 8800`, with `http://localhost:8800` in the demo backend's extra origins.

Photos are Unsplash stock (free to use). Credit the photographers if this site is ever published for real.
