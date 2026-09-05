const ALLOWED_ORIGINS = new Set([
  'https://pilotconsciousness.com',
  'https://www.pilotconsciousness.com',
  'http://localhost:8787'
]);

const PRODUCTS = {
  intro: { name: 'Introductory Flight Lesson', amount: 29900, maxParty: 1 },
  tour: { name: 'Phoenix Aerial Experience', amount: 39900, maxParty: 2 }
};

const STRIPE_VERSION = '2026-03-25.dahlia';
const BUILD_ID = 'stripe-worker-diagnostics-2026-09-05-1';

function cors(origin) {
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : 'https://pilotconsciousness.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Stripe-Signature',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(origin) }
  });
}

function add(params, key, value) {
  if (value !== undefined && value !== null && String(value).length) params.set(key, String(value));
}

function validateBooking(body) {
  const product = PRODUCTS[body.experience];
  if (!product) throw new Error('Unknown flight experience.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) throw new Error('A valid departure date is required.');
  if (!body.timeWindow || !body.airport) throw new Error('Departure window and airport preference are required.');
  const partySize = Number(body.partySize);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > product.maxParty) throw new Error('Invalid party size.');
  if (!Array.isArray(body.passengers) || body.passengers.length !== partySize) throw new Error('Passenger manifest does not match party size.');
  body.passengers.forEach((name) => {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (clean.length < 3 || !clean.includes(' ')) throw new Error('Each passenger must have a full boarding name.');
  });
  const c = body.contact || {};
  for (const key of ['name','email','phone','address1','city','state','postal','country']) {
    if (!String(c[key] || '').trim()) throw new Error('Reservation contact information is incomplete.');
  }
  return product;
}

async function createCheckoutSession(request, env, origin) {
  const body = await request.json();
  let product;
  try { product = validateBooking(body); }
  catch (error) { return json({ error: error.message }, 400, origin); }

  if (!env.STRIPE_SECRET_KEY) {
    return json({
      error: 'Stripe secret key is not configured on the Worker.',
      build: BUILD_ID,
      hasStripeSecret: false
    }, 500, origin);
  }

  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('ui_mode', 'elements');
  p.set('return_url', 'https://pilotconsciousness.com/booking.html?session_id={CHECKOUT_SESSION_ID}');
  p.set('customer_email', body.contact.email);
  p.set('billing_address_collection', 'required');
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', 'usd');
  p.set('line_items[0][price_data][unit_amount]', String(product.amount));
  p.set('line_items[0][price_data][product_data][name]', product.name);
  p.set('line_items[0][price_data][product_data][description]', body.experience === 'tour' ? 'Private Phoenix aerial experience' : 'Private introductory flight lesson');

  add(p, 'metadata[experience]', body.experience);
  add(p, 'metadata[requested_date]', body.date);
  add(p, 'metadata[time_window]', body.timeWindow);
  add(p, 'metadata[airport]', body.airport);
  add(p, 'metadata[party_size]', body.partySize);
  add(p, 'metadata[passengers]', body.passengers.join(' | '));
  add(p, 'metadata[contact_name]', body.contact.name);
  add(p, 'metadata[contact_phone]', body.contact.phone);
  add(p, 'metadata[address1]', body.contact.address1);
  add(p, 'metadata[address2]', body.contact.address2 || '');
  add(p, 'metadata[city]', body.contact.city);
  add(p, 'metadata[state]', body.contact.state);
  add(p, 'metadata[postal]', body.contact.postal);
  add(p, 'metadata[notes]', String(body.notes || '').slice(0, 450));

  const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': STRIPE_VERSION,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: p
  });
  const data = await stripe.json();
  if (!stripe.ok) return json({ error: data?.error?.message || 'Stripe could not create the checkout.', build: BUILD_ID }, 502, origin);
  return json({ client_secret: data.client_secret, session_id: data.id, build: BUILD_ID }, 200, origin);
}

async function retrieveSession(url, env, origin) {
  const id = new URL(url).searchParams.get('session_id');
  if (!id || !/^cs_/.test(id)) return json({ error: 'Invalid session.' }, 400, origin);
  if (!env.STRIPE_SECRET_KEY) return json({ error: 'Stripe secret key is not configured on the Worker.', build: BUILD_ID, hasStripeSecret: false }, 500, origin);
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': STRIPE_VERSION
    }
  });
  const data = await r.json();
  if (!r.ok) return json({ error: data?.error?.message || 'Unable to retrieve session.' }, 502, origin);
  return json({
    id: data.id,
    payment_status: data.payment_status,
    status: data.status,
    amount_total: data.amount_total,
    metadata: data.metadata || {},
    build: BUILD_ID
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

    if (url.pathname === '/config' && request.method === 'GET') {
      return json({ publishableKey: env.STRIPE_PUBLISHABLE_KEY, build: BUILD_ID }, 200, origin);
    }
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        build: BUILD_ID,
        hasStripePublishableKey: Boolean(env.STRIPE_PUBLISHABLE_KEY),
        hasStripeSecret: Boolean(env.STRIPE_SECRET_KEY)
      }, 200, origin);
    }
    if (url.pathname === '/create-checkout-session' && request.method === 'POST') {
      return createCheckoutSession(request, env, origin);
    }
    if (url.pathname === '/session' && request.method === 'GET') {
      return retrieveSession(request.url, env, origin);
    }
    return json({ error: 'Not found.', build: BUILD_ID }, 404, origin);
  }
};
