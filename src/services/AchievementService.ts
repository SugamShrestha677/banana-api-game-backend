import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { achievements, userAchievements } from '../drizzle/schema/achievements';
import { answers, games } from '../drizzle/schema/game';
import { users } from '../drizzle/schema/users';
import { ACHIEVEMENTS_CATALOG, AchievementDefinition } from '../config/achievements';
import { ensureAchievementTablesAndCatalog } from '../drizzle/initAchievements';

export type UserAchievementItem = AchievementDefinition & {
  unlocked: boolean;
  progress: number;
  unlockedAt: Date | string | null;
  progressPercentage: number;
};

export type AchievementsSummary = {
  total: number;
  unlockedCount: number;
  lockedCount: number;
  completionPercentage: number;
  badgeScore: number;
  title: string;
};

const TIER_POINTS: Record<string, number> = {
  bronze: 10,
  silver: 25,
  gold: 50,
  platinum: 100,
};

function getTitleForUnlockedCount(count: number): string {
  if (count >= 14) return 'Banana Deity 👑';
  if (count >= 10) return 'Potassium Overlord ⚡';
  if (count >= 7) return 'Banana Wizard 🍌';
  if (count >= 4) return 'Chimp Champion 🐒';
  if (count >= 1) return 'Peel Prodigy 🌟';
  return 'Banana Novice 🍃';
}

export class AchievementService {
  /**
   * Fetch all achievements with the user's progress and unlock status.
   */
  static async getUserAchievements(userId: string) {
    await ensureAchievementTablesAndCatalog();

    // 1. Get all definitions ordered by orderIndex
    const allDefs = await db.query.achievements.findMany({
      orderBy: (ach, { asc }) => [asc(ach.orderIndex)],
    });

    // 2. Get user unlock records
    const userRecords = await db.query.userAchievements.findMany({
      where: eq(userAchievements.userId, userId),
    });

    const recordMap = new Map<string, typeof userRecords[0]>();
    for (const r of userRecords) {
      recordMap.set(r.achievementId, r);
    }

    // 3. Assemble full list with progress calculation
    const allItems: UserAchievementItem[] = allDefs.map((def) => {
      const rec = recordMap.get(def.id);
      const unlocked = !!rec?.unlocked;
      const progress = rec?.progress ?? (unlocked ? def.targetValue : 0);
      const target = Math.max(1, def.targetValue);
      const progressPercentage = unlocked
        ? 100
        : Math.min(100, Math.round((progress / target) * 100));

      return {
        id: def.id,
        name: def.name,
        description: def.description,
        category: def.category as any,
        icon: def.icon,
        tier: def.tier as any,
        targetValue: def.targetValue,
        orderIndex: def.orderIndex,
        unlocked,
        progress,
        unlockedAt: rec?.unlockedAt ?? null,
        progressPercentage,
      };
    });

    const owned = allItems.filter((item) => item.unlocked);
    const available = allItems.filter((item) => !item.unlocked);

    let badgeScore = 0;
    for (const item of owned) {
      badgeScore += TIER_POINTS[item.tier] ?? 10;
    }

    const total = allItems.length;
    const unlockedCount = owned.length;
    const lockedCount = available.length;
    const completionPercentage = total > 0 ? Math.round((unlockedCount / total) * 100) : 0;
    const title = getTitleForUnlockedCount(unlockedCount);

    const summary: AchievementsSummary = {
      total,
      unlockedCount,
      lockedCount,
      completionPercentage,
      badgeScore,
      title,
    };

    return {
      summary,
      owned,
      available,
      all: allItems,
    };
  }

  /**
   * Helper to unlock an achievement or update progress.
   * Returns definition if this was a fresh unlock.
   */
  private static async recordProgress(
    userId: string,
    achievementId: string,
    progress: number,
    shouldUnlock: boolean
  ): Promise<AchievementDefinition | null> {
    const def = ACHIEVEMENTS_CATALOG.find((a) => a.id === achievementId);
    if (!def) return null;

    const existing = await db.query.userAchievements.findFirst({
      where: and(
        eq(userAchievements.userId, userId),
        eq(userAchievements.achievementId, achievementId)
      ),
    });

    const wasUnlocked = existing?.unlocked ?? false;
    const isNewUnlock = shouldUnlock && !wasUnlocked;
    const newProgress = Math.max(existing?.progress ?? 0, progress);

    if (existing) {
      await db
        .update(userAchievements)
        .set({
          progress: isNewUnlock ? def.targetValue : newProgress,
          unlocked: wasUnlocked || shouldUnlock,
          unlockedAt: isNewUnlock ? new Date() : existing.unlockedAt,
          updatedAt: new Date(),
        })
        .where(eq(userAchievements.id, existing.id));
    } else {
      await db.insert(userAchievements).values({
        userId,
        achievementId,
        progress: isNewUnlock ? def.targetValue : newProgress,
        unlocked: shouldUnlock,
        unlockedAt: shouldUnlock ? new Date() : null,
      });
    }

    return isNewUnlock ? def : null;
  }

  /**
   * Evaluate achievements triggered by answering a puzzle.
   */
  static async evaluateAnswerAchievements(
    userId: string,
    gameId: string,
    params: {
      correct: boolean;
      timeTakenMs: number;
      livesRemaining: number;
      difficulty: string;
    }
  ): Promise<AchievementDefinition[]> {
    if (!userId) return [];
    await ensureAchievementTablesAndCatalog();

    const newlyUnlocked: AchievementDefinition[] = [];

    // 1. Calculate streak for the current game
    const recentAnswers = await db
      .select({ isCorrect: answers.isCorrect })
      .from(answers)
      .where(eq(answers.gameId, gameId))
      .orderBy(desc(answers.answeredAt));

    let currentStreak = 0;
    for (const ans of recentAnswers) {
      if (ans.isCorrect) {
        currentStreak++;
      } else {
        break;
      }
    }

    // 2. Calculate user's total correct answers across all time
    const [totalCorrectRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(answers)
      .innerJoin(games, eq(answers.gameId, games.id))
      .where(and(eq(games.userId, userId), eq(answers.isCorrect, true)));

    const totalCorrectAnswers = Number(totalCorrectRow?.count ?? 0);

    // If this answer was correct:
    if (params.correct) {
      // 1. First Peel
      const u1 = await this.recordProgress(userId, 'first_correct', 1, true);
      if (u1) newlyUnlocked.push(u1);

      // 2. Speed Demon (<= 3 seconds)
      if (params.timeTakenMs > 0 && params.timeTakenMs <= 3000) {
        const u2 = await this.recordProgress(userId, 'speed_demon', 1, true);
        if (u2) newlyUnlocked.push(u2);
      }

      // 3. Lightning Reflexes (<= 1.5 seconds)
      if (params.timeTakenMs > 0 && params.timeTakenMs <= 1500) {
        const u3 = await this.recordProgress(userId, 'lightning_fast', 1, true);
        if (u3) newlyUnlocked.push(u3);
      }

      // 4. Streaks: 5, 10, 20
      const uStreak5 = await this.recordProgress(
        userId,
        'streak_5',
        currentStreak,
        currentStreak >= 5
      );
      if (uStreak5) newlyUnlocked.push(uStreak5);

      const uStreak10 = await this.recordProgress(
        userId,
        'streak_10',
        currentStreak,
        currentStreak >= 10
      );
      if (uStreak10) newlyUnlocked.push(uStreak10);

      const uStreak20 = await this.recordProgress(
        userId,
        'streak_20',
        currentStreak,
        currentStreak >= 20
      );
      if (uStreak20) newlyUnlocked.push(uStreak20);

      // 5. Clutch Harvester: answered correctly with 1 life remaining
      if (params.livesRemaining === 1) {
        const uClutch = await this.recordProgress(userId, 'clutch_master', 1, true);
        if (uClutch) newlyUnlocked.push(uClutch);
      }

      // 6. Total answers milestones (25, 50, 100)
      const u25 = await this.recordProgress(
        userId,
        'puzzles_25',
        totalCorrectAnswers,
        totalCorrectAnswers >= 25
      );
      if (u25) newlyUnlocked.push(u25);

      const u50 = await this.recordProgress(
        userId,
        'puzzles_50',
        totalCorrectAnswers,
        totalCorrectAnswers >= 50
      );
      if (u50) newlyUnlocked.push(u50);

      const u100 = await this.recordProgress(
        userId,
        'puzzles_100',
        totalCorrectAnswers,
        totalCorrectAnswers >= 100
      );
      if (u100) newlyUnlocked.push(u100);
    }

    // Check meta-achievement if any were unlocked
    if (newlyUnlocked.length > 0) {
      const meta = await this.checkMetaAchievement(userId);
      if (meta) newlyUnlocked.push(meta);
    }

    return newlyUnlocked;
  }

  /**
   * Evaluate achievements triggered at game end (scores, flawless, hard mode, games count).
   */
  static async evaluateGameEndAchievements(
    userId: string,
    gameId: string,
    params: {
      score: number;
      livesRemaining: number;
      initialLives: number;
      difficulty: string;
    }
  ): Promise<AchievementDefinition[]> {
    if (!userId) return [];
    await ensureAchievementTablesAndCatalog();

    const newlyUnlocked: AchievementDefinition[] = [];

    // 1. Total games played
    const [gamesRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .where(eq(games.userId, userId));

    const totalGames = Number(gamesRow?.count ?? 0);
    const uGames10 = await this.recordProgress(userId, 'games_10', totalGames, totalGames >= 10);
    if (uGames10) newlyUnlocked.push(uGames10);

    // 2. High score milestones (30, 50)
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { highScore: true },
    });
    const currentHighScore = Math.max(user?.highScore ?? 0, params.score);

    const uScore30 = await this.recordProgress(
      userId,
      'score_30',
      currentHighScore,
      currentHighScore >= 30
    );
    if (uScore30) newlyUnlocked.push(uScore30);

    const uScore50 = await this.recordProgress(
      userId,
      'score_50',
      currentHighScore,
      currentHighScore >= 50
    );
    if (uScore50) newlyUnlocked.push(uScore50);

    // 3. Flawless Harvest (scored >= 10 without losing a single life)
    if (params.score >= 10 && params.livesRemaining >= params.initialLives) {
      const uFlawless = await this.recordProgress(userId, 'flawless_game', 1, true);
      if (uFlawless) newlyUnlocked.push(uFlawless);
    }

    // 4. Daredevil Survivor (Hard difficulty, score >= 15)
    if (params.difficulty === 'hard' && params.score >= 15) {
      const uDaredevil = await this.recordProgress(userId, 'daredevil', 1, true);
      if (uDaredevil) newlyUnlocked.push(uDaredevil);
    }

    // Check meta-achievement
    const meta = await this.checkMetaAchievement(userId);
    if (meta) newlyUnlocked.push(meta);

    return newlyUnlocked;
  }

  /**
   * Check if user unlocked 10+ achievements for Golden Bunch Legend.
   */
  private static async checkMetaAchievement(userId: string): Promise<AchievementDefinition | null> {
    const [unlockedCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userAchievements)
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.unlocked, true),
          sql`${userAchievements.achievementId} != 'all_rounder'`
        )
      );

    const count = Number(unlockedCountRow?.count ?? 0);
    return await this.recordProgress(userId, 'all_rounder', count, count >= 10);
  }
}
