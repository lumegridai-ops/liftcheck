/** D1 persists each visitor's journeys; every write compares the saved revision. */
export class HostedJourneyStore {
  constructor(db, scope) { this.db = db; this.scope = scope; }
  async read() {
    const row = await this.db.prepare('SELECT revision, journeys FROM lift_journeys WHERE scope = ?').bind(this.scope).first();
    return row ? {revision:row.revision, journeys:JSON.parse(row.journeys)} : {revision:0, journeys:[]};
  }
  async save({name, legs, expectedRevision}) {
    const current = await this.read();
    if (current.revision !== expectedRevision) throw new Error('Saved journeys changed. Refresh and try again.');
    if (current.journeys.length >= 30) throw new Error('This workspace holds at most 30 journeys.');
    const next = {revision:current.revision + 1, journeys:[...current.journeys, {
      id:crypto.randomUUID(), name, legs:structuredClone(legs), createdAt:new Date().toISOString(),
    }]};
    const result = await this.db.prepare(`INSERT INTO lift_journeys (scope, revision, journeys, touched_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision,
      journeys=excluded.journeys, touched_at=excluded.touched_at WHERE lift_journeys.revision = ?`)
      .bind(this.scope, next.revision, JSON.stringify(next.journeys), Date.now(), expectedRevision).run();
    if (result.meta.changes !== 1) throw new Error('Saved journeys changed. Refresh and try again.');
    return next;
  }
}
