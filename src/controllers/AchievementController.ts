import { Request, Response } from 'express';
import { AchievementService } from '../services/AchievementService';

export class AchievementController {
  static async getAchievements(req: Request, res: Response) {
    try {
      const data = await AchievementService.getUserAchievements(req.userId!);
      res.json(data);
    } catch (error) {
      console.error('[AchievementController] Error getting achievements:', error);
      res.status(500).json({ error: 'Failed to load achievements.' });
    }
  }
}
