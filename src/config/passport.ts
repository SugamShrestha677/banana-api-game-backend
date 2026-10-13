// backend/src/config/passport.ts
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import passport from 'passport';
import { db } from '../drizzle/db';
import { users } from '../drizzle/schema/users';
import { eq } from 'drizzle-orm';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: 'http://localhost:4000/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user already exists with this Google ID
      let user = await db.query.users.findFirst({
        where: eq(users.googleId, profile.id),
      });

      // If not, create a new user
      if (!user) {
        const email = profile.emails?.[0].value;
        if (!email) return done(new Error('No email from Google'), undefined);

        // Also check if a user with this email exists (account linking)
        user = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (user) {
          // Link the Google ID to the existing account
          await db.update(users).set({ googleId: profile.id }).where(eq(users.id, user.id));
          user.googleId = profile.id;
        } else {
          // Create a brand new user
          const [newUser] = await db.insert(users).values({
            email: email,
            username: profile.displayName.replace(/\s/g, ''),
            googleId: profile.id,
            avatarUrl: profile.photos?.[0].value,
            emailVerified: true, // Google verified the email
          }).returning();
          user = newUser;
        }
      }
      return done(null, user);
    } catch (error) {
      return done(error as Error, undefined);
    }
  }
));