import { sql } from 'drizzle-orm';
import { db } from './db';
import { ACHIEVEMENTS_CATALOG } from '../config/achievements';
import { achievements } from './schema/achievements';

let initialized = false;

export async function ensureAchievementTablesAndCatalog() {
  if (initialized) return;

  try {
    // 1. Create tables if they do not exist
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "achievements" (
        "id" varchar(64) PRIMARY KEY NOT NULL,
        "name" varchar(128) NOT NULL,
        "description" text NOT NULL,
        "category" varchar(64) NOT NULL,
        "icon" varchar(64) NOT NULL,
        "tier" varchar(32) DEFAULT 'bronze' NOT NULL,
        "target_value" integer DEFAULT 1 NOT NULL,
        "order_index" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "user_achievements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
        "achievement_id" varchar(64) NOT NULL REFERENCES "achievements"("id") ON DELETE cascade,
        "unlocked" boolean DEFAULT false NOT NULL,
        "progress" integer DEFAULT 0 NOT NULL,
        "unlocked_at" timestamp with time zone,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "user_achievement_user_id_achievement_id_idx"
      ON "user_achievements" ("user_id", "achievement_id");
    `);

    // 2. Upsert catalog definitions
    for (const ach of ACHIEVEMENTS_CATALOG) {
      await db
        .insert(achievements)
        .values({
          id: ach.id,
          name: ach.name,
          description: ach.description,
          category: ach.category,
          icon: ach.icon,
          tier: ach.tier,
          targetValue: ach.targetValue,
          orderIndex: ach.orderIndex,
        })
        .onConflictDoUpdate({
          target: achievements.id,
          set: {
            name: ach.name,
            description: ach.description,
            category: ach.category,
            icon: ach.icon,
            tier: ach.tier,
            targetValue: ach.targetValue,
            orderIndex: ach.orderIndex,
          },
        });
    }

    initialized = true;
  } catch (error) {
    console.error('[AchievementInit] Error ensuring tables/catalog:', error);
  }
}
