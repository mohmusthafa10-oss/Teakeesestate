import { NextFunction, Request, Response } from 'express';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { CRMUserRole, users } from '../db/schema.ts';
import { ensureInitialSeed } from '../db/seed.ts';

export type CRMAuthenticatedUser = typeof users.$inferSelect;

export interface AuthRequest extends Request {
  firebaseUid?: string;
  firebaseEmail?: string;
  crmUser?: CRMAuthenticatedUser;
}

async function resolveUserFromFirebase(
  uid: string,
  email: string | undefined,
  displayName: string | undefined
): Promise<CRMAuthenticatedUser | null> {
  await ensureInitialSeed();

  // 1. Existing user already linked to this Firebase UID
  const byUid = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  if (byUid[0]) {
    if (email && byUid[0].email !== email) {
      const [updated] = await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, byUid[0].id))
        .returning();
      return updated;
    }
    return byUid[0];
  }

  // 2. Match pre-invited team member by email (case-insensitive)
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    const byEmail = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${cleanEmail}`)
      .limit(1);

    if (byEmail[0]) {
      const [linked] = await db
        .update(users)
        .set({
          uid,
          name: byEmail[0].name || displayName || cleanEmail.split('@')[0],
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail[0].id))
        .returning();
      return linked;
    }
  }

  // 3. First-run Admin bootstrap: if no ADMIN account has a Firebase UID yet,
  //    allow the first verified Google user to claim ADMIN access safely.
  const existingAdminWithUid = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'ADMIN'), isNotNull(users.uid)))
    .limit(1);

  if (!existingAdminWithUid[0] && email) {
    const [created] = await db
      .insert(users)
      .values({
        uid,
        name: displayName?.trim() || email.split('@')[0],
        email: email.trim().toLowerCase(),
        phone: '',
        role: 'ADMIN',
        designation: 'Managing Administrator',
        active: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: email.trim().toLowerCase(), updatedAt: new Date() },
      })
      .returning();
    return created;
  }

  return null;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication token missing.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email;

    const crmUser = await resolveUserFromFirebase(
      decoded.uid,
      decoded.email,
      decoded.name
    );

    if (!crmUser) {
      res.status(403).json({
        error:
          'Your Google account is not yet authorized in Teakees CRM. Ask an Administrator to invite your email under Team & Roles.',
      });
      return;
    }

    if (!crmUser.active) {
      res.status(403).json({
        error: 'Your CRM user account has been deactivated by an Administrator.',
      });
      return;
    }

    req.crmUser = crmUser;
    next();
  } catch (err) {
    console.error('Firebase token verification error:', err);
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const requireRole = (...allowedRoles: CRMUserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.crmUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.crmUser.role)) {
      res.status(403).json({
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
};
