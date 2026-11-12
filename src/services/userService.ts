import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { games } from '../drizzle/schema/game';
import { and, eq, sql } from 'drizzle-orm';

type Difficulty = 'easy' | 'medium' | 'hard';

export class UserService {
  static async getProfile(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        username: true,
        email: true,
        role: true,
        avatarUrl: true,
        highScore: true,
        createdAt: true,
      },
    });
    if (!user) throw new Error('User not found');
    return user;
  }

  static async submitScore(userId: string, score: number) {
    if (!Number.isInteger(score) || score < 0) {
      throw new Error('Invalid score');
    }
    const [updated] = await db
      .update(users)
      .set({
        highScore: sql`GREATEST(${users.highScore}, ${score})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ highScore: users.highScore });
    return { highScore: updated.highScore };
  }

  /**
   * Per-difficulty bests, computed from completed games only.
   * Zero values for difficulties the user has never completed.
   */
  static async getHighScores(userId: string): Promise<Record<Difficulty, number>> {
    const rows = await db
      .select({
        difficulty: games.difficulty,
        highScore: sql<number>`MAX(${games.score})`,
      })
      .from(games)
      .where(and(eq(games.userId, userId), eq(games.status, 'completed')))
      .groupBy(games.difficulty);

    const map: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const r of rows) {
      if (r.difficulty in map) {
        map[r.difficulty as Difficulty] = Number(r.highScore);
      }
    }
    return map;
  }

  static async getStats(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        username: true,
        email: true,
        role: true,
        avatarUrl: true,
        highScore: true,
        createdAt: true,
      },
    });
    if (!user) throw new Error('User not found');

    let rank: number | null = null;
    if (user.highScore > 0) {
      const [{ higherCount }] = await db
        .select({ higherCount: sql<number>`COUNT(*)` })
        .from(users)
        .where(sql`${users.highScore} > ${user.highScore}`);
      rank = Number(higherCount) + 1;
    }

    const highScores = await this.getHighScores(userId);

    return {
      user,
      stats: {
        gamesPlayed: 0,
        totalAnswers: 0,
        correctAnswers: 0,
        accuracy: 0,
        bestStreak: 0,
        rank,
        highScores,
      },
    };
  }
}
