import { Request, Response } from 'express';
import { LeaderboardService } from '../services/LeaderboardService';

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
type Difficulty = (typeof VALID_DIFFICULTIES)[number];

export class LeaderboardController {
  static async get(req: Request, res: Response) {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const difficultyParam = req.query.difficulty as string | undefined;
      const difficulty: Difficulty | null =
        difficultyParam && (VALID_DIFFICULTIES as readonly string[]).includes(difficultyParam)
          ? (difficultyParam as Difficulty)
          : null;

      const { entries, total } = await LeaderboardService.getLeaderboard(
        difficulty,
        limit,
        offset
      );

      let currentUser = null;
      if (req.userId) {
        currentUser = await LeaderboardService.getUserRank(req.userId, difficulty);
      }

      res.json({ entries, currentUser, total, difficulty });
    } catch (error) {
      console.error('[leaderboard] Unhandled:', error);
      res.status(500).json({ error: 'Could not load leaderboard. Please try again.' });
    }
  }
}
