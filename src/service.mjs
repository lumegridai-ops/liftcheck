import { z } from 'zod';
import { evaluatePath, stationCatalog } from './engine.mjs';
import { replaySnapshot } from './alerts.mjs';

const id = z.string().min(1).max(120);
const leg = z.object({stationId: id, fromId: id, toId: id}).strict();
export const toolSchemas = {
  get_station_catalog: z.object({}).strict(),
  get_saved_journeys: z.object({}).strict(),
  save_journey: z.object({name: z.string().trim().min(1).max(80), legs: z.array(leg).min(1).max(4), expectedRevision: z.number().int().nonnegative()}).strict(),
  check_station_path: leg,
  check_journey: z.object({journeyId: id}).strict(),
  run_assembly_replay: z.object({scenario: z.enum(['clear', 'primary', 'both', 'stale'])}).strict(),
};

export class LiftCheckService {
  constructor({network, store, source}) {
    this.network = network;
    this.store = store;
    this.source = source;
    this.catalog = stationCatalog(network);
  }
  validateLeg(value) {
    const station = this.catalog.find(row => row.id === value.stationId);
    if (!station) throw new Error('This station is outside the prototype map coverage.');
    const entrances = station.entrances.map(row => row.id), platforms = station.platforms.map(row => row.id);
    if (!((entrances.includes(value.fromId) && platforms.includes(value.toId)) ||
      (platforms.includes(value.fromId) && entrances.includes(value.toId)))) {
      throw new Error('Choose a mapped entrance and a boarding platform in the same station.');
    }
    return value;
  }
  describeLeg(value) {
    const station = this.catalog.find(row => row.id === value.stationId);
    const endpoints = [...station.entrances, ...station.platforms];
    return {...value, stationName: station.name,
      fromName: endpoints.find(row => row.id === value.fromId)?.name ?? value.fromId,
      toName: endpoints.find(row => row.id === value.toId)?.name ?? value.toId};
  }
  report(legs, snapshot, journeyName) {
    return {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(), journeyName,
      source: {
        mode: snapshot.sourceMode, fetchedAt: snapshot.fetchedAt, evaluatedAt: snapshot.now,
        complete: snapshot.complete, url: snapshot.sourceUrl, pageCount: snapshot.pageCount,
        responseHash: snapshot.responseHash ?? null, scenario: snapshot.scenario ?? null,
        label: snapshot.label ?? 'Current MBTA alerts fetched by LiftCheck.', error: snapshot.error ?? null,
        validUntil: snapshot.fetchedAt ? new Date(new Date(snapshot.fetchedAt).valueOf() + 5 * 60_000).toISOString() : null,
      },
      checks: legs.map(item => ({leg: this.describeLeg(item), result: evaluatePath(this.network, item, snapshot)})),
      scope: 'Station pathways only. No check of the journey between entrances, train operation, platform boarding, gate width, slopes, or assistance availability.',
      attribution: 'Transportation data provided by MassDOT / MBTA. LiftCheck is an independent prototype.',
    };
  }
  async invoke(name, input) {
    if (!Object.hasOwn(toolSchemas, name)) throw new Error('Unknown tool.');
    const parsed = toolSchemas[name].parse(input);
    if (name === 'get_station_catalog') return {stations: this.catalog, scope: 'Mapped station entrance–platform checks; not a door-to-door route planner.'};
    if (name === 'get_saved_journeys') return this.store.read();
    if (name === 'save_journey') {
      parsed.legs.forEach(item => this.validateLeg(item));
      return this.store.save(parsed);
    }
    if (name === 'run_assembly_replay') {
      const item = this.validateLeg({stationId: 'place-astao', fromId: 'door-astao-foley', toId: '70278'});
      return this.report([item], replaySnapshot(parsed.scenario), 'Assembly demonstration');
    }
    if (name === 'check_station_path') {
      const item = this.validateLeg(parsed);
      return this.report([item], await this.source.snapshot(), 'Station check');
    }
    const journey = (await this.store.read()).journeys.find(row => row.id === parsed.journeyId);
    if (!journey) throw new Error('This saved journey does not exist. Refresh the saved list.');
    journey.legs.forEach(item => this.validateLeg(item));
    return this.report(journey.legs, await this.source.snapshot(), journey.name);
  }
}
