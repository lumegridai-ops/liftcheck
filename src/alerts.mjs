import { createHash } from 'node:crypto';

export const ALERT_URL = 'https://api-v3.mbta.com/alerts?filter%5Bactivity%5D=ALL&page%5Blimit%5D=1000';
const TTL_MS = 60_000;

function validatedPage(payload) {
  if (!payload || !Array.isArray(payload.data) || !payload.links || !Object.hasOwn(payload.links, 'last') || payload.errors) throw new Error('Incomplete alert response.');
  for (const row of payload.data) {
    const a = row?.attributes;
    if (row.type !== 'alert' || typeof row.id !== 'string' || !a ||
      typeof a.effect !== 'string' || typeof a.header !== 'string' ||
      !Array.isArray(a.informed_entity) || !Array.isArray(a.active_period)) throw new Error('Invalid alert record.');
  }
  return payload;
}

function allowedLink(value) {
  if (value === null || value === undefined) return null;
  if (!((typeof value === 'string' && value.length > 0) || (typeof value === 'object' && typeof value.href === 'string' && value.href.length > 0))) throw new Error('Invalid alert pagination link.');
  const url = new URL(typeof value === 'object' ? value.href : value, ALERT_URL);
  if (url.origin !== 'https://api-v3.mbta.com' || url.pathname !== '/alerts' || url.searchParams.get('filter[activity]') !== 'ALL') {
    throw new Error('Unexpected alert pagination link.');
  }
  const allowed = new Set(['filter[activity]', 'page[limit]', 'page[offset]']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) throw new Error('Alert pagination changed the query.');
  }
  if (url.searchParams.get('page[limit]') !== '1000' || !/^\d+$/.test(url.searchParams.get('page[offset]') ?? '0')) throw new Error('Unexpected alert page bounds.');
  return url;
}

export async function fetchCompleteAlerts(fetchImpl = fetch, clock = () => new Date()) {
  let url = new URL(ALERT_URL);
  const alerts = [], seenPages = new Set(), seenIds = new Set();
  for (let page = 0; page < 10; page++) {
    if (seenPages.has(url.href)) throw new Error('Repeated alert page.');
    seenPages.add(url.href);
    const response = await fetchImpl(url, {signal: AbortSignal.timeout(10_000), headers: {Accept: 'application/vnd.api+json'}});
    if (!response.ok) throw new Error(`Alert service returned ${response.status}.`);
    const body = await response.text();
    if (body.length > 4_000_000) throw new Error('Alert response is too large.');
    const payload = validatedPage(JSON.parse(body));
    allowedLink(payload.links.first);
    for (const alert of payload.data) {
      if (seenIds.has(alert.id)) throw new Error('Alert pages overlap; retry for a consistent snapshot.');
      seenIds.add(alert.id);
      alerts.push(alert);
    }
    const next = allowedLink(payload.links.next);
    const last = allowedLink(payload.links.last);
    if (next && Number(next.searchParams.get('page[offset]') ?? 0) !== Number(url.searchParams.get('page[offset]') ?? 0) + 1000) throw new Error('Alert pages did not advance contiguously.');
    if (!next) {
      if (last && Number(last.searchParams.get('page[offset]') ?? 0) > Number(url.searchParams.get('page[offset]') ?? 0)) {
        throw new Error('Remaining alert page was omitted.');
      }
      return {
        alerts, complete: true, fetchedAt: clock().toISOString(), sourceUrl: ALERT_URL,
        sourceMode: 'live', pageCount: page + 1,
        responseHash: createHash('sha256').update(JSON.stringify(alerts)).digest('hex'),
      };
    }
    url = next;
  }
  throw new Error('Alert pagination exceeded the bounded fetch.');
}

export class AlertSource {
  constructor({fetchImpl = fetch, clock = () => new Date()} = {}) {
    this.fetchImpl = fetchImpl;
    this.clock = clock;
    this.cached = null;
    this.pending = null;
  }
  async snapshot() {
    if (this.cached && this.clock() - new Date(this.cached.fetchedAt) < TTL_MS) return {...this.cached, now: this.clock().toISOString()};
    if (!this.pending) {
      this.pending = fetchCompleteAlerts(this.fetchImpl, this.clock).then(snapshot => {
        this.cached = snapshot;
        return snapshot;
      }).catch(() => ({
        alerts: this.cached?.alerts ?? [], complete: false, fetchedAt: this.cached?.fetchedAt ?? null,
        sourceUrl: ALERT_URL, sourceMode: 'live',
        error: 'A complete current alert snapshot could not be fetched. The previous data, if any, cannot support a departure check.',
      })).finally(() => {this.pending = null;});
    }
    return {...await this.pending, now: this.clock().toISOString()};
  }
}

export function replaySnapshot(scenario) {
  const time = '2026-09-26T16:00:00.000Z';
  const closed = {clear: [], primary: ['717'], both: ['717', '719'], stale: []}[scenario];
  if (!closed) throw new Error('Unknown replay.');
  return {
    alerts: closed.map(id => ({
      id: `replay-${id}`, type: 'alert', simulation: true,
      attributes: {
        effect: 'ELEVATOR_CLOSURE', header: `Simulated outage: Assembly Elevator ${id}`,
        description: 'Invented outage for the labeled demo. This is not an MBTA report.',
        active_period: [{start: '2026-09-26T15:00:00Z', end: null}],
        informed_entity: [{facility: id, stop: 'place-astao', activities: ['USING_WHEELCHAIR']}],
        updated_at: time,
      },
    })),
    complete: true, fetchedAt: scenario === 'stale' ? '2026-09-26T15:00:00.000Z' : time,
    now: time, sourceMode: 'replay', scenario,
    sourceUrl: null, pageCount: 0,
    label: 'Demonstration replay: real station map, synthetic alerts, fixed September 26 evaluation time.',
  };
}
