// Generated from shared/. Run npm run generate.
'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const { events } = require('./catalog.cjs');
const { ORIGIN, headers, segment, required, parseResponse, IntegrationError } = require('./core.cjs');
function identity(auth, group, subscriptionKey) {
  if (!events[group]) throw new IntegrationError('invalid_event_group');
  required(subscriptionKey, 'subscription_key');
  if (subscriptionKey.length > 200) throw new IntegrationError('invalid_subscription_key');
  const scope = JSON.stringify(['polymorfa-webhook-v1', segment(auth.projectId, 'project_id'), group, subscriptionKey]);
  const derive = label => createHmac('sha256', required(auth.apiKey, 'project_token')).update(`${label}:${scope}`).digest('hex');
  return { name: `X-Polymorfa-Integration-Token-${derive('marker').slice(0, 24)}`, value: derive('receiver'), key: derive('create') };
}
function callback(url) {
  let u; try { u = new URL(url); } catch { throw new IntegrationError('invalid_callback'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw new IntegrationError('invalid_callback');
  return u.href;
}
function sameCallback(a, b) {
  try { return callback(a) === callback(b); } catch { return false; }
}
function creationKey(markerKey, registrationKey) {
  required(registrationKey, 'registration_key');
  if (registrationKey.length > 200) throw new IntegrationError('invalid_registration_key');
  return 'integration-create-' + createHmac('sha256', markerKey).update(registrationKey).digest('hex');
}
function owns(hook, auth, url, group, subscriptionKey, recordedMarker) {
  const marker = (recordedMarker || identity(auth, group, subscriptionKey).name).toLowerCase();
  const types = events[group].types;
  return hook && hook.owner === 'project' && hook.projectId === auth.projectId && sameCallback(hook.url, url) && hook.format === 'native' && hook.enabled === true &&
    Array.isArray(hook.headers) && hook.headers.some(h => h.name.toLowerCase() === marker) && Array.isArray(hook.eventTypes) &&
    hook.eventTypes.length === types.length && types.every(t => hook.eventTypes.includes(t));
}
async function call(auth, transport, provider, method, path, body, key, query) {
  let response;
  try { response = await transport({ method, url: ORIGIN + path, headers: { ...headers(auth, provider), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(body ? { body } : {}), ...(query ? { query } : {}) }); }
  catch { throw new IntegrationError(method === 'GET' ? 'network_error' : 'subscription_outcome_unknown'); }
  return parseResponse(response);
}
async function find(auth, url, group, subscriptionKey, transport, provider) {
  let cursor; const seen = new Set(); const matches = [];
  for (let i = 0; i < 100; i++) {
    const r = await call(auth, transport, provider, 'GET', `/platform/projects/${segment(auth.projectId, 'project_id')}/webhooks`, undefined, undefined, { limit: 100, ...(cursor ? { cursor } : {}) });
    if (!Array.isArray(r.data)) throw new IntegrationError('invalid_subscription_response');
    const marker = identity(auth, group, subscriptionKey).name.toLowerCase();
    if (r.data.some(h => !sameCallback(h.url, url) && h.headers?.some(v => v.name.toLowerCase() === marker))) throw new IntegrationError('subscription_key_already_in_use');
    for (const hook of r.data) {
      const marked = hook.headers?.some(v => v.name.toLowerCase() === marker);
      if ((marked || sameCallback(hook.url, url)) && !owns(hook, auth, url, group, subscriptionKey)) throw new IntegrationError('subscription_changed_requires_reconciliation');
      if (owns(hook, auth, url, group, subscriptionKey)) matches.push(hook);
    }
    if (!r.page?.hasMore) {
      if (matches.length > 1) throw new IntegrationError('duplicate_owned_subscriptions');
      return matches[0];
    }
    if (typeof r.page.nextCursor !== 'string' || seen.has(r.page.nextCursor)) throw new IntegrationError('invalid_subscription_pagination');
    cursor = r.page.nextCursor; seen.add(cursor);
  }
  throw new IntegrationError('subscription_inventory_requires_reconciliation');
}
async function subscribe(auth, url, group, subscriptionKey, transport, provider, registrationKey) {
  url = callback(url);
  const marker = identity(auth, group, subscriptionKey);
  const createKey = creationKey(marker.key, registrationKey);
  const record = hook => ({ id: hook.id, url, group, subscriptionKey, markerName: marker.name });
  const existing = await find(auth, url, group, subscriptionKey, transport, provider);
  if (existing) return record(existing);
  // Only the owned ID leaves this helper. The API's one-time signing secret is never emitted.
  try {
    // Saved trigger configuration owns this generation across uncertain retries.
    const r = await call(auth, transport, provider, 'POST', `/platform/projects/${segment(auth.projectId, 'project_id')}/webhooks`, { url, eventTypes: events[group].types, format: 'native', enabled: true, headers: [{ name: marker.name, value: marker.value }] }, createKey);
    if (!owns(r.data?.webhook, auth, url, group, subscriptionKey)) throw new IntegrationError('invalid_subscription_receipt');
    // An idempotency receipt may outlive its deleted webhook. Verify live ownership.
    const live = await find(auth, url, group, subscriptionKey, transport, provider);
    if (!live || live.id !== r.data.webhook.id) throw new IntegrationError('subscription_receipt_requires_reconciliation');
    return record(live);
  } catch (error) {
    if (error instanceof IntegrationError && error.status >= 400 && error.status < 500) throw error;
    // A lost response may follow a successful create. Reconcile; never blindly create again.
    const recovered = await find(auth, url, group, subscriptionKey, transport, provider);
    if (recovered) return record(recovered);
    throw new IntegrationError('subscription_requires_reconciliation');
  }
}
async function unsubscribe(auth, id, url, group, subscriptionKey, transport, provider, recordedMarker) {
  const path = `/platform/projects/${segment(auth.projectId, 'project_id')}/webhooks/${segment(id, 'webhook_id')}`;
  let hook;
  try { hook = (await call(auth, transport, provider, 'GET', path)).data; }
  catch (error) { if (error.status === 404) return; throw error; }
  // Disabled hooks remain owned and may be deleted; all other ownership checks still apply.
  if (!owns({ ...hook, enabled: true }, auth, url, group, subscriptionKey, recordedMarker)) throw new IntegrationError('subscription_ownership_mismatch');
  await call(auth, transport, provider, 'DELETE', path, undefined, `integration-delete-${id}`);
}
function authenticate(auth, group, subscriptionKey, incomingHeaders) {
  const expected = identity(auth, group, subscriptionKey);
  const entries = Object.entries(incomingHeaders || {}).filter(([k]) => k.toLowerCase() === expected.name.toLowerCase());
  if (entries.length !== 1 || typeof entries[0][1] !== 'string' || !/^[a-f0-9]{64}$/.test(entries[0][1])) return false;
  return timingSafeEqual(Buffer.from(entries[0][1]), Buffer.from(expected.value));
}
function envelope(body, group) {
  if (!events[group] || !body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || !body.id || typeof body.session !== 'string' || !body.session || typeof body.timestamp !== 'string' || !Number.isFinite(Date.parse(body.timestamp)) || !events[group].types.includes(body.event) || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) throw new IntegrationError('invalid_event');
  // Copy the defined envelope only. Never export arbitrary top-level transport fields.
  return { id: body.id, session: body.session, ...(typeof body.externalId === 'string' ? { externalId: body.externalId } : {}), timestamp: body.timestamp, event: body.event, payload: body.payload };
}
module.exports = { identity, callback, sameCallback, creationKey, owns, find, subscribe, unsubscribe, authenticate, envelope };
