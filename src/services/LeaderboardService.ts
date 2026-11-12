import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { games } from '../drizzle/schema/game';
import { and, desc, eq, gt, sql } from 'drizzle-orm';

type Difficulty = 'easy' | 'medium' | 'hard';

export class LeaderboardService {
  /**
   * Global leaderboard.
   * When `difficulty` is provided, ranking is computed from that difficulty's
   * best score per user (from the `games` table). When null, uses the overall
   * `users.high_score` column.
   */
  static async getLeaderboard(
    difficulty: Difficulty | null,
    limit = 50,
    offset = 0
  ) {
    if (!difficulty) {
      // ── Overall (existing behaviour) ────────────────────
      const entries = await db
        .select({
          id: users.id,
          username: users.username,
          avatarUrl: users.avatarUrl,
          highScore: users.highScore,
          rank: sql<number>`RANK() OVER (ORDER BY ${users.highScore} DESC)`.as('rank'),
        })
        .from(users)
        .where(gt(users.highScore, 0))
        .orderBy(desc(users.highScore))
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(gt(users.highScore, 0));

      return { entries, total: Number(count) };
    }

    // ── Per-difficulty ────────────────────────────────────
    const entries = await db
      .select({
        id: users.id,
        username: users.username,
        avatarUrl: users.avatarUrl,
        highScore: sql<number>`MAX(${games.score})`.as('high_score'),
        rank: sql<number>`RANK() OVER (ORDER BY MAX(${games.score}) DESC)`.as('rank'),
      })
      .from(users)
      .innerJoin(games, eq(games.userId, users.id))
      .where(and(eq(games.status, 'completed'), eq(games.difficulty, difficulty)))
      .groupBy(users.id, users.username, users.avatarUrl)
      .having(sql`MAX(${games.score}) > 0`)
      .orderBy(desc(sql`MAX(${games.score})`), users.username)
      .limit(limit)
      .offset(offset);

    // Count of ranked users (must group + having, not just COUNT)
    const totalRows = await db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(games, eq(games.userId, users.id))
      .where(and(eq(games.status, 'completed'), eq(games.difficulty, difficulty)))
      .groupBy(users.id)
      .having(sql`MAX(${games.score}) > 0`);

    return { entries, total: totalRows.length };
  }

  /**
   * The requesting user's own rank — works for both modes.
   * Returns null if the user has no completed games yet (or score is 0).
   */
  static async getUserRank(userId: string, difficulty: Difficulty | null) {
    if (!difficulty) {
      // Overall
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, username: true, avatarUrl: true, highScore: true },
      });
      if (!user || user.highScore <= 0) return null;

      const [{ rank }] = await db
        .select({ rank: sql<number>`COUNT(*) + 1` })
        .from(users)
        .where(gt(users.highScore, user.highScore));

      return {
        rank: Number(rank),
        username: user.username,
        avatarUrl: user.avatarUrl,
        highScore: user.highScore,
      };
    }

    // Per-difficulty
    const [maxRow] = await db
      .select({ max: sql<number>`MAX(${games.score})` })
      .from(games)
      .where(
        and(
          eq(games.userId, userId),
          eq(games.status, 'completed'),
          eq(games.difficulty, difficulty)
        )
      );

    const userScore = Number(maxRow?.max ?? 0);
    if (userScore <= 0) return null;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, username: true, avatarUrl: true },
    });
    if (!user) return null;

    // Number of users with a strictly higher best on this difficulty
    const higherRows = await db
      .select({ userId: users.id })
      .from(users)
      .innerJoin(games, eq(games.userId, users.id))
      .where(and(eq(games.status, 'completed'), eq(games.difficulty, difficulty)))
      .groupBy(users.id)
      .having(sql`MAX(${games.score}) > ${userScore}`);

    return {
      rank: higherRows.length + 1,
      username: user.username,
      avatarUrl: user.avatarUrl,
      highScore: userScore,
    };
  }
}
