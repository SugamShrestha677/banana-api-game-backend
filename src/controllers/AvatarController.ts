import { Request, Response } from 'express';
import { AvatarService } from '../services/AvatarService';

export class AvatarController {
  static async upload(req: Request, res: Response) {
    try {
      // req.file is populated by multer
      if (!req.file) {
        return res.status(400).json({ error: 'No image file provided.' });
      }

      // Validate MIME type
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(req.file.mimetype)) {
        return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' });
      }

      const result = await AvatarService.updateAvatar(
        req.userId!,
        req.file.buffer,
        req.file.mimetype
      );

      res.json(result);
    } catch (error) {
      console.error('[avatar upload]', error);
      res.status(500).json({ error: 'Could not upload profile picture.' });
    }
  }
}