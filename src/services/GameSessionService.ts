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
   * Create a new game session with the chosen difficulty.
   * Returns the game ID so subsequent answers can be tied to it.
   */
  static async startGame(userId: string, difficulty: Difficulty) {
    const rules = DIFFICULTY_RULES[difficulty];
    if (!rules) throw new Error('Invalid difficulty');

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

    return {
      gameId: game.id,
      lives: rules.lives,
      score: 0,
      difficulty,
    };
  }

  /**
   * Validate an answer and atomically update the game state.
   * Server computes the score delta — client cannot inflate it.
   */
  static async submitAnswer(
    userId: string,
    gameId: string,
    puzzleId: string,
    userAnswer: string
  ) {
    // Load game and verify ownership + in-progress
    const game = await db.query.games.findFirst({
      where: and(eq(games.id, gameId), eq(games.userId, userId)),
    });

    if (!game) throw new Error('Game not found');
    if (game.status !== 'in_progress') throw new Error('Game already ended');
    if (game.lives <= 0) throw new Error('No lives remaining');

    // Look up the puzzle solution
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

    // Atomic update + answer log
    await db.transaction(async (tx) => {
      await tx.insert(answers).values({
        gameId,
        puzzleId,
        userAnswer,
        isCorrect: correct,
        timeTakenMs: 0, // could compute server-side if you track time
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
   * End the game and atomically update the user's high score
   * if this game beat their previous best.
   */
  static async endGame(userId: string, gameId: string) {
    const game = await db.query.games.findFirst({
      where: and(eq(games.id, gameId), eq(games.userId, userId)),
    });
    if (!game) throw new Error('Game not found');

    // Update the game status if still in_progress
    if (game.status === 'in_progress') {
      await db
        .update(games)
        .set({ status: 'completed', endedAt: new Date() })
        .where(eq(games.id, gameId));
    }

    // Update user's high score if this game beat it
    const [updated] = await db
      .update(users)
      .set({
        highScore: sql`GREATEST(${users.highScore}, ${game.score})`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ highScore: users.highScore });

    return {
      finalScore: game.score,
      highScore: updated.highScore,
      isNewRecord: game.score >= updated.highScore && game.score > 0,
    };
  }
}
