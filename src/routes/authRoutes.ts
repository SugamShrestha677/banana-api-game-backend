import { Router } from 'express';
import passport from 'passport';
import { AuthController } from '../controllers/AuthController';

const router = Router();

// ─── Local auth ────────────────────────────────────────
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh', AuthController.refresh);

// ─── Google OAuth ──────────────────────────────────────
// Step 1: Redirect user to Google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

// Step 2: Google redirects back here
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: 'http://localhost:3000/login?error=oauth_failed',
  }),
  AuthController.googleCallback
);

export default router;
