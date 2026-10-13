import { db } from '../drizzle/db';
import { puzzles } from '../drizzle/schema/puzzles';
import { eq, sql } from 'drizzle-orm';

const BANANA_API = 'http://marcconrad.com/uob/banana/api.php';

type BananaApiResponse = {
  question: string;   // image URL
  solution: number;   // correct answer
};

export class PuzzleService {
  /**
   * Returns a puzzle WITHOUT the solution.
   * Frontend gets { id, imageUrl } — never the answer.
   */
  static async getNewPuzzle() {
    // 1. Try a cached, unused puzzle first (faster, saves API calls)
    const cached = await db.query.puzzles.findFirst({
      where: eq(puzzles.usedCount, 0),
      orderBy: sql`RANDOM()`,
    });

    if (cached) {
      await db
        .update(puzzles)
        .set({ usedCount: sql`${puzzles.usedCount} + 1` })
        .where(eq(puzzles.id, cached.id));

      return { id: cached.id, imageUrl: cached.imageUrl };
    }

    // 2. Cache empty — fetch fresh from Banana API
    const response = await fetch(BANANA_API);
    if (!response.ok) {
      throw new Error(`Banana API returned ${response.status}`);
    }

    const data = (await response.json()) as BananaApiResponse;
    if (!data.question || data.solution === undefined) {
      throw new Error('Malformed response from Banana API');
    }

    // 3. Store in DB, mark as used immediately
    const [saved] = await db
      .insert(puzzles)
      .values({
        imageUrl: data.question,
        solution: String(data.solution),
        source: 'banana_api',
        usedCount: 1,
      })
      .returning();

    return { id: saved.id, imageUrl: saved.imageUrl };
  }

  /**
   * Validates a user's answer against the stored solution.
   * Compares as strings to handle "1" vs 1 gracefully.
   */
  static async validateAnswer(puzzleId: string, userAnswer: string) {
    const puzzle = await db.query.puzzles.findFirst({
      where: eq(puzzles.id, puzzleId),
    });

    if (!puzzle) throw new Error('Puzzle not found');

    const correct =
      puzzle.solution.trim() === String(userAnswer).trim();

    return { correct, correctAnswer: correct ? undefined : puzzle.solution };
  }
}
