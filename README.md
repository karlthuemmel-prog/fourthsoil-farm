# Fourth Soil Farm — Website

Static website for [fourthsoil.farm](https://fourthsoil.farm), hosted on GitHub Pages.

---

## Before You Go Live — Checklist

Search the project for every placeholder and replace it:

| Placeholder | Where | What to replace with |
|---|---|---|
| `YOUR_WORKER_ENDPOINT_HERE` | `order.js` | Your deployed Cloudflare Worker URL — see [SERVERLESS_SETUP.md](SERVERLESS_SETUP.md) |
| `YOUR_STRIPE_LINK_HERE` | `index.html` | Per-product Stripe links (5 products — optional, deferred for now) |
| `YOUR_PRICE_HERE` | `index.html` | Individual product prices (5 places — optional, deferred for now) |
| `YOUR_FORMSPREE_ID` | `index.html` | Your Formspree form ID (contact form is already wired to a live ID — only change if you create a new form) |

---

## 1. Checkout Setup (Order Page)

The **Order page** (`order.html`) lets a customer build a custom order —
Variety Pack, Custom Combo, or Single Variety Bulk — with an optional
subscription (15% off, weekly or bi-weekly). Because the checkout total is
built dynamically from whatever the customer picks, it can't use a fixed
Stripe Payment Link like a simple site would — it needs a small serverless
function that creates a Stripe Checkout Session on the fly.

**Full setup instructions are in [SERVERLESS_SETUP.md](SERVERLESS_SETUP.md).**
Short version: deploy `cloudflare-worker/create-checkout-session.js` to
Cloudflare Workers, set your Stripe secret key as a Worker secret, and point
`order.js` at the deployed Worker URL. Start with a Stripe **test** key,
verify the whole flow, then switch to your **live** key when ready.

Pricing lives in two places that must be kept in sync:
- **`pricing.json`** (repo root) — what the page *displays* to the customer
- **`cloudflare-worker/create-checkout-session.js`** — what actually gets
  *charged*. This is the only source of truth Stripe trusts; the page's
  displayed price is never sent to Stripe as-is, it's always recalculated
  server-side from this file.

Current pricing:
- Variety Pack / Custom Combo: **$6/box** one-time, **$5.10/box** subscription
- Single Variety Bulk (8oz): **$13.25/pkg** shoots, **$21.50/pkg** micros one-time; **$11.26** / **$18.28** subscription
- Subscription discount: **15% off** one-time price, everywhere
- **Delivery fee:** a flat **$5** is added whenever the order subtotal is under **$20** — applies to subscriptions every billing cycle, not just the first. This is enforced server-side in the Worker and shown on the Order page before checkout, so the two always match.

### Not set up yet (flagged, not decided)
- **Per-product links on the homepage** — the 5 "Add to Order" buttons in the Products section are still placeholders; the dynamic Order page is the main path for now.
- **Sales tax (Stripe Tax)** — Michigan's tax treatment of perishable food sales should be confirmed with an accountant before turning this on.
- **Delivery-area restriction** — Stripe Checkout collects an address but nothing currently blocks orders from outside the Ann Arbor delivery area. Treat this as a manual check for now (review delivery addresses after an order comes in) — could be added as validation in the Worker later.
- **Stripe Customer Portal** — lets subscribers cancel or update payment themselves without emailing you. Worth enabling once the base flow is live and working (Dashboard → Settings → Billing → Customer portal).

---

## 2. Set Up Formspree (Contact Form)

The contact form on `index.html` already points at a live Formspree form ID. If you ever need a new one:

1. Go to [formspree.io](https://formspree.io) and create a free account.
2. Click **New Form**, give it a name (e.g. "Fourth Soil Farm Contact").
3. Copy the form ID from the URL — it looks like `xpzgabcd`.
4. In `index.html`, find:
   ```
   action="https://formspree.io/f/YOUR_FORMSPREE_ID"
   ```
   Replace `YOUR_FORMSPREE_ID` with your actual ID.
5. Formspree will forward all submissions to the email you registered with.

---

## 3. Add Your Photos

Photos go in the `images/` folder. Current filenames the site expects:

```
images/hero-mason-jar.jpg      Hero background photo (full-bleed, behind the text card)
images/karl-and-jeanne.jpg     About section + closing sign-off photo
images/comparison-sprouts.jpg  Sprouts vs. microgreens vs. mature greens comparison
images/grow-room.jpg           Background photo on the first CTA banner

images/broccoli.jpg
images/zippy.jpg
images/crunchy.jpg
images/sunflower.jpg
images/pea.jpg                 Five featured product photos

images/food-salad.jpg
images/food-sandwich.jpg
images/food-eggs.jpg           "Add them to virtually every meal" photos
```

Every image tag already has a graceful fallback (a colored placeholder or the image simply not rendering) if the file is missing, so the site works fine before photos are added — just drop a correctly-named file into `images/` and it picks it up automatically. No HTML/CSS edits needed to swap a photo, as long as the filename matches exactly.

---

## 4. Push to GitHub

```bash
# One-time setup
git init
git add .
git commit -m "Initial site"
git branch -M main

# Create a new repo at github.com (name it anything, e.g. fourthsoil-farm)
# Then connect and push:
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/fourthsoil-farm.git
git push -u origin main
```

---

## 5. Enable GitHub Pages

1. Go to your repo on GitHub.
2. Click **Settings** → **Pages** (left sidebar).
3. Under **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: `main` / `/ (root)`
4. Click **Save**.
5. GitHub will show you a URL like `https://yourusername.github.io/fourthsoil-farm` — the site is live there within a minute or two.

---

## 6. Point Your Domain to GitHub Pages

Do this at your domain registrar (wherever you bought `fourthsoil.farm`).

### Step A — Add DNS records

Add these four **A records** pointing to GitHub's IP addresses:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

Add a **CNAME record** for the `www` subdomain:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `YOUR_GITHUB_USERNAME.github.io` |

DNS changes can take up to 24 hours to propagate, but usually happen within 30 minutes.

### Step B — Configure custom domain in GitHub Pages

1. Go to **Settings → Pages** in your GitHub repo.
2. Under **Custom domain**, type `fourthsoil.farm` and click **Save**.
3. Check **Enforce HTTPS** once the checkbox becomes available (may take a few minutes after DNS propagates).

The `CNAME` file already in this repo handles the GitHub side automatically.

---

## File Structure

```
fourthsoil-farm/
├── index.html               ← Homepage (hero, about, education, products, contact)
├── order.html               ← Order page (dynamic Variety Pack / Custom Combo / Bulk form)
├── order.js                 ← Order page interactivity + Worker submission
├── pricing.json              ← Prices shown on the Order page (display copy — see note above)
├── privacy-policy.html      ← Privacy Policy
├── terms.html                ← Terms and Conditions
├── styles.css                ← All styles, fully responsive
├── main.js                    ← Mobile nav, form handling, smooth scroll
├── cloudflare-worker/         ← Serverless function that creates Stripe Checkout Sessions
│   ├── create-checkout-session.js
│   └── wrangler.toml
├── SERVERLESS_SETUP.md        ← Cloudflare Worker deployment instructions
├── CNAME                      ← Custom domain for GitHub Pages
├── images/                     ← Site photos (see section 3 above for filenames)
└── README.md                   ← This file
```

---

## Making Edits

- **Content** — edit the relevant `.html` file directly; sections are clearly commented.
- **Colors / fonts** — top of `styles.css` has a comment block with the full palette.
- **Order page pricing** — edit `pricing.json` (display) AND `cloudflare-worker/create-checkout-session.js` (what's actually charged) — see the Checkout Setup section above.
- **Per-product Stripe links** — search for `YOUR_STRIPE` and replace in-place (deferred, optional).
- **Prices** — search for `YOUR_PRICE_HERE` (individual product prices, currently unused).

---

## Contact

Karl & Jeanne Thuemmel — [info@fourthsoil.farm](mailto:info@fourthsoil.farm) — (734) 547-6557
