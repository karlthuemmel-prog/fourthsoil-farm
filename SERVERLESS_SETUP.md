# Serverless Setup — Dynamic Checkout (Cloudflare Workers)

`order.html` builds a custom order (Variety Pack / Custom Combo / Single Variety
Bulk, with or without a subscription) and needs to create a Stripe Checkout
Session with the exact line items the customer picked. That requires calling
Stripe's API with your **secret key**, which can only ever happen server-side —
never in the browser. GitHub Pages can't run that code, so this one function
lives on Cloudflare Workers instead. Everything else about the site (GitHub
Pages hosting, the rest of the pages) is unaffected.

The function itself is already written: `cloudflare-worker/create-checkout-session.js`.
You just need to deploy it and tell the site where to find it. This is a
one-time setup — after this, ordinary content edits still just happen in the
GitHub repo like everything else.

---

## 1. Create a Cloudflare account (if you don't have one)

Go to [cloudflare.com](https://cloudflare.com) and sign up — the free tier is
plenty for a small farm's order volume (100,000 requests/day).

## 2. Install Wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
wrangler login
```

This opens a browser window to authorize the CLI against your Cloudflare
account.

## 3. Deploy the Worker

From the repo root:

```bash
cd cloudflare-worker
wrangler deploy
```

This publishes the function to a URL that looks like:

```
https://fourthsoil-checkout.YOUR-SUBDOMAIN.workers.dev
```

Wrangler prints this URL when the deploy finishes — copy it, you'll need it
in step 5.

## 4. Set your Stripe secret key

**Never** put this in a file — it's set as an encrypted Worker secret instead:

```bash
wrangler secret put STRIPE_SECRET_KEY
```

Paste your Stripe **test** secret key (starts with `sk_test_...`, found in
the Stripe Dashboard under Developers → API keys) when prompted. Start with
the test key — switch to the live key (`sk_live_...`) only once you've fully
verified the flow (see step 7).

## 5. Point the site at your Worker

Open `order.js` and find this line near the top:

```js
const CHECKOUT_ENDPOINT = 'YOUR_WORKER_ENDPOINT_HERE/create-checkout-session';
```

Replace `YOUR_WORKER_ENDPOINT_HERE` with the URL from step 3, e.g.:

```js
const CHECKOUT_ENDPOINT = 'https://fourthsoil-checkout.YOUR-SUBDOMAIN.workers.dev/create-checkout-session';
```

Commit and push this change so it's live on GitHub Pages.

## 6. Set your domain in `wrangler.toml`

Open `cloudflare-worker/wrangler.toml` and update these two values to match
your real domain (they control CORS and the redirect URLs after checkout):

```toml
[vars]
SITE_URL = "https://fourthsoil.farm"
ALLOWED_ORIGIN = "https://fourthsoil.farm"
```

Re-run `wrangler deploy` after changing this file.

*(While testing locally against `http://localhost:4900`, you can temporarily
set `ALLOWED_ORIGIN = "http://localhost:4900"` and redeploy — just remember
to switch it back to your real domain before going live.)*

## 7. Test end-to-end (test mode)

With the test secret key still in place:

1. Open `order.html` on the live site (or locally with `ALLOWED_ORIGIN` set
   to match, per the note above)
2. Try all three order types — Variety Pack, Custom Combo, Single Variety
   Bulk — both as a one-time order and as a subscription (weekly and
   bi-weekly)
3. Confirm each one redirects to a real Stripe Checkout page showing the
   correct line items and total
4. Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC,
   to complete a test purchase
5. Check the Stripe Dashboard (test mode) → **Payments** or **Subscriptions**
   to confirm the order landed correctly, with the right price and — for
   subscriptions — the right billing interval (weekly vs. every 2 weeks)

## 8. Get notified when an order comes in

Stripe can email you automatically for every successful payment and new
subscription — no code needed. In the Stripe Dashboard, go to
**Settings → Notifications** and turn on email alerts for payments and
subscriptions. The email includes the line-item descriptions (variety names,
Delivery Fee if applied), so it doubles as a quick order summary. Do this in
both Test mode and Live mode, since the setting is separate for each.

If you'd rather get a text or a Slack message instead of email, that would
require a Stripe webhook forwarding to a custom handler — a bigger lift than
this one Dashboard toggle. Worth considering later if email notifications
turn out to be too easy to miss.

## 9. Go live

When you're confident everything works in test mode:

1. Swap the Worker secret to your live key:
   ```bash
   wrangler secret put STRIPE_SECRET_KEY
   ```
   (paste your `sk_live_...` key this time)
2. Nothing else changes — the same Worker URL, the same `order.js`, the same
   `wrangler.toml`. Only the secret key switches from test to live.

---

## Troubleshooting

- **"Ordering isn't set up yet" message on the site** — `CHECKOUT_ENDPOINT`
  in `order.js` still has the placeholder value. Complete step 5.
- **Browser console shows a CORS error** — `ALLOWED_ORIGIN` in
  `wrangler.toml` doesn't match the origin you're testing from. Update and
  redeploy (step 6).
- **Checkout page shows the wrong price** — the Worker's pricing table
  (top of `cloudflare-worker/create-checkout-session.js`) is the *only*
  source of truth for what gets charged. If you change a price, update it
  there (and in `pricing.json`, which is what the page displays before
  checkout — keep both in sync) and redeploy.
- **Need to change the bulk shoots/micros variety list** — edit
  `BULK_VARIETIES` in `create-checkout-session.js` and the matching
  `bulk.shoots.varieties` / `bulk.micros.varieties` in `pricing.json`.
