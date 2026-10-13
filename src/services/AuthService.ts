// backend/src/services/AuthService.ts
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { refreshTokens } from '../drizzle/schema/auth';
import { eq } from 'drizzle-orm';

export class AuthService {
  // ─── REGISTER ────────────────────────────────────────
  static async register(email: string, username: string, password: string) {
    const passwordHash = await argon2.hash(password);

    const [newUser] = await db
      .insert(users)
      .values({ email, username, passwordHash, emailVerified: false })
      .returning({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
      });

    const accessToken = this.generateAccessToken(newUser);
    const refreshToken = await this.generateRefreshToken(newUser.id);
    return { user: newUser, accessToken, refreshToken };
  }

  // ─── LOGIN ───────────────────────────────────────────
  static async login(email: string, password: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    // Generic error to prevent user enumeration
    if (!user || !user.passwordHash) throw new Error('Invalid credentials');

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) throw new Error('Invalid credentials');

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  // ─── LOGOUT ──────────────────────────────────────────
  static async logout(refreshToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Mark as revoked instead of deleting, for audit trail
    await db
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.tokenHash, tokenHash));
  }

  // ─── REFRESH ─────────────────────────────────────────
  static async refresh(rawRefreshToken: string) {
    // 1. Hash the incoming token to compare against the stored hash
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawRefreshToken)
      .digest('hex');

    // 2. Look up the stored token
    const stored = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });

    if (!stored) throw new Error('Invalid refresh token');
    if (stored.revoked) throw new Error('Refresh token revoked');
    if (stored.expiresAt < new Date()) throw new Error('Refresh token expired');

    // 3. Load the user
    const user = await db.query.users.findFirst({
      where: eq(users.id, stored.userId),
    });
    if (!user) throw new Error('User not found');

    // 4. Issue a fresh access token
    const accessToken = this.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return { accessToken };
  }

  // ─── GOOGLE OAUTH ────────────────────────────────────
  /**
   * Called after Passport successfully authenticates a Google user.
   * Issues our own access + refresh tokens for the app session.
   */
  static async handleGoogleLogin(user: {
    id: string;
    email: string;
    role: string;
  }) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  // ─── PRIVATE HELPERS ─────────────────────────────────
  private static generateAccessToken(user: {
    id: string;
    email: string;
    role: string;
  }) {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: '15m' }
    );
  }

  private static async generateRefreshToken(userId: string) {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
    return rawToken; // RAW token returned; hash is what's stored
  }
}
