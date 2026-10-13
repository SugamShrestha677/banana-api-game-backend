import { pgTable, uuid, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const puzzles = pgTable('puzzles', {
  id: uuid('id').primaryKey().defaultRandom(),
  imageUrl: text('image_url').notNull(),
  imageBase64: text('image_base64'),
  solution: varchar('solution', { length: 16 }).notNull(),
  source: varchar('source', { length: 32 }).default('banana_api').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  usedCount: integer('used_count').default(0).notNull(),
});