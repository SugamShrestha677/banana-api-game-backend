import { and, eq, sql } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { games, answers } from '../drizzle/schema/game';
import { puzzles } from '../drizzle/schema/puzzles';
import { users } from '../drizzle/schema/users';

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_RULES: Record<Difficulty, { lives: number; pointsPerCorrect: number }> = {
  easy: { lives: 5, pointsPerCorrect: 1 },
  medium: { lives: 3, pointsPerCorrect: 2 },
  hard: { lives: 2, pointsPerCorrect: 3 },
};

export class GameSessionService {
  /**
   * Finalise a game: mark completed (if score > 0) or abandoned (if score = 0),
   * and update the user's overall high score atomically.
   * Idempotent — calling twice on an already-ended game is a no-op.
   */
  private static async finalizeGame(userId: string, gameId: string) {
    const game = await db.query.games.findFirst({
      where: and(eq(games.id, gameId), eq(games.userId, userId)),
    });
    if (!game) return null;
    if (game.status !== 'in_progress') return game;

    // Score 0 → abandoned (no clutter in history, no high-score change)
    // Score > 0 → completed (counts toward stats and high score)
    const finalStatus = game.score > 0 ? 'completed' : 'abandoned';

    await db
      .update(games)
      .set({ status: finalStatus, endedAt: new Date() })
      .where(eq(games.id, gameId));

    if (game.score > 0) {
      await db
        .update(users)
        .set({
          highScore: sql`GREATEST(${users.highScore}, ${game.score})`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return { ...game, status: finalStatus };
  }

  /**
   * Compute per-difficulty bests from completed games.
   */
  private static async getHighScoresForUser(userId: string): Promise<Record<Difficulty, number>> {
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

  /**
   * Create a new game session. First finalises any orphaned in-progress
   * games for this user — safety net if the client failed to call /end
   * (tab crash, network blip, beforeunload didn't fire).
   */
  static async startGame(userId: string, difficulty: Difficulty) {
    const rules = DIFFICULTY_RULES[difficulty];
    if (!rules) throw new Error('Invalid difficulty');

    // Clean up orphaned sessions from previous attempts
    const orphans = await db.query.games.findMany({
      where: and(eq(games.userId, userId), eq(games.status, 'in_progress')),
    });
    for (const g of orphans) {
      await this.finalizeGame(userId, g.id);
    }

    // Create the new game
    const [game] = await db
      .insert(games)
      .values({
        userId,
        difficulty,
        lives: rules.lives,
        score: 0,
        status: 'in_progress',
      })
      .returning({ id: games.id });

    const highScores = await this.getHighScoresForUser(userId);

    return {
      gameId: game.id,
      difficulty,
      lives: rules.lives,
      score: 0,
      pointsPerCorrect: rules.pointsPerCorrect,
      highScores,
      difficultyBest: highScores[difficulty],
    };
  }

  static async submitAnswer(
    userId: string,
    gameId: string,
    puzzleId: string,
    userAnswer: string
  ) {
    const game = await db.query.games.findFirst({
      where: and(eq(games.id, gameId), eq(games.userId, userId)),
    });

    if (!game) throw new Error('Game not found');
    if (game.status !== 'in_progress') throw new Error('Game already ended');
    if (game.lives <= 0) throw new Error('No lives remaining');

    const puzzle = await db.query.puzzles.findFirst({
      where: eq(puzzles.id, puzzleId),
    });
    if (!puzzle) throw new Error('Puzzle not found');

    const correct = puzzle.solution.trim() === String(userAnswer).trim();
    const pointsPerCorrect = DIFFICULTY_RULES[game.difficulty].pointsPerCorrect;
    const pointsAwarded = correct ? pointsPerCorrect : 0;
    const newLives = correct ? game.lives : game.lives - 1;
    const newScore = game.score + pointsAwarded;
    const gameOver = newLives <= 0;

    await db.transaction(async (tx) => {
      await tx.insert(answers).values({
        gameId,
        puzzleId,
        userAnswer,
        isCorrect: correct,
        timeTakenMs: 0,
        attemptNumber: 1,
      });

      await tx
        .update(games)
        .set({
          score: newScore,
          lives: newLives,
          status: gameOver ? 'completed' : 'in_progress',
          endedAt: gameOver ? new Date() : null,
        })
        .where(eq(games.id, gameId));
    });

    // If the game ended via lives = 0, ALSO update the overall high score
    if (gameOver && newScore > 0) {
      await db
        .update(users)
        .set({
          highScore: sql`GREATEST(${users.highScore}, ${newScore})`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return {
      correct,
      correctAnswer: correct ? undefined : puzzle.solution,
      pointsAwarded,
      score: newScore,
      lives: newLives,
      gameOver,
    };
  }

  /**
   * Explicit end (client called /end). Idempotent.
   * Returns per-difficulty high scores so the UI can update the banner.
   */
  static async endGame(userId: string, gameId: string) {
    const result = await this.finalizeGame(userId, gameId);
    if (!result) throw new Error('Game not found');

    const highScores = await this.getHighScoresForUser(userId);
    const difficulty = result.difficulty as Difficulty;
    const difficultyBest = highScores[difficulty];

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { highScore: true },
    });

    return {
      finalScore: result.score,
      difficulty,
      status: result.status,
      highScores,
      difficultyBest,
      highScore: user?.highScore ?? 0,
      isNewRecord: result.score > 0 && result.score === difficultyBest,
    };
  }
}
