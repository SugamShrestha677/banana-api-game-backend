// backend/src/app.ts
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes';
import passport from 'passport';
import './config/passport'
import puzzleRoutes from './routes/puzzleRoutes';
// import {userRoutes} from './routes/userRoute'
import leaderboardRoutes from './routes/leaderboardRoutes';
import userRoutes from './routes/userRoute';
const app = express();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/leaderboard', leaderboardRoutes);


export default app;