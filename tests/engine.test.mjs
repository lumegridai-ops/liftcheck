import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNetwork, evaluatePath, stationCatalog, MAX_SNAPSHOT_AGE_MS} from '../src/engine.mjs';

const NOW = '2026-09-26T16:00:00Z';
const raw = JSON.parse(fs.readFileSync(new URL('../data/network.json', import.meta.url)));
const network = createNetwork(raw);
const request = {stationId: 'place-astao', fromId: 'door-astao-foley', toId: '70278'};
const copy = value => structuredClone(value);
const snapshot = (alerts = [], overrides = {}) => ({alerts, now: NOW, fetchedAt: NOW, complete: true, ...overrides});
const closure = (facility = '717', overrides = {}) => ({
  id: 'replay-' + facility, simulation: true,
  attributes: {effect: 'ELEVATOR_CLOSURE', header: 'Simulated outage: elevator ' + facility,
    updated_at: '2026-09-01T00:00:00Z',
    active_period: [{start: '2026-09-26T15:00:00Z', end: null}],
    informed_entity: [{stop: 'place-astao', facility, activities: ['USING_WHEELCHAIR']}], ...overrides},
});
const ids = result => result.path?.facilities.map(facility => facility.id);
const assess = (alerts = [], overrides = {}, req = request, net = network) => evaluatePath(net, req, snapshot(alerts, overrides));

// The expected facility chains below come from the imported agency pathway
// records and official facility alternate-service text, not the engine output.
test('real Assembly baseline has the Foley chain, and a linked directed path', () => {
  const result = assess();
  assert.equal(result.status, 'no_reported_closure');
  assert.deepEqual(ids(result), ['716', '717']);
  assert.equal(result.path.metric, 'fewest mapped edges');
  assert.equal(result.path.nodes[0].id, request.fromId);
  assert.equal(result.path.nodes.at(-1).id, request.toId);
  result.path.edges.forEach((edge, index) => {
    assert.equal(edge.from, result.path.nodes[index].id);
    assert.equal(edge.to, result.path.nodes[index + 1].id);
    assert.ok([1, 5, 6, 7].includes(edge.mode));
    assert.ok(raw.edges.some(original => original.id === edge.id && original.from === edge.from && original.to === edge.to));
  });
});

test('one closure changes entrance and a second closure withdraws the fallback', () => {
  const first = assess([closure('717')]);
  assert.equal(first.status, 'alternate_entrance');
  assert.equal(first.path, null);
  assert.deepEqual(first.alternatives[0].path.facilities.map(facility => facility.id), ['718', '719']);
  assert.equal(first.alternatives[0].entranceId, 'door-astao-revol');
  const both = assess([closure('717'), closure('719')]);
  assert.equal(both.status, 'blocked');
  assert.equal(both.path, null);
  assert.deepEqual(both.alternatives, []);
});

test('closure of an unrelated Assembly elevator does not invalidate Foley', () => {
  const result = assess([closure('719')]);
  assert.equal(result.status, 'no_reported_closure');
  assert.deepEqual(ids(result), ['716', '717']);
});

test('return direction uses actual reverse edges and proposes another exit', () => {
  const result = assess([closure('717')], {}, {...request, fromId: '70278', toId: 'door-astao-foley'});
  assert.equal(result.status, 'alternate_entrance');
  assert.equal(result.alternatives[0].changeType, 'exit');
  assert.equal(result.path, null);
  assert.deepEqual(result.alternatives[0].path.facilities.map(facility => facility.id), ['719', '718']);
});

test('directed graph does not acquire invented reverse edges', () => {
  const modified = copy(raw);
  modified.edges = modified.edges.filter(edge => edge.id !== 'astao-061');
  const result = assess([closure('718')], {}, {...request, fromId: '70278', toId: 'door-astao-foley'}, createNetwork(modified));
  assert.equal(result.status, 'unknown');
  assert.equal(result.path, null);
});

test('source metadata and only supported platforms appear in catalog', () => {
  assert.equal(raw.stations.length, 3);
  assert.equal(raw.edges.length, 454);
  assert.match(raw.source.sha256, /^[a-f0-9]{64}$/);
  const catalog = stationCatalog(network);
  assert.equal(catalog.find(station => station.id === 'place-mlmnl').platforms.length, 2);
  assert.ok(catalog.find(station => station.id === 'place-state').entrances.every(entrance => network.nodesById.get(entrance.id).wheelchairBoarding !== 2));
});

test('stale, future and incomplete snapshots produce no path or alternative', () => {
  const values = [
    {complete: false}, {alerts: null}, {fetchedAt: 'invalid'}, {now: 'invalid'},
    {fetchedAt: new Date(Date.parse(NOW) - MAX_SNAPSHOT_AGE_MS).toISOString()},
    {fetchedAt: '2026-09-26T16:01:00Z'},
    {now: '2026-09-27T16:00:00Z'},
  ];
  for (const value of values) {
    const result = assess([closure('717')], value);
    assert.equal(result.status, 'unknown', JSON.stringify(value));
    assert.equal(result.path, null);
    assert.deepEqual(result.alternatives, []);
  }
});

test('Date and epoch inputs preserve explicit freshness evidence', () => {
  const result = assess([], {now: new Date(NOW), fetchedAt: Date.parse(NOW), sourceUrl: 'https://api-v3.mbta.com/alerts', responseHash: 'test-hash'});
  assert.equal(result.status, 'no_reported_closure');
  assert.equal(result.evidence.validUntil, '2026-09-26T16:05:00.000Z');
  assert.equal(result.evidence.maxAgeMs, 300000);
  assert.equal(result.evidence.responseHash, 'test-hash');
});

test('future and ended alerts are not current closures; open-ended and start-inclusive ones are', () => {
  const cases = [
    [[{start: '2026-09-26T16:00:01Z', end: null}], 'no_reported_closure'],
    [[{start: '2026-09-25T16:00:00Z', end: NOW}], 'no_reported_closure'],
    [[{start: NOW, end: null}], 'alternate_entrance'],
    [[{start: '2026-09-01T00:00:00Z', end: null}], 'alternate_entrance'],
  ];
  for (const [periods, expected] of cases) assert.equal(assess([closure('717', {active_period: periods})]).status, expected);
});

test('alert updated_at age is not response freshness; timezone offsets are honored', () => {
  const result = assess([closure('717', {updated_at: '2026-01-01T00:00:00Z', active_period: [{start: '2026-09-26T12:00:00-04:00', end: null}]})]);
  assert.equal(result.status, 'alternate_entrance');
});

test('closed alert is inactive and every active-period interval is evaluated', () => {
  assert.equal(assess([closure('717', {closed_timestamp: '2026-09-26T15:59:59Z'})]).status, 'no_reported_closure');
  assert.equal(assess([closure('717', {active_period: [
    {start: '2026-09-25T15:00:00Z', end: '2026-09-25T17:00:00Z'},
    {start: '2026-09-26T15:00:00Z', end: '2026-09-26T17:00:00Z'},
  ]})]).status, 'alternate_entrance');
});

test('malformed relevant alert windows cannot silently clear the affected path', () => {
  for (const active_period of [null, [], [{start: 'bad', end: null}], [{start: NOW, end: 'bad'}], [{start: NOW, end: NOW}]]) {
    const result = assess([closure('717', {active_period}), closure('719')]);
    assert.equal(result.status, 'unknown', JSON.stringify(active_period));
    assert.equal(result.path, null);
  }
});

test('unknown effect and unscoped elevator closure require verification', () => {
  for (const effect of ['ACCESS_ISSUE', 'TRACK_CHANGE', 'UNKNOWN_EFFECT', 'FUTURE_EFFECT']) {
    const result = assess([closure('717', {effect}), closure('719')]);
    assert.equal(result.status, 'unknown', effect);
  }
  const result = assess([closure('717', {informed_entity: [{stop: 'place-astao', activities: ['BOARD']} ]})]);
  assert.equal(result.status, 'unknown');
});

test('no usable entity scope or malformed selector fields fail closed', () => {
  const bad = [null, {}, {id: 'bad', attributes: {}}, closure('717', {informed_entity: [null]}),
    closure('717', {informed_entity: [{stop: 42}]}), closure('717', {informed_entity: [{stop: 'place-astao', route_type: '1'}]})];
  for (const alert of bad) assert.equal(assess([alert]).status, 'unknown');
});

test('missing elevator-to-facility mapping is unknown when the other chain is closed', () => {
  const modified = copy(raw);
  for (const edge of modified.edges) if (edge.facilityId === '717') edge.facilityId = null;
  const result = assess([closure('719')], {}, request, createNetwork(modified));
  assert.equal(result.status, 'unknown');
  assert.equal(result.path, null);
});

test('missing facility record and unexpected pathway mode cannot support a clear path', () => {
  const modified = copy(raw);
  modified.facilities = modified.facilities.filter(facility => facility.id !== '717');
  assert.equal(assess([closure('719')], {}, request, createNetwork(modified)).status, 'unknown');
  const unknownMode = copy(raw);
  for (const edge of unknownMode.edges) if (edge.facilityId === '717') edge.mode = 99;
  assert.equal(assess([closure('719')], {}, request, createNetwork(unknownMode)).status, 'unknown');
});

test('stairs, escalators, stair_count, and inaccessible nodes cannot become a workaround', () => {
  for (const mode of [2, 4]) {
    const modified = copy(raw);
    modified.edges.push({id: 'fake-shortcut', from: request.fromId, to: request.toId, stationId: request.stationId, mode});
    const result = assess([closure('717'), closure('719')], {}, request, createNetwork(modified));
    assert.equal(result.status, 'blocked');
  }
  const modified = copy(raw);
  modified.edges.push({id: 'fake-stair-walk', from: request.fromId, to: request.toId, stationId: request.stationId, mode: 1, stairCount: 2});
  assert.equal(assess([closure('717'), closure('719')], {}, request, createNetwork(modified)).status, 'blocked');
  modified.nodes.find(node => node.id === 'node-astao-717-lobby').wheelchairBoarding = 2;
  assert.equal(assess([], {}, request, createNetwork(modified)).status, 'alternate_entrance');
});

test('unsupported station, wrong platform station, and inaccessible entrance return unknown', () => {
  for (const req of [
    {...request, stationId: 'place-unknown'}, {...request, toId: '70022'}, {...request, fromId: 'missing'},
    {stationId: 'place-state', fromId: 'door-state-cityhall', toId: '70022'},
    {stationId: 'place-mlmnl', fromId: 'door-mlmnl-pleasant', toId: 'WR-0045-S'},
  ]) assert.equal(assess([], {}, req).status, 'unknown', JSON.stringify(req));
});

test('graph feed validity is checked in Boston local time', () => {
  const modified = copy(raw);
  modified.source.feedEndDate = '20260925';
  assert.equal(assess([], {}, request, createNetwork(modified)).status, 'unknown');
  modified.source.feedEndDate = '20260926';
  const localLate = '2026-09-27T03:59:59Z';
  assert.equal(assess([], {now: localLate, fetchedAt: localLate}, request, createNetwork(modified)).status, 'no_reported_closure');
});

test('route and direction intersections avoid unrelated closures', () => {
  const unrelated = [
    {stop: 'place-state', route: 'Orange'},
    {stop: 'place-astao', route: 'Blue'},
    {route: 'Orange', direction_id: 1},
    {route_type: 2},
  ];
  for (const entity of unrelated) {
    const alert = closure('717', {effect: 'NO_SERVICE', informed_entity: [{...entity, activities: ['BOARD', 'EXIT']}]});
    assert.equal(assess([alert]).status, 'no_reported_closure', JSON.stringify(entity));
  }
  const blocked = closure('717', {effect: 'NO_SERVICE', informed_entity: [{route: 'Orange', direction_id: 0, activities: ['BOARD']}]});
  assert.equal(assess([blocked]).status, 'blocked');
});

test('a station closure applies to all entrances; specific entrance closure permits another', () => {
  const station = closure('717', {effect: 'STATION_CLOSURE', informed_entity: [{stop: 'place-astao', activities: ['BOARD', 'EXIT']}]});
  assert.equal(assess([station]).status, 'blocked');
  const entrance = closure('717', {effect: 'STOP_CLOSURE', informed_entity: [{stop: request.fromId, activities: ['BOARD']}]});
  assert.equal(assess([entrance]).status, 'alternate_entrance');
});

test('boarding-only closure does not affect the same platform exit check', () => {
  const boardOnly = closure('717', {effect: 'STOP_CLOSURE', informed_entity: [{stop: '70278', activities: ['BOARD']}]});
  assert.equal(assess([boardOnly]).status, 'blocked');
  assert.equal(assess([boardOnly], {}, {...request, fromId: '70278', toId: request.fromId}).status, 'no_reported_closure');
});

test('delay remains visible without claiming it closes a physical station path', () => {
  const delay = closure('717', {effect: 'DELAY', informed_entity: [{route: 'Orange', activities: ['RIDE']}]});
  const result = assess([delay]);
  assert.equal(result.status, 'no_reported_closure');
  assert.equal(result.advisories.length, 1);
  assert.match(result.summary, /advisories/);
});

test('official URLs never imply that injected replay alerts are official', () => {
  assert.equal(assess([closure('717')]).closures[0].url, null);
  const official = {...closure('717'), id: '1035002', simulation: false};
  assert.equal(assess([official]).closures[0].url, 'https://api-v3.mbta.com/alerts/1035002');
});

test('different alternative entrance alerts are independently respected', () => {
  const alternativeClosed = closure('718', {effect: 'STOP_CLOSURE', informed_entity: [{stop: 'door-astao-revol', activities: ['BOARD']}]});
  const result = assess([closure('717'), alternativeClosed]);
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.alternatives, []);
});

test('malformed graph references are rejected during network loading', () => {
  const modified = copy(raw);
  modified.edges[0].to = 'nonexistent';
  assert.throws(() => createNetwork(modified), /invalid endpoints/);
});
