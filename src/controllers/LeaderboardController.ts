import { Request, Response } from 'express';
import { LeaderboardService } from '../services/LeaderboardService';

export class LeaderboardController {
  static async get(req: Request, res: Response) {
    try {
      // Parse pagination — clamp to sane bounds
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const { entries, total } = await LeaderboardService.getLeaderboard(limit, offset);

      // If authenticated, also fetch the caller's rank
      let currentUser = null;
      if (req.userId) {
        currentUser = await LeaderboardService.getUserRank(req.userId);
      }

      res.json({ entries, currentUser, total });
    } catch (error: any) {
      console.error('[leaderboard] Unhandled:', error);
      res.status(500).json({ error: 'Could not load leaderboard. Please try again.' });
    }
  }
}
