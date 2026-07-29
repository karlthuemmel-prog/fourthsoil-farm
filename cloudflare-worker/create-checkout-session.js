/**
 * Fourth Soil Farm — Stripe Checkout Session creator (Cloudflare Worker)
 *
 * The ONLY job of this function: take the customer's order selection from
 * order.html, recompute the price from scratch server-side (never trust a
 * price sent by the browser), and ask Stripe to create a Checkout Session.
 *
 * Deploy this separately from the GitHub Pages site — see SERVERLESS_SETUP.md
 * in the repo root for step-by-step instructions.
 *
 * Required Worker secret (set with `wrangler secret put STRIPE_SECRET_KEY`):
 *   STRIPE_SECRET_KEY   — sk_test_... while testing, sk_live_... when live
 *
 * Optional Worker variable (set in wrangler.toml [vars]):
 *   SITE_URL            — e.g. https://fourthsoil.farm (defaults below if unset)
 *   ALLOWED_ORIGIN       — e.g. https://fourthsoil.farm (defaults below if unset)
 */

// ---- Pricing table -------------------------------------------------------
// MUST stay in sync with /pricing.json at the repo root. That file is the
// client-side display copy; THIS copy is the one that actually decides what
// gets charged. If you change a price, change it in both places.

const BOX_PRICE = { oneTime: 6.00, subscription: 5.10 };

const VARIETY_PACK = {
  boxCount: 4,
  label: 'Variety Pack (Broccoli, Sunflower Shoots, Pea Shoots, Crunchy Mix)',
};

const CUSTOM_COMBO_VARIETIES = {
  'broccoli': 'Broccoli',
  'zippy-mix': 'Zippy Mix',
  'crunchy-mix': 'Crunchy Mix',
  'sunflower-shoots': 'Sunflower Shoots',
  'pea-shoots': 'Pea Shoots',
  'rainbow-radish-mix': 'Rainbow Radish Mix',
  'tendril-pea': 'Tendril Pea',
  'red-cabbage': 'Red Cabbage',
  'spicy-asian-mustard': 'Spicy Asian Mustard',
  'cilantro': 'Cilantro',
  'red-garnet-amaranth': 'Red Garnet Amaranth',
  'immunoboost-blend': 'Immunoboost Blend',
};

const BULK_PRICE = {
  shoots: { oneTime: 13.25, subscription: 11.26 },
  micros: { oneTime: 21.50, subscription: 18.28 },
};

const BULK_VARIETIES = {
  'pea-shoots': { label: 'Pea Shoots', category: 'shoots' },
  'sunflower-shoots': { label: 'Sunflower Shoots', category: 'shoots' },
  'broccoli': { label: 'Broccoli', category: 'micros' },
  'tendril-pea': { label: 'Tendril Pea', category: 'micros' },
  'red-cabbage': { label: 'Red Cabbage', category: 'micros' },
  'spicy-asian-mustard': { label: 'Spicy Asian Mustard', category: 'micros' },
};

const DELIVERY = { freeThreshold: 20.00, fee: 5.00 };

// ---- Helpers ---------------------------------------------------------

function corsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || 'https://fourthsoil.farm';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

function toCents(dollars) {
  return Math.round(dollars * 100);
}

// Flattens a nested object into Stripe's bracket-notation
// application/x-www-form-urlencoded format, e.g.
// { line_items: [{ price_data: { currency: 'usd' } }] }
// -> "line_items[0][price_data][currency]=usd"
function toFormBody(obj, prefix = '') {
  const pairs = [];
  for (const key in obj) {
    const value = obj[key];
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === 'object') {
          pairs.push(toFormBody(item, `${paramKey}[${i}]`));
        } else {
          pairs.push(`${encodeURIComponent(`${paramKey}[${i}]`)}=${encodeURIComponent(item)}`);
        }
      });
    } else if (typeof value === 'object') {
      pairs.push(toFormBody(value, paramKey));
    } else {
      pairs.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(value)}`);
    }
  }
  return pairs.filter(Boolean).join('&');
}

function cadenceToInterval(cadence) {
  if (cadence === 'biweekly') return { interval: 'week', interval_count: 2 };
  return { interval: 'week', interval_count: 1 }; // default: weekly
}

// ---- Order validation + pricing (authoritative) -----------------------

class OrderError extends Error {}

function buildLineItems(order) {
  const { planType, items, subscribe, cadence } = order;
  const recurring = subscribe ? cadenceToInterval(cadence) : null;

  if (planType === 'variety-pack') {
    const unitPrice = subscribe ? BOX_PRICE.subscription : BOX_PRICE.oneTime;
    const priceData = {
      currency: 'usd',
      unit_amount: toCents(unitPrice),
      product_data: { name: VARIETY_PACK.label },
    };
    if (recurring) priceData.recurring = recurring;
    return [{ price_data: priceData, quantity: VARIETY_PACK.boxCount }];
  }

  if (planType === 'custom-combo') {
    if (!Array.isArray(items) || items.length === 0) {
      throw new OrderError('Custom Combo requires at least one variety.');
    }
    const unitPrice = subscribe ? BOX_PRICE.subscription : BOX_PRICE.oneTime;
    return items.map(({ variety, qty }) => {
      const label = CUSTOM_COMBO_VARIETIES[variety];
      if (!label) throw new OrderError(`Unknown variety: ${variety}`);
      const quantity = Number.parseInt(qty, 10);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new OrderError(`Invalid quantity for ${label}.`);
      }
      const priceData = {
        currency: 'usd',
        unit_amount: toCents(unitPrice),
        product_data: { name: `${label} (box)` },
      };
      if (recurring) priceData.recurring = recurring;
      return { price_data: priceData, quantity };
    });
  }

  if (planType === 'single-bulk') {
    if (!Array.isArray(items) || items.length !== 1) {
      throw new OrderError('Single Variety Bulk requires exactly one variety.');
    }
    const { variety, qty } = items[0];
    const bulkVariety = BULK_VARIETIES[variety];
    if (!bulkVariety) {
      throw new OrderError(`${variety} is not available as a bulk order.`);
    }
    const quantity = Number.parseInt(qty, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new OrderError('Invalid bulk package quantity.');
    }
    const priceTier = BULK_PRICE[bulkVariety.category];
    const unitPrice = subscribe ? priceTier.subscription : priceTier.oneTime;
    const priceData = {
      currency: 'usd',
      unit_amount: toCents(unitPrice),
      product_data: { name: `${bulkVariety.label} (8oz bulk)` },
    };
    if (recurring) priceData.recurring = recurring;
    return [{ price_data: priceData, quantity }];
  }

  throw new OrderError(`Unknown plan type: ${planType}`);
}

// Adds a $5 Delivery Fee line item when the order subtotal is under $20.
// For subscriptions, the fee recurs on the same interval as the order, so a
// small recurring order is charged the fee every cycle, not just the first.
function addDeliveryFeeIfNeeded(lineItems, recurring) {
  const subtotalCents = lineItems.reduce(
    (sum, item) => sum + item.price_data.unit_amount * item.quantity,
    0
  );

  if (subtotalCents >= toCents(DELIVERY.freeThreshold)) {
    return lineItems;
  }

  const priceData = {
    currency: 'usd',
    unit_amount: toCents(DELIVERY.fee),
    product_data: { name: 'Delivery Fee' },
  };
  if (recurring) priceData.recurring = recurring;

  return [...lineItems, { price_data: priceData, quantity: 1 }];
}

// ---- Worker entry point -----------------------------------------------

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, env);
    }

    let order;
    try {
      order = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, env);
    }

    let lineItems;
    try {
      lineItems = buildLineItems(order);
      const recurring = order.subscribe ? cadenceToInterval(order.cadence) : null;
      lineItems = addDeliveryFeeIfNeeded(lineItems, recurring);
    } catch (err) {
      if (err instanceof OrderError) {
        return jsonResponse({ error: err.message }, 400, env);
      }
      throw err;
    }

    const siteUrl = env.SITE_URL || 'https://fourthsoil.farm';
    const sessionParams = {
      mode: order.subscribe ? 'subscription' : 'payment',
      line_items: lineItems,
      success_url: `${siteUrl}/success.html`,
      cancel_url: `${siteUrl}/order.html?canceled=true`,
    };

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: toFormBody(sessionParams),
    });

    const stripeResult = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return jsonResponse(
        { error: stripeResult.error?.message || 'Stripe checkout session creation failed' },
        502,
        env
      );
    }

    return jsonResponse({ url: stripeResult.url }, 200, env);
  },
};
