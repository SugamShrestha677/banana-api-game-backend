// backend/src/services/PuzzleService.ts
import { db } from '../drizzle/db';
import { puzzles } from '../drizzle/schema/puzzles';
import { eq, sql } from 'drizzle-orm';

export class PuzzleService {
  private static readonly API_URL = 'http://marcconrad.com/uob/banana/api.php';

  static async getNewPuzzle() {
    // 1. Try to get an unused puzzle from the cache first
    let puzzle = await db.query.puzzles.findFirst({
      where: eq(puzzles.usedCount, 0),
      orderBy: sql`RANDOM()`,
    });

    if (puzzle) {
      // Mark as used
      await db.update(puzzles).set({ usedCount: sql`${puzzles.usedCount} + 1` }).where(eq(puzzles.id, puzzle.id));
      return puzzle;
    }

    // 2. If cache is empty, fetch a new puzzle from the Banana API
    const response = await fetch(this.API_URL);
    const data = await response.json();

    // 3. Store in the database
    const [newPuzzle] = await db.insert(puzzles).values({
      imageUrl: data.question,
      solution: data.solution.toString(),
      source: 'banana_api',
    }).returning();

    return newPuzzle;
  }
}