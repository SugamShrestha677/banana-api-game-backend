import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { and, desc, eq, gt, sql } from 'drizzle-orm';

export class LeaderboardService {
  static async getLeaderboard(limit = 50, offset = 0) {
    // 1. Top N users, ranked
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

    // 2. Total number of ranked users (for pagination UI)
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(gt(users.highScore, 0));

    return { entries, total: Number(count) };
  }

  static async getUserRank(userId: string) {
    // Fetch the user's own score first
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, username: true, avatarUrl: true, highScore: true },
    });

    if (!user || user.highScore <= 0) return null;

    // Rank = number of users with a strictly higher score, + 1
    // This matches RANK() semantics when combined with the top-N query
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
}
