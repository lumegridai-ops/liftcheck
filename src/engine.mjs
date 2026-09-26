/** Deterministic, source-bounded assessment of a station leg, not a trip guarantee. */
export const MAX_SNAPSHOT_AGE_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;
const STEP_FREE_MODES = new Set([1, 5, 6, 7]);
const EXCLUDED_MODES = new Set([2, 4]);
const HARD_EFFECTS = new Set(['ELEVATOR_CLOSURE', 'STATION_CLOSURE', 'STOP_CLOSURE', 'NO_SERVICE', 'SUSPENSION', 'DOCK_CLOSURE']);
const INFORMATIONAL_EFFECTS = new Set(['DELAY', 'ADDITIONAL_SERVICE', 'EXTRA_SERVICE', 'NOTICE', 'POLICY_CHANGE', 'SCHEDULE_CHANGE', 'SUMMARY', 'AMBER_ALERT', 'BIKE_ISSUE', 'PARKING_CLOSURE', 'PARKING_ISSUE']);
const BASE_LIMITATIONS = [
  'Checks published pathways inside one station only. It does not verify the outdoor approach, vehicle boarding, or the rest of a journey.',
  'No reported closure is not a guarantee of physical access. Unreported barriers, entrance hours, gate widths, lift dimensions and current conditions are not verified.',
  'The path uses the fewest mapped edges, not the shortest walking distance or travel time. Stairs and escalators are excluded.',
];

const array = value => Array.isArray(value);
const idString = value => typeof value === 'string' && value.length > 0;
const unique = values => [...new Set(values)];
function time(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).getTime() : NaN;
  if (typeof value !== 'string') return NaN;
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?<zone>Z|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/.exec(value);
  if (!match) return NaN;
  const fields = match.groups;
  const year = Number(fields.year), month = Number(fields.month), day = Number(fields.day);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] ||
      Number(fields.hour) > 23 || Number(fields.minute) > 59 || Number(fields.second) > 59 ||
      (fields.zone !== 'Z' && (Number(fields.offsetHour) > 23 || Number(fields.offsetMinute) > 59))) return NaN;
  return Date.parse(value);
}
const iso = value => Number.isFinite(value) ? new Date(value).toISOString() : null;

function index(rows, label) {
  if (!array(rows)) throw new TypeError(label + ' must be an array');
  const map = new Map();
  for (const row of rows) {
    if (!row || !idString(row.id) || map.has(row.id)) throw new TypeError('Invalid or duplicate ' + label + ' ID');
    map.set(row.id, row);
  }
  return map;
}

export function createNetwork(raw) {
  if (!raw || raw.schemaVersion !== 1) throw new TypeError('Unsupported network schema');
  const nodesById = index(raw.nodes, 'node');
  const stationsById = index(raw.stations, 'station');
  const facilitiesById = index(raw.facilities, 'facility');
  index(raw.edges, 'edge');
  const adjacency = new Map();
  const add = edge => {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge);
  };
  for (const node of raw.nodes) {
    if (!stationsById.has(node.stationId)) throw new TypeError('Node references an unknown station');
  }
  for (const edge of raw.edges) {
    const from = nodesById.get(edge.from), to = nodesById.get(edge.to);
    if (!from || !to || from.stationId !== edge.stationId || to.stationId !== edge.stationId || !Number.isInteger(edge.mode)) {
      throw new TypeError('Edge has invalid endpoints, station, or mode');
    }
    add(edge);
    if (edge.bidirectional === true) add({...edge, id: edge.id + ':reverse', sourceEdgeId: edge.id, from: edge.to, to: edge.from});
  }
  for (const edges of adjacency.values()) edges.sort((a, b) => a.id.localeCompare(b.id));
  return {...raw, nodesById, stationsById, facilitiesById, adjacency};
}

function supportedPlatform(node) {
  // The initial product supports an unambiguous rail platform and direction.
  return node?.kind === 'platform' && array(node.boardings) && node.boardings.length === 1 &&
    node.boardings[0].routeType === 1 && [0, 1].includes(node.boardings[0].directionId);
}

export function stationCatalog(network) {
  const describe = node => ({id: node.id, name: node.name});
  return network.stations.map(station => ({
    id: station.id, name: station.name,
    entrances: (station.entranceIds || []).map(id => network.nodesById.get(id))
      .filter(node => node && node.wheelchairBoarding !== 2).map(describe),
    platforms: (station.platformIds || []).map(id => network.nodesById.get(id))
      .filter(node => supportedPlatform(node) && node.wheelchairBoarding !== 2).map(describe),
  }));
}

function contextFor(network, request) {
  const from = network.nodesById.get(request.fromId), to = network.nodesById.get(request.toId);
  const platformNodes = [from, to].filter(node => node?.kind === 'platform');
  const activities = new Set(['USING_WHEELCHAIR', 'RIDE']);
  if (from?.kind === 'entrance' || to?.kind === 'platform') activities.add('BOARD');
  if (to?.kind === 'entrance' || from?.kind === 'platform') activities.add('EXIT');
  return {from, to, activities, boardings: platformNodes.flatMap(node => node.boardings || []), platformNodes};
}

/** Informed entity fields form an intersection; separate entities form a union. */
function entityScope(network, request, context, entity) {
  if (!entity || typeof entity !== 'object' || array(entity)) return {kind: 'global', uncertain: true, reason: 'Malformed informed entity'};
  const badIdentifier = ['stop', 'facility', 'route', 'trip'].some(key => entity[key] != null && !idString(entity[key]));
  const badNumber = (entity.route_type != null && !Number.isInteger(entity.route_type)) ||
    (entity.direction_id != null && ![0, 1].includes(entity.direction_id));
  if (badIdentifier || badNumber) return {kind: 'global', uncertain: true, reason: 'Malformed alert selector fields'};
  const station = network.stationsById.get(request.stationId);
  const stop = entity.stop == null ? null : network.nodesById.get(entity.stop);
  const facility = entity.facility == null ? null : network.facilitiesById.get(entity.facility);
  if (entity.stop != null && (!stop || stop.stationId !== request.stationId)) return null;
  if (entity.facility != null && facility && facility.stationId !== request.stationId) return null;
  // A facility-only identifier that appears nowhere in this station's graph is unrelated.
  if (entity.facility != null && !facility && entity.stop == null &&
      !network.edges.some(edge => edge.stationId === request.stationId && edge.facilityId === entity.facility)) return null;

  const hasServiceSelector = entity.route != null || entity.route_type != null || entity.direction_id != null;
  let uncertain = false, reason = null;
  if (hasServiceSelector) {
    let boardings = context.boardings;
    if (stop?.kind === 'platform') {
      // A disruption on a different boarding platform is not an alert for this leg.
      if (!context.platformNodes.some(node => node.id === stop.id)) return null;
      boardings = stop.boardings || [];
    }
    if (!boardings.length) { uncertain = true; reason = 'Platform route/direction is unmapped'; }
    else if (!boardings.some(b =>
      (entity.route == null || b.routeId === entity.route) &&
      (entity.route_type == null || b.routeType === entity.route_type) &&
      (entity.direction_id == null || b.directionId === entity.direction_id))) return null;
  }
  const knownActivities = new Set(['BOARD', 'EXIT', 'RIDE', 'USING_WHEELCHAIR', 'USING_ESCALATOR', 'BRINGING_BIKE', 'PARK_CAR', 'STORE_BIKE']);
  if (entity.activities != null && (!array(entity.activities) || entity.activities.some(activity => !knownActivities.has(activity)))) {
    uncertain = true; reason = 'Malformed activity selector';
  } else if (array(entity.activities) && entity.activities.length &&
             !entity.activities.some(activity => context.activities.has(activity))) return null;
  if (entity.trip != null) { uncertain = true; reason = 'A specific train trip was not selected'; }
  if (![entity.stop, entity.facility, entity.route, entity.route_type, entity.direction_id, entity.trip].some(value => value != null)) {
    uncertain = true; reason = 'Alert has no usable entity selector';
  }
  if (entity.facility != null) {
    if (!idString(entity.facility) || !facility) {
      return {kind: 'global', uncertain: true, reason: 'An affected facility has no verified mapping in this station'};
    }
    return {kind: 'facility', id: entity.facility, uncertain, reason};
  }
  if (stop && stop.id !== station.id) return {kind: 'node', id: stop.id, uncertain, reason};
  return {kind: 'global', uncertain, reason};
}

function periodState(attributes, now) {
  if (attributes.closed_timestamp != null) {
    const closed = time(attributes.closed_timestamp);
    if (!Number.isFinite(closed)) return 'unknown';
    if (closed <= now) return 'inactive';
  }
  if (!array(attributes.active_period) || !attributes.active_period.length) return 'unknown';
  let active = false;
  for (const period of attributes.active_period) {
    if (!period || typeof period !== 'object') return 'unknown';
    const start = time(period.start), end = period.end == null ? Infinity : time(period.end);
    if (!Number.isFinite(start) || (!Number.isFinite(end) && end !== Infinity) || end <= start) return 'unknown';
    if (start <= now && now < end) active = true;
  }
  return active ? 'active' : 'inactive';
}

function scopeSet() { return {global: false, nodes: new Set(), facilities: new Set()}; }
function applyScope(set, scope) {
  if (scope.kind === 'global') set.global = true;
  else if (scope.kind === 'node') set.nodes.add(scope.id);
  else set.facilities.add(scope.id);
}

function interpretAlerts(network, request, context, alerts, now) {
  const hard = scopeSet(), uncertain = scopeSet();
  const closures = [], advisories = [], issues = [];
  for (const alert of alerts) {
    const a = alert?.attributes;
    if (!a || typeof a !== 'object' || !array(a.informed_entity) || !a.informed_entity.length) {
      uncertain.global = true;
      issues.push('An alert record has no valid entity scope; completeness cannot be established.');
      continue;
    }
    const scopes = a.informed_entity.map(entity => entityScope(network, request, context, entity)).filter(Boolean);
    if (!scopes.length) continue;
    const period = periodState(a, now);
    if (period === 'inactive') continue;
    const effect = a.effect;
    const simulated = alert.simulation === true || /^replay-|^synthetic-/.test(String(alert.id));
    const facilityIds = unique(scopes.filter(scope => scope.kind === 'facility').map(scope => scope.id));
    const record = {
      id: idString(alert.id) ? alert.id : 'unidentified-alert',
      facilityId: facilityIds.length === 1 ? facilityIds[0] : null, facilityIds,
      header: typeof a.header === 'string' ? a.header : 'Alert details unavailable',
      effect: typeof effect === 'string' ? effect : 'UNKNOWN_EFFECT',
      url: !simulated && idString(alert.id) ? 'https://api-v3.mbta.com/alerts/' + encodeURIComponent(alert.id) : null,
      simulation: simulated, activePeriods: array(a.active_period) ? a.active_period : [],
      updatedAt: a.updated_at || null,
      stopIds: unique(a.informed_entity.map(entity => entity?.stop).filter(idString)),
      routeIds: unique(a.informed_entity.map(entity => entity?.route).filter(idString)),
      uncertain: period === 'unknown' || scopes.some(scope => scope.uncertain),
    };
    if (period === 'unknown') issues.push('An applicable alert has an invalid or absent active window.');
    let kind = HARD_EFFECTS.has(effect) ? 'hard' : INFORMATIONAL_EFFECTS.has(effect) || effect === 'ESCALATOR_CLOSURE' ? 'advisory' : 'uncertain';
    // An elevator closure without an elevator ID cannot identify a blocked edge.
    if (effect === 'ELEVATOR_CLOSURE' && !facilityIds.length) kind = 'uncertain';
    if (period === 'unknown') kind = 'uncertain';
    if (kind === 'hard' && !record.uncertain) closures.push(record);
    else advisories.push(record);
    for (const scope of scopes) {
      if (scope.uncertain) {
        applyScope(uncertain, scope);
        if (scope.reason) issues.push(scope.reason);
      } else if (kind === 'hard') applyScope(hard, scope);
      else if (kind === 'uncertain') applyScope(uncertain, scope);
    }
  }
  return {hard, uncertain, closures, advisories, issues: unique(issues)};
}

function metadataUncertain(network, edge) {
  if (!STEP_FREE_MODES.has(edge.mode)) return true;
  const facility = edge.facilityId ? network.facilitiesById.get(edge.facilityId) : null;
  if (edge.mode === 5 && (!facility || facility.type !== 'ELEVATOR')) return true;
  if (edge.facilityId && (!facility || facility.stationId !== edge.stationId)) return true;
  return false;
}

function findPath(network, request, restrictions, allowUncertain = false) {
  const {hard, uncertain} = restrictions;
  if (hard.global || (!allowUncertain && uncertain.global)) return null;
  const usableNode = id => {
    const node = network.nodesById.get(id);
    return node && node.stationId === request.stationId && node.wheelchairBoarding !== 2 &&
      !hard.nodes.has(id) && (allowUncertain || !uncertain.nodes.has(id));
  };
  if (!usableNode(request.fromId) || !usableNode(request.toId)) return null;
  const queue = [request.fromId], previous = new Map([[request.fromId, null]]);
  for (let index = 0; index < queue.length; index++) {
    const nodeId = queue[index];
    if (nodeId === request.toId) break;
    for (const edge of network.adjacency.get(nodeId) || []) {
      if (edge.stationId !== request.stationId || EXCLUDED_MODES.has(edge.mode) ||
          (Number.isFinite(edge.stairCount) && edge.stairCount !== 0) ||
          !usableNode(edge.to) || previous.has(edge.to) ||
          (edge.facilityId && hard.facilities.has(edge.facilityId)) ||
          (!allowUncertain && (metadataUncertain(network, edge) ||
            (edge.facilityId && uncertain.facilities.has(edge.facilityId))))) continue;
      previous.set(edge.to, edge);
      queue.push(edge.to);
    }
  }
  if (!previous.has(request.toId)) return null;
  const edges = [];
  for (let node = request.toId; node !== request.fromId;) {
    const edge = previous.get(node);
    edges.push(edge); node = edge.from;
  }
  edges.reverse();
  const nodeIds = [request.fromId, ...edges.map(edge => edge.to)];
  const facilityIds = unique(edges.map(edge => edge.facilityId).filter(Boolean));
  return {
    fromId: request.fromId, toId: request.toId,
    nodes: nodeIds.map(id => { const node = network.nodesById.get(id); return {id, name: node.name, kind: node.kind}; }),
    edges: edges.map(edge => ({id: edge.id, from: edge.from, to: edge.to, mode: edge.mode,
      facilityId: edge.facilityId || null, name: edge.name || edge.id, sourceEdgeId: edge.sourceEdgeId || edge.id})),
    facilities: facilityIds.map(id => { const f = network.facilitiesById.get(id); return {id, name: f?.name || id, sourceUrl: f?.sourceUrl || null}; }),
    metric: 'fewest mapped edges', edgeCount: edges.length,
    lengthM: edges.every(edge => Number.isFinite(edge.lengthM)) ? edges.reduce((sum, edge) => sum + edge.lengthM, 0) : null,
  };
}

export function evaluatePath(network, request = {}, snapshot = {}) {
  const now = time(snapshot.now ?? Date.now()), fetchedAt = time(snapshot.fetchedAt);
  const result = {
    status: 'unknown', summary: 'This station leg cannot be verified from the available data.',
    path: null, alternatives: [], closures: [], advisories: [],
    evidence: {
      evaluatedAt: iso(now), fetchedAt: iso(fetchedAt), validUntil: iso(fetchedAt + MAX_SNAPSHOT_AGE_MS),
      maxAgeMs: MAX_SNAPSHOT_AGE_MS, complete: snapshot.complete === true,
      sourceUrl: snapshot.sourceUrl || null, responseHash: snapshot.responseHash || null,
      feedVersion: network.source?.feedVersion || null, networkSourceUrl: network.source?.url || null,
      networkSha256: network.source?.sha256 || null, request: {...request},
      policy: 'Published directed step-free paths; current reported disruptions; no physical-access guarantee',
    }, limitations: [...BASE_LIMITATIONS],
  };
  const fail = reason => { result.summary = reason; result.limitations.push(reason); return result; };
  if (!Number.isFinite(now) || !Number.isFinite(fetchedAt)) return fail('A valid evaluation and feed retrieval time are required.');
  if (snapshot.complete !== true || !array(snapshot.alerts)) return fail('The alert response is incomplete or unavailable. Recheck before using a path.');
  if (fetchedAt > now + CLOCK_SKEW_MS) return fail('The alert retrieval time is later than this check. The snapshot cannot establish current status.');
  if (now - fetchedAt >= MAX_SNAPSHOT_AGE_MS) return fail('The alert snapshot has expired. Refresh it before checking a path.');
  const station = network.stationsById.get(request.stationId);
  if (!station) return fail('This station is outside the supported pathway coverage.');
  const context = contextFor(network, request);
  const {from, to} = context;
  if (!from || !to || from.stationId !== request.stationId || to.stationId !== request.stationId || from.id === to.id) {
    return fail('Choose distinct mapped endpoints inside the same supported station.');
  }
  if (from.wheelchairBoarding === 2 || to.wheelchairBoarding === 2) return fail('A selected endpoint is marked inaccessible in the source data. No step-free assessment is available for it.');
  const validLeg = (from.kind === 'entrance' && supportedPlatform(to)) ||
    (supportedPlatform(from) && to.kind === 'entrance') || (supportedPlatform(from) && supportedPlatform(to));
  if (!validLeg) return fail('Select a mapped entrance and supported rail platform, or two supported platforms.');
  const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'})
    .format(new Date(now)).replaceAll('-', '');
  const start = network.source?.feedStartDate, end = network.source?.feedEndDate;
  if (!/^\d{8}$/.test(start || '') || !/^\d{8}$/.test(end || '') || day < start || day > end) {
    return fail('The station graph has no valid feed coverage for this date. Refresh the network snapshot.');
  }
  result.evidence.stationCoverage = station.coverage || null;
  result.evidence.graphFeedStartDate = start;
  result.evidence.graphFeedEndDate = end;
  const restrictions = interpretAlerts(network, request, context, snapshot.alerts, now);
  result.closures = restrictions.closures;
  result.advisories = restrictions.advisories;
  result.limitations.push(...restrictions.issues);
  const path = findPath(network, request, restrictions);
  if (path) {
    result.status = 'no_reported_closure'; result.path = path;
    result.summary = 'No reported closure found on this mapped station path at the time checked.';
    if (result.advisories.length) result.summary += ' Review the service advisories shown.';
    return result;
  }

  // Each different entrance is independently evaluated: its stop-scoped alerts
  // and the dependencies on every edge must be reconsidered for that request.
  const changeType = from.kind === 'entrance' ? 'entrance' : to.kind === 'entrance' ? 'exit' : null;
  if (changeType) {
    for (const entranceId of station.entranceIds || []) {
      const current = changeType === 'entrance' ? from.id : to.id;
      if (entranceId === current || network.nodesById.get(entranceId)?.wheelchairBoarding === 2) continue;
      const alternateRequest = {...request, [changeType === 'entrance' ? 'fromId' : 'toId']: entranceId};
      const alternateContext = contextFor(network, alternateRequest);
      const alternateRestrictions = interpretAlerts(network, alternateRequest, alternateContext, snapshot.alerts, now);
      const alternatePath = findPath(network, alternateRequest, alternateRestrictions);
      if (alternatePath) result.alternatives.push({entranceId, entranceName: network.nodesById.get(entranceId).name,
        changeType, path: alternatePath});
    }
    result.alternatives.sort((a, b) => a.path.edgeCount - b.path.edgeCount || a.entranceId.localeCompare(b.entranceId));
  }
  if (result.alternatives.length) {
    result.status = 'alternate_entrance';
    result.summary = 'The selected ' + (changeType === 'exit' ? 'exit' : 'entrance') +
      ' path cannot be confirmed. A different mapped ' + (changeType === 'exit' ? 'exit' : 'entrance') +
      ' has no reported conflict: ' + result.alternatives[0].entranceName + '.';
    result.limitations.push('Reaching a different entrance outside the station is not assessed. The alternative is a choice, not an automatic change to your saved trip.');
    return result;
  }
  const possiblePath = findPath(network, request, restrictions, true);
  const baseline = findPath(network, request, {hard: scopeSet(), uncertain: scopeSet()}, true);
  if (possiblePath || restrictions.uncertain.global) {
    return fail('A mapped path or applicable alert has unresolved information. This station leg cannot be verified.');
  }
  if (baseline && result.closures.length) {
    result.status = 'blocked';
    result.summary = 'Reported closures block the selected mapped station path. No checked alternative entrance path was found.';
    result.limitations.push('This means no alternative was found in the supported graph; it does not establish that all physical station access is impossible.');
    return result;
  }
  return fail('No supported step-free path was found between these endpoints. Missing map coverage must not be treated as a closure or an all-clear.');
}
