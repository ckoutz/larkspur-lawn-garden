# Güd Office screenshots

Captures six screens of the Larkspur demo at phone (390×844) and desktop
(1440×900) size, at 2× pixel density: owner home, quotes (the week's calendar
on the phone, where the Quotes table scrolls sideways), a quote with Mark
paid, the check/cash monthly plan, the Gus booking chat (openings, then request
sent) and the owner approval under Needs you.

1. Reset the demo and print a one-time owner sign-in link (it works once and
   expires after 15 minutes), on the demo backend only:

   ```
   gvas-seed-demo --business-id <larkspur id> --reset --sign-in-link https://larkspur-dashboard.vercel.app
   ```

2. Capture:

   ```
   npm install && npx playwright install chromium
   SIGN_IN_LINK='<link>' npm run capture
   ```

Images go to `larkspur-shots/` next to the repo, outside the published site
(`OUT_DIR` to change it, `SCALE=1` for 1×). The run books
one fictional walk-through through the real Gus chat and leaves it under Needs
you. It never approves, pays or sends anything.
