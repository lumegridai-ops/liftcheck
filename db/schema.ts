import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const journeys = sqliteTable('lift_journeys', {
  scope: text('scope').primaryKey(),
  revision: integer('revision').notNull(),
  journeys: text('journeys').notNull(),
  touchedAt: integer('touched_at').notNull(),
});

export const budgets = sqliteTable('lift_request_budgets', {
  scope: text('scope').primaryKey(),
  window: integer('window').notNull(),
  count: integer('count').notNull(),
});
