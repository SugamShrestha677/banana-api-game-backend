// backend/src/services/AuthService.ts
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { refreshTokens, passwordResetOtps  } from '../drizzle/schema/auth';
import { eq, and } from 'drizzle-orm';

function httpError(message: string, status: number): Error {
  const err = new Error(message);
  (err as any).status = status;
  return err;
}

export class AuthService {
  // ─── REGISTER ────────────────────────────────────────
  static async register(email: string, username: string, password: string) {
    // Input validation
    if (!email || !email.includes('@')) {
      throw httpError('A valid email address is required', 400);
    }
    if (!username || username.length < 3) {
      throw httpError('Username must be at least 3 characters', 400);
    }
    if (!password || password.length < 6) {
      throw httpError('Password must be at least 6 characters', 400);
    }

    try {
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
    } catch (error: any) {
      const code = error?.code ?? error?.cause?.code;
      const constraint = error?.constraint ?? error?.cause?.constraint;

      // Unique constraint violations (Postgres 23505)
      if (code === '23505') {
        if (constraint === 'users_email_unique') {
          throw httpError(
            'This email is already registered. Try logging in, or use Google sign-in if you registered with Google.',
            409
          );
        }
        if (constraint === 'users_username_unique') {
          throw httpError(
            'This username is already taken. Please choose a different one.',
            409
          );
        }
        if (constraint === 'users_google_id_unique') {
          throw httpError(
            'This Google account is already linked to another user.',
            409
          );
        }
        throw httpError('A duplicate value was submitted', 409);
      }

      // Other known Postgres errors
      if (code === '23502') throw httpError('A required field is missing', 400);
      if (code === '22001') throw httpError('One of your inputs is too long', 400);

      // Anything else — log server-side, return generic message
      console.error('[register] Unhandled DB error:', error);
      throw httpError('Could not create your account. Please try again.', 500);
    }
  }

  // ─── LOGIN ───────────────────────────────────────────
  static async login(email: string, password: string) {
    if (!email || !password) {
      throw httpError('Email and password are required', 400);
    }

    // ── 1. DB query (isolated — DB failure ≠ auth failure) ──
    let user;
    try {
      user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
    } catch (error) {
      console.error('[login] DB query failed:', error);
      throw httpError('Could not log you in. Please try again.', 500);
    }

    // ── 2. Auth check (generic message — prevents user enumeration) ──
    if (!user || !user.passwordHash) {
      throw httpError('Invalid email or password', 401);
    }

    let isValid = false;
    try {
      isValid = await argon2.verify(user.passwordHash, password);
    } catch (error) {
      // Corrupted hash in DB — treat as auth failure, log for ops
      console.error('[login] Hash verification failed:', error);
      throw httpError('Invalid email or password', 401);
    }

    if (!isValid) {
      throw httpError('Invalid email or password', 401);
    }

    // ── 3. Token generation (isolated — auth succeeded, session failed) ──
    try {
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
    } catch (error) {
      console.error('[login] Token generation failed:', error);
      throw httpError('Could not complete login. Please try again.', 500);
    }
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

// ─── FORGOT PASSWORD ─────────────────────────────────
static async requestPasswordReset(email: string) {
  if (!email) {
    throw httpError('Email is required', 400);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  // IMPORTANT: Always respond the same, whether user exists or not.
  // Prevents user enumeration. Do not throw here.
  if (!user) return { message: 'If an account exists, an OTP has been sent.' };

  // Invalidate any earlier unused OTPs for this user
  await db
    .update(passwordResetOtps)
    .set({ used: true })
    .where(
      and(
        eq(passwordResetOtps.userId, user.id),
        eq(passwordResetOtps.used, false)
      )
    );

  // Generate a 6-digit OTP (cryptographically random)
  const otp = String(crypto.randomInt(100_000, 1_000_000));
  const otpHash = await argon2.hash(otp);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(passwordResetOtps).values({
    userId: user.id,
    otpHash,
    expiresAt,
  });

  // ─── MOCK EMAIL: print OTP to terminal ─────────────
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         🍌  BANANA GAME — OTP CODE           ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Email: ${email.padEnd(36)}║`);
  console.log(`║  OTP:   ${otp.padEnd(36)}║`);
  console.log('║  Expires in: 10 minutes                      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  return { message: 'If an account exists, an OTP has been sent.' };
}

// ─── RESET PASSWORD ──────────────────────────────────
static async resetPassword(email: string, otp: string, newPassword: string) {
  if (!email || !otp || !newPassword) {
    throw httpError('Email, OTP, and new password are required', 400);
  }
  if (newPassword.length < 6) {
    throw httpError('Password must be at least 6 characters', 400);
  }
  if (!/^\d{6}$/.test(otp)) {
    throw httpError('OTP must be 6 digits', 400);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  // Same generic message regardless of whether user exists
  if (!user) {
    throw httpError('Invalid or expired OTP', 400);
  }

  // Find the most recent unused OTP for this user
  const record = await db.query.passwordResetOtps.findFirst({
    where: and(
      eq(passwordResetOtps.userId, user.id),
      eq(passwordResetOtps.used, false)
    ),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  if (!record) throw httpError('Invalid or expired OTP', 400);
  if (record.expiresAt < new Date()) throw httpError('OTP has expired', 400);

  // Verify OTP against the stored hash
  const isValid = await argon2.verify(record.otpHash, otp);
  if (!isValid) throw httpError('Invalid or expired OTP', 400);

  // Everything checks out — apply the changes in a transaction
  const passwordHash = await argon2.hash(newPassword);

  await db.transaction(async (tx) => {
    // 1. Update password
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // 2. Mark OTP used
    await tx
      .update(passwordResetOtps)
      .set({ used: true })
      .where(eq(passwordResetOtps.id, record.id));

    // 3. Revoke ALL refresh tokens for this user → log them out everywhere
    await tx
      .update(refreshTokens)
      .set({ revoked: true })
      .where(eq(refreshTokens.userId, user.id));
  });

  return { message: 'Password reset successfully. Please log in again.' };
}

}

