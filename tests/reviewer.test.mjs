import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { ALERT_URL, AlertSource, fetchCompleteAlerts } from '../src/alerts.mjs';
import { JourneyStore } from '../src/store.mjs';
import { createNetwork, evaluatePath } from '../src/engine.mjs';
import { LiftCheckService } from '../src/service.mjs';
import { start } from '../server.mjs';

// Reviewer-owned cases. Fixtures are invented; they are not live MBTA evidence.
const instant = '2026-09-26T16:00:00.000Z';
const clock = () => new Date(instant);
const record = id => ({
  id, type: 'alert', attributes: {
    effect: 'ELEVATOR_CLOSURE', header: `Invented elevator alert ${id}`,
    description: 'Reviewer fixture only.',
    informed_entity: [{ facility: '717', stop: 'place-astao' }],
    active_period: [{ start: '2026-09-26T15:00:00Z', end: null }],
    updated_at: '2026-09-01T00:00:00Z',
  },
});
const page = (data, next = null, last = null) => ({data, links: {next, last}});
const response = (body, extra = {}) => ({
  ok: true, status: 200, url: ALERT_URL,
  text: async () => JSON.stringify(body), ...extra,
});

test('review: every page is included and old alert updated_at does not age a fresh fetch', async () => {
  const next = `${ALERT_URL}&page%5Boffset%5D=1000`;
  const requested = [];
  const snapshot = await fetchCompleteAlerts(async url => {
    requested.push(String(url));
    return response(requested.length === 1 ? page([record('a')], next, next) : page([record('b')], null, next));
  }, clock);
  assert.equal(requested.length, 2);
  assert.deepEqual(snapshot.alerts.map(a => a.id), ['a', 'b']);
  assert.equal(snapshot.fetchedAt, instant);
  assert.equal(snapshot.complete, true);
});

test('review: pagination cannot silently narrow alert coverage to one stop', async () => {
  let calls = 0;
  const narrowed = `${ALERT_URL}&page%5Boffset%5D=1000&filter%5Bstop%5D=place-other`;
  await assert.rejects(fetchCompleteAlerts(async () => {
    calls++;
    return response(calls === 1 ? page([record('a')], narrowed, narrowed) : page([]));
  }, clock));
});

test('review: a malformed links object cannot certify the end of pagination', async () => {
  await assert.rejects(fetchCompleteAlerts(async () => response({data: [], links: {}}), clock));
});

test('review: malformed end markers cannot certify completeness', async () => {
  for (const malformed of [false, 0, '']) {
    await assert.rejects(fetchCompleteAlerts(async () => response({data: [], links: {last: malformed}}), clock),
      `accepted last=${JSON.stringify(malformed)} as an explicit end marker`);
  }
});

test('review: skipped page offsets cannot certify completeness', async () => {
  const skipped = `${ALERT_URL}&page%5Boffset%5D=2000`;
  let calls = 0;
  await assert.rejects(fetchCompleteAlerts(async () => {
    calls++;
    return response(calls === 1 ? page([record('a')], skipped, skipped) : page([record('c')], null, skipped));
  }, clock), 'accepted a second page starting at 2000 despite page limit 1000');
});

test('review: cross-origin pagination is rejected before following the link', async () => {
  let calls = 0;
  await assert.rejects(fetchCompleteAlerts(async () => {
    calls++;
    return response(page([], 'https://example.invalid/alerts?filter%5Bactivity%5D=ALL'));
  }, clock));
  assert.equal(calls, 1);
});

test('review: overlapping pages cannot become a complete mixed snapshot', async () => {
  const next = `${ALERT_URL}&page%5Boffset%5D=1000`;
  let calls = 0;
  await assert.rejects(fetchCompleteAlerts(async () => {
    calls++;
    return response(calls === 1 ? page([record('a')], next, next) : page([record('a')], null, next));
  }, clock));
});

test('review: cached data from a failed refresh remains incomplete at and after expiry', async () => {
  let now = new Date(instant);
  let calls = 0;
  const source = new AlertSource({clock: () => now, fetchImpl: async () => {
    calls++;
    if (calls > 1) throw new Error('Fixture network failure');
    return response(page([record('a')]));
  }});
  assert.equal((await source.snapshot()).complete, true);
  now = new Date(Date.parse(instant) + 59_999);
  assert.equal((await source.snapshot()).complete, true);
  assert.equal(calls, 1);
  now = new Date(Date.parse(instant) + 60_000);
  const expired = await source.snapshot();
  assert.equal(expired.complete, false);
  assert.equal(expired.fetchedAt, instant);
  assert.equal(expired.alerts.length, 1);
  assert.match(expired.error, /cannot support/);
});

test('review: one failed later page cannot leak a partial new snapshot as complete', async () => {
  let calls = 0;
  const next = `${ALERT_URL}&page%5Boffset%5D=1000`;
  const source = new AlertSource({clock, fetchImpl: async () => {
    calls++;
    return calls === 1 ? response(page([record('a')], next, next)) : response({}, {ok: false, status: 503});
  }});
  const result = await source.snapshot();
  assert.equal(result.complete, false);
  assert.deepEqual(result.alerts, []);
  assert.equal(result.fetchedAt, null);
});

test('review: caller mutation cannot change a saved journey without a revision', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'liftcheck-review-'));
  const store = new JourneyStore(directory);
  try {
    const legs = [{stationId: 'place-astao', fromId: 'entry-a', toId: 'platform-1'}];
    const saved = store.save({name: 'Fixture journey', legs, expectedRevision: 0});
    legs[0].toId = 'platform-other';
    legs.push({stationId: 'unexpected'});
    const memory = store.read();
    const persisted = JSON.parse(readFileSync(path.join(directory, 'journeys.json'), 'utf8'));
    assert.deepEqual(memory, persisted, 'saved state changed in memory but not on disk');
    assert.deepEqual(memory, saved, 'input references escaped the versioned store boundary');
    assert.throws(() => store.save({name: 'stale write', legs: [], expectedRevision: 0}), /changed/);
    const returned = store.read();
    returned.journeys[0].legs[0].toId = 'also-unexpected';
    assert.deepEqual(store.read(), saved, 'read returned a mutable reference to saved state');
  } finally {
    store.close();
    rmSync(directory, {recursive: true, force: true});
  }
});

function fixtureGraph() {
  const stationId = 'review-station';
  const node = (id, kind, directionId = 0) => ({id, kind, name: id, stationId, wheelchairBoarding: 1,
    ...(kind === 'platform' ? {boardings: [{routeId: 'Review-Line', routeType: 1, directionId}]} : {})});
  return {
    schemaVersion: 1,
    source: {feedStartDate: '20260901', feedEndDate: '20261031', feedVersion: 'Invented reviewer graph'},
    stations: [{id: stationId, name: 'Reviewer station', entranceIds: ['entry-a', 'entry-b'], platformIds: ['platform-0', 'platform-1'], routeIds: ['Review-Line']}],
    nodes: [node(stationId, 'station'), node('entry-a', 'entrance'), node('entry-b', 'entrance'),
      node('middle-b', 'generic'), node('platform-0', 'platform', 0), node('platform-1', 'platform', 1)],
    edges: [
      {id: 'a-0', stationId, from: 'entry-a', to: 'platform-0', mode: 5, facilityId: 'lift-a', bidirectional: false},
      {id: 'b-1', stationId, from: 'entry-b', to: 'middle-b', mode: 5, facilityId: 'lift-b1', bidirectional: false},
      {id: 'b-2', stationId, from: 'middle-b', to: 'platform-0', mode: 5, facilityId: 'lift-b2', bidirectional: false},
    ],
    facilities: ['lift-a', 'lift-b1', 'lift-b2'].map(id => ({id, stationId, type: 'ELEVATOR', name: id})),
  };
}
const leg = {stationId: 'review-station', fromId: 'entry-a', toId: 'platform-0'};
const snapshot = (alerts = [], extra = {}) => ({alerts, complete: true, fetchedAt: instant, now: instant, sourceMode: 'live', ...extra});
const fixtureAlert = (id, entity, extra = {}) => ({...record(id), attributes: {...record(id).attributes,
  informed_entity: [entity], ...extra}});

test('review: directed paths stay directed, and every alternate elevator is checked', () => {
  const network = createNetwork(fixtureGraph());
  assert.equal(evaluatePath(network, leg, snapshot()).status, 'no_reported_closure');
  const one = fixtureAlert('close-a', {facility: 'lift-a', stop: 'review-station'});
  const alternative = evaluatePath(network, leg, snapshot([one]));
  assert.equal(alternative.status, 'alternate_entrance');
  assert.equal(alternative.path, null, 'an alternate must not be reported as the originally requested path');
  assert.deepEqual(alternative.alternatives[0].path.facilities.map(f => f.id), ['lift-b1', 'lift-b2']);
  const two = fixtureAlert('close-b2', {facility: 'lift-b2', stop: 'review-station'});
  const blocked = evaluatePath(network, leg, snapshot([one, two]));
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.alternatives, []);
  assert.equal(evaluatePath(network, {...leg, fromId: leg.toId, toId: leg.fromId}, snapshot()).status, 'unknown',
    'an ingress-only edge must not imply a station exit path');
  assert.equal(evaluatePath(network, {...leg, toId: 'platform-1'}, snapshot()).status, 'unknown',
    'a path to one platform must not establish the opposite platform');
});

test('review: planned closure activates on its start and stops exactly at its end', () => {
  const network = createNetwork(fixtureGraph());
  const closure = fixtureAlert('planned', {facility: 'lift-a', stop: 'review-station'}, {
    active_period: [{start: '2026-09-26T16:01:00Z', end: '2026-09-26T16:02:00Z'}],
  });
  assert.equal(evaluatePath(network, leg, snapshot([closure])).status, 'no_reported_closure');
  assert.equal(evaluatePath(network, leg, snapshot([closure], {now: '2026-09-26T16:01:00Z'})).status, 'alternate_entrance');
  assert.equal(evaluatePath(network, leg, snapshot([closure], {now: '2026-09-26T16:02:00Z'})).status, 'no_reported_closure');
  assert.equal(evaluatePath(network, leg, snapshot([closure], {now: '2026-09-26T16:05:00Z'})).status, 'unknown');
});

test('review: incomplete, stale, future-dated and uncovered-date evidence cannot clear a leg', () => {
  const network = createNetwork(fixtureGraph());
  for (const extra of [{complete: false}, {fetchedAt: null}, {fetchedAt: '2026-09-26T15:55:00Z'},
    {fetchedAt: '2026-09-26T16:00:31Z'}, {now: '2026-11-01T16:00:00Z', fetchedAt: '2026-11-01T16:00:00Z'}]) {
    const result = evaluatePath(network, leg, snapshot([], extra));
    assert.equal(result.status, 'unknown', JSON.stringify(extra));
    assert.equal(result.path, null);
  }
});

test('review: malformed relevant service/activity selectors cannot hide a station closure', () => {
  const network = createNetwork(fixtureGraph());
  for (const selector of [{direction_id: '0'}, {direction_id: 2}, {route_type: '1'}, {route: 42}, {activities: [null]}]) {
    const closure = fixtureAlert('malformed-selector', {stop: 'review-station', ...selector}, {effect: 'STATION_CLOSURE'});
    assert.equal(evaluatePath(network, leg, snapshot([closure])).status, 'unknown',
      `malformed relevant selector was treated as an unrelated alert: ${JSON.stringify(selector)}`);
  }
});

test('review: an opposite direction advisory is not attached to the selected platform', () => {
  const network = createNetwork(fixtureGraph());
  const other = fixtureAlert('opposite', {stop: 'review-station', route: 'Review-Line', direction_id: 1}, {effect: 'NO_SERVICE'});
  const result = evaluatePath(network, leg, snapshot([other]));
  assert.equal(result.status, 'no_reported_closure');
  assert.deepEqual(result.closures, []);
});

test('review: unknown effects and malformed active periods stay unresolved', () => {
  const network = createNetwork(fixtureGraph());
  for (const extra of [{effect: 'NEW_UNKNOWN_ACCESS_EFFECT'}, {active_period: []},
    {active_period: [{start: 'not-a-time', end: null}]},
    {active_period: [{start: '2026-09-31T16:00:00Z', end: null}]},
    {active_period: [{start: '2026-09-26T17:00:00Z', end: '2026-09-26T16:00:00Z'}]}]) {
    const uncertain = fixtureAlert('uncertain', {stop: 'review-station'}, extra);
    assert.equal(evaluatePath(network, leg, snapshot([uncertain])).status, 'unknown', JSON.stringify(extra));
  }
});

test('review: a missing elevator mapping and an escalator-only connection are not a clear path', () => {
  for (const variant of ['missing-facility', 'escalator', 'stairs', 'unknown-mode']) {
    const raw = fixtureGraph();
    raw.stations[0].entranceIds = ['entry-a'];
    if (variant === 'missing-facility') raw.facilities = raw.facilities.filter(f => f.id !== 'lift-a');
    else raw.edges[0].mode = {escalator: 4, stairs: 2, 'unknown-mode': 99}[variant];
    assert.equal(evaluatePath(createNetwork(raw), leg, snapshot()).status, 'unknown', variant);
  }
});

test('review: an elevator edge cannot borrow a different station or escalator facility mapping', () => {
  for (const variant of ['other-station', 'wrong-type']) {
    const raw = fixtureGraph();
    raw.stations[0].entranceIds = ['entry-a'];
    const facility = raw.facilities.find(f => f.id === 'lift-a');
    if (variant === 'other-station') facility.stationId = 'unrelated-station';
    else facility.type = 'ESCALATOR';
    let network;
    try {network = createNetwork(raw);}
    catch (error) {assert.match(error.message, /facility|station|elevator/i); continue;}
    assert.equal(evaluatePath(network, leg, snapshot()).status, 'unknown', variant);
  }
});

test('review: service preserves saved legs, rejects stale writes, and uses one snapshot for a journey', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'liftcheck-review-'));
  const store = new JourneyStore(directory);
  let snapshots = 0;
  const service = new LiftCheckService({network: createNetwork(fixtureGraph()), store,
    source: {snapshot: async () => {snapshots++; return snapshot();}}});
  try {
    const saved = await service.invoke('save_journey', {name: '<img src=x onerror=alert(1)>', legs: [leg, {...leg, fromId: 'entry-b'}], expectedRevision: 0});
    await assert.rejects(service.invoke('save_journey', {name: 'stale', legs: [leg], expectedRevision: 0}), /changed/);
    await assert.rejects(service.invoke('save_journey', {name: 'bad platform', legs: [{...leg, toId: 'outside'}], expectedRevision: 1}), /mapped/);
    assert.equal(store.read().revision, 1);
    const report = await service.invoke('check_journey', {journeyId: saved.journeys[0].id});
    assert.equal(snapshots, 1);
    assert.equal(report.checks.length, 2);
    assert.deepEqual(report.checks.map(c => ({stationId: c.leg.stationId, fromId: c.leg.fromId, toId: c.leg.toId})), saved.journeys[0].legs);
    assert.equal(report.journeyName, '<img src=x onerror=alert(1)>', 'untrusted labels must remain data, not execute or become instructions');
    assert.deepEqual(store.read(), saved, 'checking a journey must not rewrite the chosen path');
  } finally {store.close(); rmSync(directory, {recursive: true, force: true});}
});

test('review: local HTTP boundary rejects foreign origins and keeps malicious labels as JSON data', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'liftcheck-review-'));
  const running = await start({port: 0, directory, network: createNetwork(fixtureGraph()), source: {snapshot: async () => snapshot()}});
  try {
    const foreignOrigin = await fetch(`${running.url}/api/tools/get_saved_journeys`, {
      method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://example.invalid'}, body: '{}',
    });
    assert.equal(foreignOrigin.status, 403);
    // fetch may normalize Host to the URL's authority; send the raw header here.
    const foreignHostStatus = await new Promise((resolve, reject) => {
      const request = httpRequest(`${running.url}/health`, {headers: {Host: 'example.invalid'}}, response => {
        response.resume(); resolve(response.statusCode);
      });
      request.on('error', reject); request.end();
    });
    assert.equal(foreignHostStatus, 403);
    const invalidJson = await fetch(`${running.url}/api/tools/get_saved_journeys`, {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{',
    });
    assert.equal(invalidJson.status, 400);
    const label = '</script><img src=x onerror="globalThis.reviewInjected=true">';
    const saved = await fetch(`${running.url}/api/tools/save_journey`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: label, legs: [leg], expectedRevision: 0}),
    });
    assert.equal(saved.status, 200);
    assert.match(saved.headers.get('content-type'), /application\/json/);
    assert.match(saved.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(saved.headers.get('x-content-type-options'), 'nosniff');
    const result = await saved.json();
    assert.equal(result.journeys[0].name, label);
    assert.equal(result.revision, 1);
  } finally {await running.close(); rmSync(directory, {recursive: true, force: true});}
});
