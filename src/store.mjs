import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JourneyStore {
  constructor(directory) {
    mkdirSync(directory, {recursive: true});
    this.file = path.join(directory, 'journeys.json');
    this.lock = path.join(directory, '.lock');
    this.fd = openSync(this.lock, 'wx');
    try {
      this.state = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {revision: 0, journeys: []};
      if (!Number.isInteger(this.state.revision) || !Array.isArray(this.state.journeys)) throw new Error('Saved journeys are invalid.');
    } catch (error) { this.close(); throw error; }
  }
  read() {return structuredClone(this.state);}
  save({name, legs, expectedRevision}) {
    if (expectedRevision !== this.state.revision) throw new Error('Saved journeys changed. Refresh and try again.');
    if (this.state.journeys.length >= 30) throw new Error('This local prototype holds at most 30 journeys.');
    const next = {
      revision: this.state.revision + 1,
      journeys: [...this.state.journeys, {id: randomUUID(), name, legs: structuredClone(legs), createdAt: new Date().toISOString()}],
    };
    const temp = `${this.file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2), {mode: 0o600});
    renameSync(temp, this.file);
    this.state = next;
    return this.read();
  }
  close() {
    if (this.fd !== undefined) {closeSync(this.fd); this.fd = undefined; unlinkSync(this.lock);}
  }
}
