import {
  pgTable,
  uuid,
  integer,
  boolean,
  varchar,
  timestamp,
  date,
  pgEnum,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { puzzles } from './puzzles';

// ─── Enums ──────────────────────────────────────────────
export const gameModeEnum = pgEnum('game_mode', ['classic', 'practice', 'daily']);
export const gameStatusEnum = pgEnum('game_status', ['in_progress', 'completed', 'abandoned']);

// ─── games ──────────────────────────────────────────────
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable: allows guest play without an account
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  mode: gameModeEnum('mode').default('classic').notNull(),
  score: integer('score').default(0).notNull(),
  lives: integer('lives').default(3).notNull(),
  status: gameStatusEnum('status').default('in_progress').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

// ─── answers ────────────────────────────────────────────
export const answers = pgTable('answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  puzzleId: uuid('puzzle_id')
    .notNull()
    .references(() => puzzles.id),
  userAnswer: varchar('user_answer', { length: 16 }).notNull(),
  isCorrect: boolean('is_correct').notNull(),
  timeTakenMs: integer('time_taken_ms').notNull(),
  attemptNumber: integer('attempt_number').default(1).notNull(),
  answeredAt: timestamp('answered_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── daily_challenges ───────────────────────────────────
export const dailyChallenges = pgTable('daily_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengeDate: date('challenge_date').notNull().unique(),
  puzzleId: uuid('puzzle_id')
    .notNull()
    .references(() => puzzles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── daily_challenge_attempts ───────────────────────────
// Composite primary key: one attempt per user per challenge
export const dailyChallengeAttempts = pgTable(
  'daily_challenge_attempts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => dailyChallenges.id, { onDelete: 'cascade' }),
    completed: boolean('completed').default(false).notNull(),
    timeTakenMs: integer('time_taken_ms'),
    attemptedAt: timestamp('attempted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.challengeId] }),
  })
);
