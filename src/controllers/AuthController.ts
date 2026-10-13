import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

// Cookie options reused across register/login/googleCallback
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  // ─── REGISTER ────────────────────────────────────────
  static async register(req: Request, res: Response) {
    try {
      const { email, username, password } = req.body;

      if (!email || !username || !password) {
        return res.status(400).json({ error: 'Email, username and password are required' });
      }

      const { user, accessToken, refreshToken } = await AuthService.register(
        email,
        username,
        password
      );

      res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
      res.status(201).json({ user, accessToken });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  }

  // ─── LOGIN ───────────────────────────────────────────
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const { user, accessToken, refreshToken } = await AuthService.login(email, password);

      res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
      res.json({ user, accessToken });
    } catch (error) {
      // 401 for auth failures; use a generic message to prevent user enumeration
      res.status(401).json({ error: (error as Error).message });
    }
  }

  // ─── LOGOUT ──────────────────────────────────────────
  static async logout(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (refreshToken) {
        await AuthService.logout(refreshToken);
      }

      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      res.json({ message: 'Logged out' });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  }

  // ─── REFRESH ─────────────────────────────────────────
  static async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies?.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
      }

      const { accessToken } = await AuthService.refresh(refreshToken);
      res.json({ accessToken });
    } catch (error) {
      res.status(401).json({ error: (error as Error).message });
    }
  }

  // ─── GOOGLE OAUTH CALLBACK ───────────────────────────
  static async googleCallback(req: Request, res: Response) {
    try {
      const user = req.user as { id: string; email: string; role: string };

      if (!user) {
        return res.redirect('http://localhost:3000/login?error=oauth_failed');
      }

      const { accessToken, refreshToken } = await AuthService.handleGoogleLogin(user);

      res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);
      res.redirect(`http://localhost:3000/auth/callback?token=${accessToken}`);
    } catch (error) {
      console.error('Google OAuth callback error:', error);
      res.redirect('http://localhost:3000/login?error=oauth_failed');
    }
  }
}
