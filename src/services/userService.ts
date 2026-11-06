import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { eq, sql } from 'drizzle-orm';

export class UserService {
  /**
   * Fetch profile details for the current user.
   */
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

  /**
   * Update high score only if the new score beats the existing one.
   * Uses SQL GREATEST() to avoid a race condition — two concurrent
   * requests can't overwrite each other's higher score.
   */
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

  // Rank = number of users with strictly higher score + 1
  let rank: number | null = null;
  if (user.highScore > 0) {
    const [{ higherCount }] = await db
      .select({ higherCount: sql<number>`COUNT(*)` })
      .from(users)
      .where(sql`${users.highScore} > ${user.highScore}`);
    rank = Number(higherCount) + 1;
  }

  return {
    user,
    stats: {
      // game/answer stats return 0 until server-tracked sessions ship
      gamesPlayed: 0,
      totalAnswers: 0,
      correctAnswers: 0,
      accuracy: 0,
      bestStreak: 0,
      rank,
    },
  };
}
}
