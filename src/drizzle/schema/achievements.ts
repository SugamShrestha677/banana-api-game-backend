import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const achievements = pgTable('achievements', {
  id: varchar('id', { length: 64 }).primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  icon: varchar('icon', { length: 64 }).notNull(),
  tier: varchar('tier', { length: 32 }).notNull().default('bronze'),
  targetValue: integer('target_value').default(1).notNull(),
  orderIndex: integer('order_index').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementId: varchar('achievement_id', { length: 64 })
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    unlocked: boolean('unlocked').default(false).notNull(),
    progress: integer('progress').default(0).notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userAchievementUnique: uniqueIndex('user_achievement_user_id_achievement_id_idx').on(
      table.userId,
      table.achievementId
    ),
  })
);
