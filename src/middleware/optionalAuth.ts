import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from "dotenv";
dotenv.config();

type AuthPayload = { sub: string; email: string; role: string };
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_ACCESS_SECRET!) as unknown as AuthPayload;
    req.userId = payload.sub;
    req.userRole = payload.role;
  } catch {
    // Invalid token — treat as anonymous, don't block
  }
  next();
}