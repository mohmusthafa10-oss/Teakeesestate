import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { Request, Response } from 'express';
import multer from 'multer';
import { and, count, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  auditLogs,
  CRMUserRole,
  notifications,
  properties,
  propertyAssignments,
  propertyFollowUps,
  propertyMedia,
  propertyPublicationHistory,
  propertySubmissionHistory,
  propertySubmissions,
  sellers,
  users,
} from '../db/schema.ts';
import { ensureInitialSeed } from '../db/seed.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';
import {
  MAX_PHOTOS_PER_SUBMISSION,
  MAX_VIDEOS_PER_SUBMISSION,
  mediaStorage,
} from './mediaStorage.ts';
import {
  assignPropertyAgentTx,
  checkPublicRateLimit,
  computeEffectiveContactStatus,
  convertSubmissionToPropertyTx,
  createNotification,
  findRecentDuplicateSubmission,
  generateNextSellerCode,
  generateNextTakCode,
  generateSubmissionReference,
  listMediaForPropertyIds,
  recordAuditLog,
  serializeMediaDTO,
  serializePublicPropertyDTO,
  setPropertyPublishedStateTx,
} from './crmWorkflowService.ts';

const stagingDir = path.join(os.tmpdir(), 'teakees-upload-staging');
fs.mkdirSync(stagingDir, { recursive: true });

const upload = multer({
  dest: stagingDir,
  limits: {
    fileSize: (Math.max(1, Number(process.env.MAX_VIDEO_SIZE_MB) || 100)) * 1024 * 1024,
    files: MAX_PHOTOS_PER_SUBMISSION + MAX_VIDEOS_PER_SUBMISSION,
  },
});

const uploadFields = upload.fields([
  { name: 'photos', maxCount: MAX_PHOTOS_PER_SUBMISSION },
  { name: 'videos', maxCount: MAX_VIDEOS_PER_SUBMISSION },
  { name: 'files', maxCount: MAX_PHOTOS_PER_SUBMISSION + MAX_VIDEOS_PER_SUBMISSION },
]);

function collectMulterFiles(req: Request): Express.Multer.File[] {
  const f = req.files as Record<string, Express.Multer.File[]> | Express.Multer.File[] | undefined;
  if (!f) return [];
  if (Array.isArray(f)) return f;
  return [...(f.photos || []), ...(f.videos || []), ...(f.files || [])];
}

async function cleanupStagingFiles(files: Express.Multer.File[]): Promise<void> {
  await Promise.all(
    files.map((file) => fs.promises.unlink(file.path).catch(() => {}))
  );
}

const submissionBodySchema = z.object({
  sellerName: z.string().trim().min(2, 'Seller name is required').max(120),
  mobileNumber: z.string().trim().min(7, 'Valid mobile number is required').max(30),
  propertyType: z.string().trim().min(2, 'Property type is required').max(60),
  location: z.string().trim().min(2, 'Property location is required').max(200),
  district: z.string().trim().max(100).optional(),
  panchayath: z.string().trim().max(120).optional(),
  locality: z.string().trim().max(120).optional(),
  shortDescription: z.string().trim().min(5, 'Short property description is required').max(3000),
  expectedPrice: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().nonnegative().nullable().optional()
  ),
  propertySize: z.string().trim().max(80).optional(),
  bedrooms: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(50).nullable().optional()
  ),
  bathrooms: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(50).nullable().optional()
  ),
  additionalNotes: z.string().trim().max(2000).optional(),
});

async function saveSubmissionWithMedia(params: {
  body: z.infer<typeof submissionBodySchema>;
  files: Express.Multer.File[];
  source: 'PUBLIC' | 'TELECALLER';
  actor?: typeof users.$inferSelect;
}) {
  const savedMediaKeys: Array<{ storageKey: string; thumbnailStorageKey: string | null }> = [];
  const preparedMedia: Array<{
    originalFilename: string;
    storageKey: string;
    thumbnailStorageKey: string | null;
    mediaCategory: 'PHOTO' | 'VIDEO';
    mimeType: string;
    fileType: string;
    fileSize: number;
    displayOrder: number;
    isCover: boolean;
  }> = [];

  try {
    let photoCount = 0;
    let videoCount = 0;

    for (let idx = 0; idx < params.files.length; idx++) {
      const f = params.files[idx];
      const saved = await mediaStorage.saveFile(f.path, f.originalname);
      savedMediaKeys.push({
        storageKey: saved.storageKey,
        thumbnailStorageKey: saved.thumbnailStorageKey,
      });

      if (saved.mediaCategory === 'PHOTO') {
        photoCount += 1;
        if (photoCount > MAX_PHOTOS_PER_SUBMISSION) {
          throw new Error(`Maximum ${MAX_PHOTOS_PER_SUBMISSION} photos allowed per submission.`);
        }
      } else {
        videoCount += 1;
        if (videoCount > MAX_VIDEOS_PER_SUBMISSION) {
          throw new Error(`Maximum ${MAX_VIDEOS_PER_SUBMISSION} videos allowed per submission.`);
        }
      }

      preparedMedia.push({
        originalFilename: saved.sanitizedOriginalName,
        storageKey: saved.storageKey,
        thumbnailStorageKey: saved.thumbnailStorageKey,
        mediaCategory: saved.mediaCategory,
        mimeType: saved.mimeType,
        fileType: saved.fileType,
        fileSize: saved.fileSize,
        displayOrder: idx,
        isCover: saved.mediaCategory === 'PHOTO' && photoCount === 1,
      });
    }

    const now = new Date();
    const deadline = new Date(now.getTime() + 48 * 3600_000);
    const referenceNumber = generateSubmissionReference();

    const created = await db.transaction(async (tx) => {
      const [sub] = await tx
        .insert(propertySubmissions)
        .values({
          referenceNumber,
          sellerName: params.body.sellerName,
          mobileNumber: params.body.mobileNumber,
          propertyType: params.body.propertyType,
          location: params.body.location,
          district: params.body.district || '',
          panchayath: params.body.panchayath || '',
          locality: params.body.locality || '',
          shortDescription: params.body.shortDescription,
          expectedPrice: params.body.expectedPrice ?? null,
          propertySize: params.body.propertySize || null,
          bedrooms: params.body.bedrooms ?? null,
          bathrooms: params.body.bathrooms ?? null,
          additionalNotes: params.body.additionalNotes || null,
          source: params.source,
          submittedByUserId: params.actor?.id ?? null,
          status: 'PENDING_REVIEW',
          submittedAt: now,
          contactDeadlineAt: deadline,
          contactStatus: 'PENDING',
        })
        .returning();

      if (preparedMedia.length > 0) {
        await tx.insert(propertyMedia).values(
          preparedMedia.map((m) => ({
            submissionId: sub.id,
            originalFilename: m.originalFilename,
            storageKey: m.storageKey,
            fileType: m.fileType,
            mimeType: m.mimeType,
            fileSize: m.fileSize,
            mediaCategory: m.mediaCategory,
            displayOrder: m.displayOrder,
            isCover: m.isCover,
            thumbnailStorageKey: m.thumbnailStorageKey,
            uploadedBy: params.actor?.id ?? null,
          }))
        );
      }

      await tx.insert(propertySubmissionHistory).values({
        submissionId: sub.id,
        actorId: params.actor?.id ?? null,
        actorName: params.actor?.name || params.body.sellerName,
        action: 'SUBMITTED',
        newStatus: 'PENDING_REVIEW',
        notes:
          params.source === 'TELECALLER'
            ? `Telecaller submission (${preparedMedia.length} media file(s))`
            : `Public seller submission (${preparedMedia.length} media file(s))`,
      });

      await createNotification(tx, {
        recipientRole: 'ADMIN',
        eventType:
          params.source === 'TELECALLER'
            ? 'TELECALLER_SUBMISSION_CREATED'
            : 'PUBLIC_SUBMISSION_CREATED',
        title: `New Property Submission ${sub.referenceNumber}`,
        message: `${sub.sellerName} submitted a ${sub.propertyType} in ${sub.location} (${photoCount} photos, ${videoCount} videos). 48h contact SLA active.`,
        entityType: 'PropertySubmission',
        entityId: sub.id,
      });

      await recordAuditLog(tx, {
        actorId: params.actor?.id ?? null,
        actorName: params.actor?.name || params.body.sellerName,
        actorRole: params.actor?.role || 'PUBLIC_SELLER',
        action:
          params.source === 'TELECALLER'
            ? 'TELECALLER_PROPERTY_SUBMITTED'
            : 'PUBLIC_PROPERTY_SUBMITTED',
        entityType: 'PropertySubmission',
        entityId: sub.id,
        newValue: {
          referenceNumber: sub.referenceNumber,
          propertyType: sub.propertyType,
          location: sub.location,
          photoCount,
          videoCount,
        },
      });

      return { sub, photoCount, videoCount };
    });

    return created;
  } catch (err) {
    // Rollback orphaned files if validation or DB fails
    await Promise.all(
      savedMediaKeys.map((k) => mediaStorage.deleteFile(k.storageKey, k.thumbnailStorageKey))
    );
    throw err;
  }
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  router.use('/public/property-submissions', (req, res, next) => {
    if (req.method === 'POST') {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!checkPublicRateLimit(ip, 10, 15 * 60_000)) {
        res.status(429).json({
          error: 'Too many submissions from your connection. Please try again in a few minutes.',
        });
        return;
      }
    }
    next();
  });

  // =========================================================================
  // 1. PUBLIC ENDPOINTS (No Authentication Required — Strict Sanitization)
  // =========================================================================

  router.post('/public/property-submissions', (req, res) => {
    uploadFields(req, res, async (uploadErr) => {
      const files = collectMulterFiles(req);
      try {
        await ensureInitialSeed();
        if (uploadErr) {
          res.status(400).json({ error: uploadErr.message || 'File upload failed.' });
          return;
        }

        const parsed = submissionBodySchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({
            error: parsed.error.issues[0]?.message || 'Invalid submission fields.',
          });
          return;
        }

        const dup = await findRecentDuplicateSubmission(
          parsed.data.mobileNumber,
          parsed.data.location,
          parsed.data.propertyType
        );
        if (dup) {
          res.status(409).json({
            error: `A similar submission (${dup.referenceNumber}) was recently received for this mobile number and location.`,
            referenceNumber: dup.referenceNumber,
          });
          return;
        }

        const { sub, photoCount, videoCount } = await saveSubmissionWithMedia({
          body: parsed.data,
          files,
          source: 'PUBLIC',
        });

        res.status(201).json({
          referenceNumber: sub.referenceNumber,
          status: sub.status,
          submittedAt: sub.submittedAt.toISOString(),
          contactDeadlineAt: sub.contactDeadlineAt.toISOString(),
          photoCount,
          videoCount,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to submit property.';
        res.status(400).json({ error: msg });
      } finally {
        await cleanupStagingFiles(files);
      }
    });
  });

  router.get('/public/properties', async (req, res) => {
    try {
      await ensureInitialSeed();
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 9));
      const offset = (page - 1) * limit;

      const search = String(req.query.search || '').trim();
      const propertyType = String(req.query.propertyType || '').trim();
      const location = String(req.query.location || '').trim();
      const minPrice = req.query.minPrice ? Number(req.query.minPrice) : null;
      const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : null;

      const conditions = [
        eq(properties.approvalStatus, 'APPROVED'),
        eq(properties.isPublished, true),
      ];

      if (propertyType && propertyType !== 'All') {
        conditions.push(eq(properties.type, propertyType));
      }
      if (location && location !== 'All') {
        conditions.push(ilike(properties.location, `%${location}%`));
      }
      if (minPrice !== null && Number.isFinite(minPrice) && minPrice > 0) {
        conditions.push(gte(properties.expectedPrice, minPrice));
      }
      if (maxPrice !== null && Number.isFinite(maxPrice) && maxPrice > 0) {
        conditions.push(lte(properties.expectedPrice, maxPrice));
      }
      if (search) {
        conditions.push(
          or(
            ilike(properties.title, `%${search}%`),
            ilike(properties.location, `%${search}%`),
            ilike(properties.description, `%${search}%`),
            ilike(properties.code, `%${search}%`)
          )!
        );
      }

      const whereClause = and(...conditions);

      const [{ total }] = await db
        .select({ total: count() })
        .from(properties)
        .where(whereClause);

      const rows = await db
        .select()
        .from(properties)
        .where(whereClause)
        .orderBy(desc(properties.publishedAt), desc(properties.id))
        .limit(limit)
        .offset(offset);

      const mediaRows = await listMediaForPropertyIds(rows.map((r) => r.id));
      const mediaByProp = new Map<number, (typeof propertyMedia.$inferSelect)[]>();
      for (const m of mediaRows) {
        if (!m.propertyId) continue;
        const arr = mediaByProp.get(m.propertyId) || [];
        arr.push(m);
        mediaByProp.set(m.propertyId, arr);
      }

      res.json({
        items: rows.map((p) =>
          serializePublicPropertyDTO(p, mediaByProp.get(p.id) || [])
        ),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      console.error('GET /public/properties error:', err);
      res.status(500).json({ error: 'Unable to load published properties.' });
    }
  });

  router.get('/public/properties/:idOrCode', async (req, res) => {
    try {
      await ensureInitialSeed();
      const raw = String(req.params.idOrCode || '').trim();
      const numId = /^\d+$/.test(raw) ? parseInt(raw, 10) : null;

      const [prop] = await db
        .select()
        .from(properties)
        .where(
          and(
            numId !== null ? eq(properties.id, numId) : ilike(properties.code, raw),
            eq(properties.approvalStatus, 'APPROVED'),
            eq(properties.isPublished, true)
          )
        )
        .limit(1);

      if (!prop) {
        res.status(404).json({ error: 'Property not found or not publicly listed.' });
        return;
      }

      const mediaRows = await listMediaForPropertyIds([prop.id]);
      res.json(serializePublicPropertyDTO(prop, mediaRows));
    } catch (err) {
      console.error('GET /public/properties/:id error:', err);
      res.status(500).json({ error: 'Unable to load property details.' });
    }
  });

  // Public media streaming — STRICTLY enforces approved + published parent property
  router.get('/public/media/:mediaId', async (req, res) => {
    try {
      const mediaId = parseInt(String(req.params.mediaId), 10);
      if (!Number.isFinite(mediaId)) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }

      const [row] = await db
        .select()
        .from(propertyMedia)
        .where(eq(propertyMedia.id, mediaId))
        .limit(1);

      if (!row || !row.propertyId) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }

      const [prop] = await db
        .select({
          id: properties.id,
          approvalStatus: properties.approvalStatus,
          isPublished: properties.isPublished,
        })
        .from(properties)
        .where(eq(properties.id, row.propertyId))
        .limit(1);

      if (!prop || prop.approvalStatus !== 'APPROVED' || !prop.isPublished) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }

      const useThumb = req.query.variant === 'thumb' && row.thumbnailStorageKey;
      const key = useThumb ? row.thumbnailStorageKey! : row.storageKey;
      const mime = useThumb ? 'image/webp' : row.mimeType;

      const { stream, statusCode, headers } = await mediaStorage.getStream(
        key,
        mime,
        req.headers.range
      );
      res.writeHead(statusCode, headers);
      stream.pipe(res);
    } catch (err) {
      res.status(404).json({ error: 'Media unavailable.' });
    }
  });

  // =========================================================================
  // 2. AUTHENTICATION & NOTIFICATIONS
  // =========================================================================

  router.get('/auth/me', requireAuth, async (req: AuthRequest, res: Response) => {
    const u = req.crmUser!;
    const [{ unreadCount }] = await db
      .select({ unreadCount: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.isRead, false),
          or(
            eq(notifications.recipientUserId, u.id),
            u.role === 'ADMIN' ? eq(notifications.recipientRole, 'ADMIN') : sql`false`
          )
        )
      );

    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        designation: u.designation,
        active: u.active,
      },
      unreadNotifications: unreadCount,
    });
  });

  router.get('/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
    const u = req.crmUser!;
    const rows = await db
      .select()
      .from(notifications)
      .where(
        or(
          eq(notifications.recipientUserId, u.id),
          u.role === 'ADMIN' ? eq(notifications.recipientRole, 'ADMIN') : sql`false`
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(40);
    res.json({ items: rows });
  });

  router.post(
    '/notifications/:id/read',
    requireAuth,
    async (req: AuthRequest, res: Response) => {
      const id = parseInt(String(req.params.id), 10);
      const u = req.crmUser!;
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'Invalid notification ID.' });
        return;
      }
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, id),
            or(
              eq(notifications.recipientUserId, u.id),
              u.role === 'ADMIN' ? eq(notifications.recipientRole, 'ADMIN') : sql`false`
            )
          )
        );
      res.json({ ok: true });
    }
  );

  // =========================================================================
  // 3. INTERNAL PROTECTED MEDIA STREAMING & MANAGEMENT
  // =========================================================================

  router.get('/media/:mediaId', async (req: AuthRequest, res: Response) => {
    try {
      const mediaId = parseInt(String(req.params.mediaId), 10);
      if (!Number.isFinite(mediaId)) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }

      const signedToken =
        typeof req.query.token === 'string' ? req.query.token : undefined;
      const hasSignedToken = mediaStorage.verifyMediaToken(mediaId, signedToken);

      if (!hasSignedToken) {
        // Fallback to strict Bearer Auth verification
        let authorized = false;
        await new Promise<void>((resolve) => {
          requireAuth(req, res, () => {
            authorized = true;
            resolve();
          });
        });
        if (!authorized || !req.crmUser) return;
      }

      const [row] = await db
        .select()
        .from(propertyMedia)
        .where(eq(propertyMedia.id, mediaId))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }

      // Enforce ownership when accessed via Bearer auth
      if (req.crmUser && req.crmUser.role !== 'ADMIN') {
        if (req.crmUser.role === 'TELECALLER') {
          if (!row.submissionId) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }
          const [sub] = await db
            .select({ submittedByUserId: propertySubmissions.submittedByUserId })
            .from(propertySubmissions)
            .where(eq(propertySubmissions.id, row.submissionId))
            .limit(1);
          if (!sub || sub.submittedByUserId !== req.crmUser.id) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }
        } else if (req.crmUser.role === 'AGENT') {
          if (!row.propertyId) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }
          const [prop] = await db
            .select({ assignedAgentId: properties.assignedAgentId })
            .from(properties)
            .where(eq(properties.id, row.propertyId))
            .limit(1);
          if (!prop || prop.assignedAgentId !== req.crmUser.id) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }
        }
      }

      const useThumb = req.query.variant === 'thumb' && row.thumbnailStorageKey;
      const key = useThumb ? row.thumbnailStorageKey! : row.storageKey;
      const mime = useThumb ? 'image/webp' : row.mimeType;

      const { stream, statusCode, headers } = await mediaStorage.getStream(
        key,
        mime,
        req.headers.range
      );

      if (req.query.download === '1') {
        headers['Content-Disposition'] = `attachment; filename="${row.originalFilename}"`;
      }
      res.writeHead(statusCode, headers);
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(404).json({ error: 'Media unavailable.' });
    }
  });

  // Shared handler for uploading media to an existing property (Admin: any; Agent: assigned only)
  const handlePropertyMediaUpload = (req: AuthRequest, res: Response) => {
    uploadFields(req, res, async (uploadErr) => {
      const files = collectMulterFiles(req);
      try {
        if (uploadErr) {
          res.status(400).json({ error: uploadErr.message || 'Upload failed.' });
          return;
        }
        const propertyId = parseInt(String(req.params.id), 10);
        if (!Number.isFinite(propertyId)) {
          res.status(400).json({ error: 'Invalid property ID.' });
          return;
        }

        const [prop] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .limit(1);

        if (!prop) {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }

        if (
          req.crmUser!.role === 'AGENT' &&
          prop.assignedAgentId !== req.crmUser!.id
        ) {
          res.status(403).json({
            error: 'Agents can only upload media to properties assigned to them.',
          });
          return;
        }

        if (files.length === 0) {
          res.status(400).json({ error: 'No valid media files uploaded.' });
          return;
        }

        const existingMedia = await db
          .select()
          .from(propertyMedia)
          .where(eq(propertyMedia.propertyId, prop.id));
        let nextOrder = existingMedia.length;
        let hasCover = existingMedia.some((m) => m.isCover);

        const inserted = [];
        for (const f of files) {
          const saved = await mediaStorage.saveFile(f.path, f.originalname);
          const isCover = saved.mediaCategory === 'PHOTO' && !hasCover;
          if (isCover) hasCover = true;
          const [row] = await db
            .insert(propertyMedia)
            .values({
              propertyId: prop.id,
              originalFilename: saved.sanitizedOriginalName,
              storageKey: saved.storageKey,
              fileType: saved.fileType,
              mimeType: saved.mimeType,
              fileSize: saved.fileSize,
              mediaCategory: saved.mediaCategory,
              displayOrder: nextOrder++,
              isCover,
              thumbnailStorageKey: saved.thumbnailStorageKey,
              uploadedBy: req.crmUser!.id,
            })
            .returning();
          inserted.push(serializeMediaDTO(row, 'internal'));
        }

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'PROPERTY_MEDIA_UPLOADED',
          entityType: 'Property',
          entityId: prop.id,
          newValue: { count: inserted.length },
        });

        res.status(201).json({ items: inserted });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Unable to save media.',
        });
      } finally {
        await cleanupStagingFiles(files);
      }
    });
  };

  router.post(
    '/properties/:id/media',
    requireAuth,
    requireRole('ADMIN', 'AGENT'),
    handlePropertyMediaUpload
  );

  router.patch(
    '/properties/:id/media/reorder',
    requireAuth,
    requireRole('ADMIN', 'AGENT'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const schema = z.object({
          coverMediaId: z.number().int().optional(),
          orderedMediaIds: z.array(z.number().int()).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid media ordering payload.' });
          return;
        }

        const [prop] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .limit(1);
        if (!prop) {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        if (req.crmUser!.role === 'AGENT' && prop.assignedAgentId !== req.crmUser!.id) {
          res.status(403).json({ error: 'Access denied.' });
          return;
        }

        await db.transaction(async (tx) => {
          if (parsed.data.coverMediaId) {
            await tx
              .update(propertyMedia)
              .set({ isCover: false })
              .where(eq(propertyMedia.propertyId, propertyId));
            await tx
              .update(propertyMedia)
              .set({ isCover: true })
              .where(
                and(
                  eq(propertyMedia.id, parsed.data.coverMediaId),
                  eq(propertyMedia.propertyId, propertyId)
                )
              );
          }
          if (parsed.data.orderedMediaIds?.length) {
            for (let i = 0; i < parsed.data.orderedMediaIds.length; i++) {
              await tx
                .update(propertyMedia)
                .set({ displayOrder: i })
                .where(
                  and(
                    eq(propertyMedia.id, parsed.data.orderedMediaIds[i]),
                    eq(propertyMedia.propertyId, propertyId)
                  )
                );
            }
          }
        });

        const updated = await listMediaForPropertyIds([propertyId]);
        res.json({ items: updated.map((m) => serializeMediaDTO(m, 'internal')) });
      } catch {
        res.status(500).json({ error: 'Failed to reorder media.' });
      }
    }
  );

  router.delete(
    '/media/:mediaId',
    requireAuth,
    requireRole('ADMIN', 'AGENT'),
    async (req: AuthRequest, res: Response) => {
      try {
        const mediaId = parseInt(String(req.params.mediaId), 10);
        const [row] = await db
          .select()
          .from(propertyMedia)
          .where(eq(propertyMedia.id, mediaId))
          .limit(1);
        if (!row) {
          res.status(404).json({ error: 'Media item not found.' });
          return;
        }

        if (req.crmUser!.role === 'AGENT') {
          if (!row.propertyId) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }
          const [prop] = await db
            .select({ assignedAgentId: properties.assignedAgentId })
            .from(properties)
            .where(eq(properties.id, row.propertyId))
            .limit(1);
          if (!prop || prop.assignedAgentId !== req.crmUser!.id) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }
        }

        await db.delete(propertyMedia).where(eq(propertyMedia.id, mediaId));
        if (!row.externalUrl) {
          await mediaStorage.deleteFile(row.storageKey, row.thumbnailStorageKey);
        }

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'MEDIA_DELETED',
          entityType: 'PropertyMedia',
          entityId: mediaId,
          previousValue: {
            propertyId: row.propertyId,
            submissionId: row.submissionId,
            category: row.mediaCategory,
          },
        });

        res.json({ ok: true });
      } catch {
        res.status(500).json({ error: 'Unable to delete media file.' });
      }
    }
  );

  // =========================================================================
  // 4. TELECALLER ENDPOINTS (Strictly Property Submission Only)
  // =========================================================================

  router.get(
    '/telecaller/submissions',
    requireAuth,
    requireRole('TELECALLER', 'ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const u = req.crmUser!;
        const rows = await db
          .select()
          .from(propertySubmissions)
          .where(
            u.role === 'ADMIN' ? undefined : eq(propertySubmissions.submittedByUserId, u.id)
          )
          .orderBy(desc(propertySubmissions.submittedAt))
          .limit(100);

        res.json({
          items: rows.map((s) => {
            const sla = computeEffectiveContactStatus(s);
            return {
              id: s.id,
              referenceNumber: s.referenceNumber,
              sellerName: s.sellerName,
              mobileNumber: s.mobileNumber,
              propertyType: s.propertyType,
              location: s.location,
              expectedPrice: s.expectedPrice,
              propertySize: s.propertySize,
              status: s.status,
              contactStatus: sla.contactStatus,
              submittedAt: s.submittedAt.toISOString(),
              contactDeadlineAt: s.contactDeadlineAt.toISOString(),
            };
          }),
        });
      } catch {
        res.status(500).json({ error: 'Unable to fetch your submissions.' });
      }
    }
  );

  router.post(
    '/telecaller/properties',
    requireAuth,
    requireRole('TELECALLER', 'ADMIN'),
    (req: AuthRequest, res: Response) => {
      uploadFields(req, res, async (uploadErr) => {
        const files = collectMulterFiles(req);
        try {
          if (uploadErr) {
            res.status(400).json({ error: uploadErr.message || 'Upload failed.' });
            return;
          }
          const parsed = submissionBodySchema.safeParse(req.body);
          if (!parsed.success) {
            res.status(400).json({
              error: parsed.error.issues[0]?.message || 'Invalid property details.',
            });
            return;
          }

          const { sub, photoCount, videoCount } = await saveSubmissionWithMedia({
            body: parsed.data,
            files,
            source: 'TELECALLER',
            actor: req.crmUser!,
          });

          res.status(201).json({
            id: sub.id,
            referenceNumber: sub.referenceNumber,
            status: sub.status,
            submittedAt: sub.submittedAt.toISOString(),
            contactDeadlineAt: sub.contactDeadlineAt.toISOString(),
            photoCount,
            videoCount,
          });
        } catch (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Submission failed.',
          });
        } finally {
          await cleanupStagingFiles(files);
        }
      });
    }
  );

  router.post(
    '/telecaller/properties/:id/media',
    requireAuth,
    requireRole('TELECALLER', 'ADMIN'),
    (req: AuthRequest, res: Response) => {
      uploadFields(req, res, async (uploadErr) => {
        const files = collectMulterFiles(req);
        try {
          if (uploadErr) {
            res.status(400).json({ error: uploadErr.message || 'Upload failed.' });
            return;
          }
          const subId = parseInt(String(req.params.id), 10);
          const [sub] = await db
            .select()
            .from(propertySubmissions)
            .where(eq(propertySubmissions.id, subId))
            .limit(1);
          if (!sub) {
            res.status(404).json({ error: 'Submission not found.' });
            return;
          }
          if (
            req.crmUser!.role !== 'ADMIN' &&
            sub.submittedByUserId !== req.crmUser!.id
          ) {
            res.status(403).json({ error: 'Access denied.' });
            return;
          }

          const existing = await db
            .select()
            .from(propertyMedia)
            .where(eq(propertyMedia.submissionId, sub.id));
          let order = existing.length;
          let hasCover = existing.some((m) => m.isCover);

          const created = [];
          for (const f of files) {
            const saved = await mediaStorage.saveFile(f.path, f.originalname);
            const isCover = saved.mediaCategory === 'PHOTO' && !hasCover;
            if (isCover) hasCover = true;
            const [row] = await db
              .insert(propertyMedia)
              .values({
                submissionId: sub.id,
                propertyId: sub.convertedPropertyId ?? null,
                originalFilename: saved.sanitizedOriginalName,
                storageKey: saved.storageKey,
                fileType: saved.fileType,
                mimeType: saved.mimeType,
                fileSize: saved.fileSize,
                mediaCategory: saved.mediaCategory,
                displayOrder: order++,
                isCover,
                thumbnailStorageKey: saved.thumbnailStorageKey,
                uploadedBy: req.crmUser!.id,
              })
              .returning();
            created.push(serializeMediaDTO(row, 'internal'));
          }
          res.status(201).json({ items: created });
        } catch (err) {
          res.status(400).json({
            error: err instanceof Error ? err.message : 'Unable to upload media.',
          });
        } finally {
          await cleanupStagingFiles(files);
        }
      });
    }
  );

  // =========================================================================
  // 5. ADMIN ENDPOINTS (Submissions, Approval, Publishing, Assignment, Users)
  // =========================================================================

  router.get(
    '/admin/property-submissions',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const status = String(req.query.status || 'ALL').trim();
        const contactFilter = String(req.query.contactStatus || 'ALL').trim();
        const search = String(req.query.search || '').trim();
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
        const offset = (page - 1) * limit;

        const conditions = [];
        if (status && status !== 'ALL') {
          conditions.push(eq(propertySubmissions.status, status as any));
        }
        if (search) {
          conditions.push(
            or(
              ilike(propertySubmissions.sellerName, `%${search}%`),
              ilike(propertySubmissions.mobileNumber, `%${search}%`),
              ilike(propertySubmissions.referenceNumber, `%${search}%`),
              ilike(propertySubmissions.location, `%${search}%`)
            )!
          );
        }
        const now = new Date();
        if (contactFilter === 'DUE') {
          conditions.push(
            and(
              sql`${propertySubmissions.firstContactAt} IS NULL`,
              sql`${propertySubmissions.contactStatus} != 'CONTACTED'`,
              sql`${propertySubmissions.contactDeadlineAt} >= ${now}`
            )!
          );
        } else if (contactFilter === 'OVERDUE') {
          conditions.push(
            and(
              sql`${propertySubmissions.firstContactAt} IS NULL`,
              sql`${propertySubmissions.contactStatus} != 'CONTACTED'`,
              sql`${propertySubmissions.contactDeadlineAt} < ${now}`
            )!
          );
        } else if (contactFilter === 'COMPLETED') {
          conditions.push(
            or(
              sql`${propertySubmissions.firstContactAt} IS NOT NULL`,
              eq(propertySubmissions.contactStatus, 'CONTACTED')
            )!
          );
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const [{ total }] = await db
          .select({ total: count() })
          .from(propertySubmissions)
          .where(whereClause);

        const rows = await db
          .select()
          .from(propertySubmissions)
          .where(whereClause)
          .orderBy(desc(propertySubmissions.submittedAt))
          .limit(limit)
          .offset(offset);

        const allUsers = await db.select().from(users);
        const userMap = new Map(allUsers.map((u) => [u.id, u]));

        const mediaRows =
          rows.length > 0
            ? await db
                .select()
                .from(propertyMedia)
                .where(
                  sql`${propertyMedia.submissionId} IN (${sql.join(
                    rows.map((r) => sql`${r.id}`),
                    sql`, `
                  )})`
                )
            : [];

        const countsBySub = new Map<number, { photos: number; videos: number }>();
        for (const m of mediaRows) {
          if (!m.submissionId) continue;
          const entry = countsBySub.get(m.submissionId) || { photos: 0, videos: 0 };
          if (m.mediaCategory === 'PHOTO') entry.photos += 1;
          else entry.videos += 1;
          countsBySub.set(m.submissionId, entry);
        }

        // Global summary statistics for admin header
        const allSubs = await db
          .select({
            status: propertySubmissions.status,
            firstContactAt: propertySubmissions.firstContactAt,
            contactStatus: propertySubmissions.contactStatus,
            contactDeadlineAt: propertySubmissions.contactDeadlineAt,
          })
          .from(propertySubmissions);

        const summary = {
          total: allSubs.length,
          pendingReview: allSubs.filter((s) => s.status === 'PENDING_REVIEW').length,
          underReview: allSubs.filter((s) => s.status === 'UNDER_REVIEW').length,
          approved: allSubs.filter((s) => s.status === 'APPROVED').length,
          rejected: allSubs.filter((s) => s.status === 'REJECTED').length,
          converted: allSubs.filter((s) => s.status === 'CONVERTED_TO_PROPERTY').length,
          overdueContact: allSubs.filter(
            (s) => computeEffectiveContactStatus(s).isOverdue
          ).length,
        };

        res.json({
          summary,
          total,
          page,
          limit,
          items: rows.map((s) => {
            const sla = computeEffectiveContactStatus(s);
            const mc = countsBySub.get(s.id) || { photos: 0, videos: 0 };
            const agent = s.assignedAgentId ? userMap.get(s.assignedAgentId) : null;
            return {
              ...s,
              submittedAt: s.submittedAt.toISOString(),
              contactDeadlineAt: s.contactDeadlineAt.toISOString(),
              firstContactAt: s.firstContactAt ? s.firstContactAt.toISOString() : null,
              reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
              createdAt: s.createdAt.toISOString(),
              updatedAt: s.updatedAt.toISOString(),
              contactStatus: sla.contactStatus,
              isContactOverdue: sla.isOverdue,
              photoCount: mc.photos,
              videoCount: mc.videos,
              assignedAgentName: agent?.name || null,
            };
          }),
        });
      } catch (err) {
        console.error('GET /admin/property-submissions error:', err);
        res.status(500).json({ error: 'Unable to load submissions.' });
      }
    }
  );

  router.get(
    '/admin/property-submissions/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const [sub] = await db
          .select()
          .from(propertySubmissions)
          .where(eq(propertySubmissions.id, subId))
          .limit(1);

        if (!sub) {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }

        const media = await db
          .select()
          .from(propertyMedia)
          .where(eq(propertyMedia.submissionId, sub.id))
          .orderBy(desc(propertyMedia.isCover), propertyMedia.displayOrder, propertyMedia.id);

        const history = await db
          .select()
          .from(propertySubmissionHistory)
          .where(eq(propertySubmissionHistory.submissionId, sub.id))
          .orderBy(desc(propertySubmissionHistory.createdAt));

        const allUsers = await db.select().from(users);
        const userMap = new Map(allUsers.map((u) => [u.id, u]));

        const sla = computeEffectiveContactStatus(sub);

        res.json({
          submission: {
            ...sub,
            submittedAt: sub.submittedAt.toISOString(),
            contactDeadlineAt: sub.contactDeadlineAt.toISOString(),
            firstContactAt: sub.firstContactAt ? sub.firstContactAt.toISOString() : null,
            reviewedAt: sub.reviewedAt ? sub.reviewedAt.toISOString() : null,
            createdAt: sub.createdAt.toISOString(),
            updatedAt: sub.updatedAt.toISOString(),
            contactStatus: sla.contactStatus,
            isContactOverdue: sla.isOverdue,
            assignedAgentName: sub.assignedAgentId
              ? userMap.get(sub.assignedAgentId)?.name || null
              : null,
            submittedByName: sub.submittedByUserId
              ? userMap.get(sub.submittedByUserId)?.name || null
              : null,
          },
          media: media.map((m) => serializeMediaDTO(m, 'internal')),
          history: history.map((h) => ({
            ...h,
            createdAt: h.createdAt.toISOString(),
          })),
        });
      } catch {
        res.status(500).json({ error: 'Unable to load submission detail.' });
      }
    }
  );

  router.patch(
    '/admin/property-submissions/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const [existing] = await db
          .select()
          .from(propertySubmissions)
          .where(eq(propertySubmissions.id, subId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }

        const patchSchema = z.object({
          sellerName: z.string().trim().min(2).max(120).optional(),
          mobileNumber: z.string().trim().min(7).max(30).optional(),
          propertyType: z.string().trim().min(2).max(60).optional(),
          location: z.string().trim().min(2).max(200).optional(),
          district: z.string().trim().max(100).optional(),
          panchayath: z.string().trim().max(120).optional(),
          locality: z.string().trim().max(120).optional(),
          shortDescription: z.string().trim().min(5).max(3000).optional(),
          expectedPrice: z.number().nonnegative().nullable().optional(),
          propertySize: z.string().trim().max(80).nullable().optional(),
          bedrooms: z.number().int().min(0).max(50).nullable().optional(),
          bathrooms: z.number().int().min(0).max(50).nullable().optional(),
          additionalNotes: z.string().trim().max(2000).nullable().optional(),
          internalNotes: z.string().trim().max(2000).optional(),
          assignedAgentId: z.number().int().nullable().optional(),
          status: z.enum(['PENDING_REVIEW', 'UNDER_REVIEW']).optional(),
        });

        const parsed = patchSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update.' });
          return;
        }

        const [updated] = await db
          .update(propertySubmissions)
          .set({
            ...parsed.data,
            updatedAt: new Date(),
          })
          .where(eq(propertySubmissions.id, subId))
          .returning();

        await db.insert(propertySubmissionHistory).values({
          submissionId: subId,
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          action: 'EDITED',
          previousStatus: existing.status,
          newStatus: updated.status,
          notes: 'Submission details or assignment updated by admin',
        });

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'SUBMISSION_UPDATED',
          entityType: 'PropertySubmission',
          entityId: subId,
          previousValue: { status: existing.status, assignedAgentId: existing.assignedAgentId },
          newValue: parsed.data,
        });

        res.json({ submission: updated });
      } catch {
        res.status(500).json({ error: 'Unable to update submission.' });
      }
    }
  );

  router.post(
    '/admin/property-submissions/:id/approve',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const [existing] = await db
          .select()
          .from(propertySubmissions)
          .where(eq(propertySubmissions.id, subId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }
        if (existing.status === 'CONVERTED_TO_PROPERTY') {
          res.status(409).json({ error: 'Submission is already converted to a property.' });
          return;
        }

        const now = new Date();
        const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

        const [updated] = await db
          .update(propertySubmissions)
          .set({
            status: 'APPROVED',
            reviewedBy: req.crmUser!.id,
            reviewedAt: now,
            rejectionReason: null,
            updatedAt: now,
          })
          .where(eq(propertySubmissions.id, subId))
          .returning();

        await db.insert(propertySubmissionHistory).values({
          submissionId: subId,
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          action: 'APPROVED',
          previousStatus: existing.status,
          newStatus: 'APPROVED',
          notes: notes || 'Submission approved for CRM property conversion',
        });

        if (existing.submittedByUserId) {
          await createNotification(db, {
            recipientUserId: existing.submittedByUserId,
            recipientRole: 'TELECALLER',
            eventType: 'SUBMISSION_APPROVED',
            title: `Submission ${existing.referenceNumber} Approved`,
            message: `${existing.propertyType} in ${existing.location} was approved by ${req.crmUser!.name}.`,
            entityType: 'PropertySubmission',
            entityId: subId,
          });
        }

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'SUBMISSION_APPROVED',
          entityType: 'PropertySubmission',
          entityId: subId,
          previousValue: { status: existing.status },
          newValue: { status: 'APPROVED', notes },
        });

        res.json({ submission: updated });
      } catch {
        res.status(500).json({ error: 'Unable to approve submission.' });
      }
    }
  );

  router.post(
    '/admin/property-submissions/:id/reject',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const reason = String(req.body?.reason || '').trim();
        if (reason.length < 3) {
          res.status(400).json({ error: 'A rejection reason is required.' });
          return;
        }

        const [existing] = await db
          .select()
          .from(propertySubmissions)
          .where(eq(propertySubmissions.id, subId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }
        if (existing.status === 'CONVERTED_TO_PROPERTY') {
          res.status(409).json({ error: 'Cannot reject a converted submission.' });
          return;
        }

        const now = new Date();
        const [updated] = await db
          .update(propertySubmissions)
          .set({
            status: 'REJECTED',
            rejectionReason: reason,
            reviewedBy: req.crmUser!.id,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(propertySubmissions.id, subId))
          .returning();

        await db.insert(propertySubmissionHistory).values({
          submissionId: subId,
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          action: 'REJECTED',
          previousStatus: existing.status,
          newStatus: 'REJECTED',
          notes: reason,
        });

        if (existing.submittedByUserId) {
          await createNotification(db, {
            recipientUserId: existing.submittedByUserId,
            recipientRole: 'TELECALLER',
            eventType: 'SUBMISSION_REJECTED',
            title: `Submission ${existing.referenceNumber} Rejected`,
            message: `Reason: ${reason}`,
            entityType: 'PropertySubmission',
            entityId: subId,
          });
        }

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'SUBMISSION_REJECTED',
          entityType: 'PropertySubmission',
          entityId: subId,
          previousValue: { status: existing.status },
          newValue: { status: 'REJECTED', reason },
        });

        res.json({ submission: updated });
      } catch {
        res.status(500).json({ error: 'Unable to reject submission.' });
      }
    }
  );

  router.post(
    '/admin/property-submissions/:id/request-information',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const notes = String(req.body?.notes || '').trim();
        if (notes.length < 3) {
          res.status(400).json({ error: 'Please specify what additional information is needed.' });
          return;
        }

        const [existing] = await db
          .select()
          .from(propertySubmissions)
          .where(eq(propertySubmissions.id, subId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }

        const [updated] = await db
          .update(propertySubmissions)
          .set({
            status: 'UNDER_REVIEW',
            correctionNotes: notes,
            reviewedBy: req.crmUser!.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(propertySubmissions.id, subId))
          .returning();

        await db.insert(propertySubmissionHistory).values({
          submissionId: subId,
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          action: 'INFORMATION_REQUESTED',
          previousStatus: existing.status,
          newStatus: 'UNDER_REVIEW',
          notes,
        });

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'SUBMISSION_INFO_REQUESTED',
          entityType: 'PropertySubmission',
          entityId: subId,
          newValue: { notes },
        });

        res.json({ submission: updated });
      } catch {
        res.status(500).json({ error: 'Unable to update submission.' });
      }
    }
  );

  router.post(
    '/admin/property-submissions/:id/log-contact',
    requireAuth,
    requireRole('ADMIN', 'AGENT'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const notes = String(req.body?.notes || '').trim();
        const method = String(req.body?.method || 'Call').trim();
        if (notes.length < 2) {
          res.status(400).json({ error: 'Conversation summary notes are required.' });
          return;
        }

        const [existing] = await db
          .select()
          .from(propertySubmissions)
          .where(eq(propertySubmissions.id, subId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }

        if (
          req.crmUser!.role === 'AGENT' &&
          existing.assignedAgentId !== req.crmUser!.id
        ) {
          res.status(403).json({ error: 'Access denied.' });
          return;
        }

        const now = new Date();
        const [updated] = await db
          .update(propertySubmissions)
          .set({
            firstContactAt: existing.firstContactAt || now,
            contactStatus: 'CONTACTED',
            updatedAt: now,
          })
          .where(eq(propertySubmissions.id, subId))
          .returning();

        await db.insert(propertyFollowUps).values({
          submissionId: subId,
          propertyId: existing.convertedPropertyId ?? null,
          agentId: req.crmUser!.id,
          title: `Seller contact (${method}): ${existing.sellerName}`,
          activityType: method,
          scheduledDate: now.toISOString().slice(0, 10),
          scheduledTime: now.toTimeString().slice(0, 5),
          notes,
          status: 'COMPLETED',
          completedAt: now,
        });

        await db.insert(propertySubmissionHistory).values({
          submissionId: subId,
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          action: 'SELLER_CONTACT_LOGGED',
          previousStatus: existing.status,
          newStatus: existing.status,
          notes: `${method}: ${notes}`,
        });

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'SUBMISSION_CONTACT_COMPLETED',
          entityType: 'PropertySubmission',
          entityId: subId,
          newValue: { method, notes, firstContactAt: updated.firstContactAt },
        });

        res.json({ submission: updated });
      } catch {
        res.status(500).json({ error: 'Unable to log contact interaction.' });
      }
    }
  );

  router.post(
    '/admin/property-submissions/:id/convert',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const subId = parseInt(String(req.params.id), 10);
        const result = await convertSubmissionToPropertyTx({
          submissionId: subId,
          actor: req.crmUser!,
          overrides: req.body || {},
        });
        res.status(201).json(result);
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code === 'SUBMISSION_NOT_FOUND') {
          res.status(404).json({ error: 'Submission not found.' });
          return;
        }
        if (code === 'ALREADY_CONVERTED') {
          res.status(409).json({
            error: 'This submission has already been converted to a CRM property.',
          });
          return;
        }
        if (code === 'MUST_BE_APPROVED_FIRST') {
          res.status(400).json({
            error: 'Submission must be APPROVED before converting to a CRM property.',
          });
          return;
        }
        console.error('Convert error:', err);
        res.status(500).json({ error: 'Failed to convert submission.' });
      }
    }
  );

  // Admin Property List & Management
  router.get(
    '/admin/properties',
    requireAuth,
    requireRole('ADMIN'),
    async (_req: AuthRequest, res: Response) => {
      try {
        await ensureInitialSeed();
        const rows = await db
          .select()
          .from(properties)
          .orderBy(desc(properties.createdAt), desc(properties.id));

        const allUsers = await db.select().from(users);
        const allSellers = await db.select().from(sellers);
        const mediaRows = await listMediaForPropertyIds(rows.map((r) => r.id));

        const userMap = new Map(allUsers.map((u) => [u.id, u]));
        const sellerMap = new Map(allSellers.map((s) => [s.id, s]));
        const mediaMap = new Map<number, ReturnType<typeof serializeMediaDTO>[]>();
        for (const m of mediaRows) {
          if (!m.propertyId) continue;
          const arr = mediaMap.get(m.propertyId) || [];
          arr.push(serializeMediaDTO(m, 'internal'));
          mediaMap.set(m.propertyId, arr);
        }

        res.json({
          items: rows.map((p) => {
            const mList = mediaMap.get(p.id) || [];
            const seller = sellerMap.get(p.sellerId);
            const agent = p.assignedAgentId ? userMap.get(p.assignedAgentId) : null;
            return {
              ...p,
              createdAt: p.createdAt.toISOString(),
              updatedAt: p.updatedAt.toISOString(),
              publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
              unpublishedAt: p.unpublishedAt ? p.unpublishedAt.toISOString() : null,
              sellerName: seller?.name || 'Unknown',
              sellerPhone: seller?.phone || '',
              assignedAgentName: agent?.name || 'Unassigned',
              media: mList,
              coverImageUrl: mList[0]?.thumbnailUrl || mList[0]?.url || null,
            };
          }),
        });
      } catch (err) {
        console.error('GET /admin/properties error:', err);
        res.status(500).json({ error: 'Unable to load properties.' });
      }
    }
  );

  router.post(
    '/admin/properties',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const body = req.body || {};
        if (!body.title?.trim() || !body.location?.trim() || !body.description?.trim()) {
          res.status(400).json({ error: 'Title, location, and description are required.' });
          return;
        }
        const result = await db.transaction(async (tx) => {
          let sellerId = body.sellerId ? Number(body.sellerId) : null;
          if (!sellerId) {
            if (!body.sellerName?.trim() || !body.sellerPhone?.trim()) {
              throw new Error('Seller name and phone are required.');
            }
            const sellerCode = await generateNextSellerCode(tx);
            const [s] = await tx
              .insert(sellers)
              .values({
                code: sellerCode,
                name: body.sellerName.trim(),
                phone: body.sellerPhone.trim(),
                whatsapp: (body.sellerWhatsapp || body.sellerPhone).trim(),
                assignedAgentId: body.assignedAgentId ? Number(body.assignedAgentId) : null,
              })
              .returning();
            sellerId = s.id;
          }
          const code = await generateNextTakCode(tx);
          const today = new Date().toISOString().slice(0, 10);
          const [prop] = await tx
            .insert(properties)
            .values({
              code,
              title: body.title.trim(),
              type: body.type || 'Land',
              category: body.category || 'Residential',
              district: body.district || '',
              panchayath: body.panchayath || '',
              locality: body.locality || '',
              location: body.location.trim(),
              areaValue: Number(body.areaValue) || 0,
              areaUnit: body.areaUnit || 'Cents',
              areaDisplay: body.areaDisplay || `${body.areaValue || 0} ${body.areaUnit || 'Cents'}`,
              bedrooms: body.bedrooms ? Number(body.bedrooms) : null,
              bathrooms: body.bathrooms ? Number(body.bathrooms) : null,
              expectedPrice: Number(body.expectedPrice) || 0,
              description: body.description.trim(),
              sellerId,
              status: body.status || 'Available',
              approvalStatus: 'APPROVED',
              isPublished: false,
              assignedAgentId: body.assignedAgentId ? Number(body.assignedAgentId) : null,
              internalNotes: body.internalNotes || '',
              listedDate: today,
            })
            .returning();

          await recordAuditLog(tx, {
            actorId: req.crmUser!.id,
            actorName: req.crmUser!.name,
            actorRole: req.crmUser!.role,
            action: 'PROPERTY_CREATED',
            entityType: 'Property',
            entityId: prop.id,
            newValue: { code: prop.code, title: prop.title, isPublished: false },
          });

          return prop;
        });
        res.status(201).json({ property: result });
      } catch (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Unable to create property.',
        });
      }
    }
  );

  router.patch(
    '/admin/properties/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const [existing] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }

        const allowed = z.object({
          title: z.string().trim().min(2).max(200).optional(),
          type: z.string().trim().max(60).optional(),
          category: z.string().trim().max(60).optional(),
          district: z.string().trim().max(100).optional(),
          panchayath: z.string().trim().max(120).optional(),
          locality: z.string().trim().max(120).optional(),
          location: z.string().trim().max(200).optional(),
          areaDisplay: z.string().trim().max(80).optional(),
          bedrooms: z.number().int().nullable().optional(),
          bathrooms: z.number().int().nullable().optional(),
          expectedPrice: z.number().nonnegative().optional(),
          marketPrice: z.number().nonnegative().nullable().optional(),
          description: z.string().trim().max(4000).optional(),
          status: z.string().trim().max(40).optional(),
          internalNotes: z.string().trim().max(2000).optional(),
        });
        const parsed = allowed.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update.' });
          return;
        }

        const [updated] = await db
          .update(properties)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(properties.id, propertyId))
          .returning();

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'PROPERTY_UPDATED',
          entityType: 'Property',
          entityId: propertyId,
          newValue: parsed.data,
        });

        res.json({ property: updated });
      } catch {
        res.status(500).json({ error: 'Unable to update property.' });
      }
    }
  );

  router.post(
    '/admin/properties/:id/publish',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const prop = await setPropertyPublishedStateTx({
          propertyId,
          publish: true,
          actor: req.crmUser!,
          notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json({ property: prop });
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code === 'PROPERTY_NOT_FOUND') {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        if (code === 'ONLY_APPROVED_CAN_PUBLISH') {
          res.status(400).json({
            error: 'Only approved properties can be published publicly.',
          });
          return;
        }
        res.status(500).json({ error: 'Unable to publish property.' });
      }
    }
  );

  router.post(
    '/admin/properties/:id/unpublish',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const prop = await setPropertyPublishedStateTx({
          propertyId,
          publish: false,
          actor: req.crmUser!,
          notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json({ property: prop });
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code === 'PROPERTY_NOT_FOUND') {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        res.status(500).json({ error: 'Unable to unpublish property.' });
      }
    }
  );

  router.post(
    '/admin/properties/:id/assign',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const agentId = Number(req.body?.agentId);
        if (!Number.isFinite(agentId)) {
          res.status(400).json({ error: 'Valid salesperson ID is required.' });
          return;
        }
        const out = await assignPropertyAgentTx({
          propertyId,
          agentId,
          actor: req.crmUser!,
          notes: typeof req.body?.notes === 'string' ? req.body.notes : undefined,
        });
        res.json(out);
      } catch (err) {
        const code = err instanceof Error ? err.message : '';
        if (code === 'PROPERTY_NOT_FOUND') {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        if (code === 'INVALID_AGENT') {
          res.status(400).json({ error: 'Selected user is not an active salesperson.' });
          return;
        }
        res.status(500).json({ error: 'Unable to assign property.' });
      }
    }
  );

  router.get(
    '/admin/properties/:id/assignments',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const rows = await db
          .select()
          .from(propertyAssignments)
          .where(eq(propertyAssignments.propertyId, propertyId))
          .orderBy(desc(propertyAssignments.assignedAt));
        const pubRows = await db
          .select()
          .from(propertyPublicationHistory)
          .where(eq(propertyPublicationHistory.propertyId, propertyId))
          .orderBy(desc(propertyPublicationHistory.createdAt));

        const allUsers = await db.select().from(users);
        const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

        res.json({
          assignments: rows.map((r) => ({
            ...r,
            agentName: userMap.get(r.agentId) || 'Advisor',
            previousAgentName: r.previousAgentId
              ? userMap.get(r.previousAgentId) || null
              : null,
            assignedByName: userMap.get(r.assignedBy) || 'Admin',
            assignedAt: r.assignedAt.toISOString(),
          })),
          publicationHistory: pubRows.map((p) => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
          })),
        });
      } catch {
        res.status(500).json({ error: 'Unable to load property history.' });
      }
    }
  );

  // Admin Team & Role Management
  router.get(
    '/admin/users',
    requireAuth,
    requireRole('ADMIN'),
    async (_req: AuthRequest, res: Response) => {
      const rows = await db.select().from(users).orderBy(users.id);
      res.json({ items: rows });
    }
  );

  router.post(
    '/admin/users',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const schema = z.object({
          name: z.string().trim().min(2).max(100),
          email: z.string().trim().email(),
          phone: z.string().trim().max(30).optional(),
          role: z.enum(['ADMIN', 'TELECALLER', 'AGENT']),
          designation: z.string().trim().max(100).optional(),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user.' });
          return;
        }
        const emailLower = parsed.data.email.toLowerCase();
        const [created] = await db
          .insert(users)
          .values({
            name: parsed.data.name,
            email: emailLower,
            phone: parsed.data.phone || '',
            role: parsed.data.role,
            designation:
              parsed.data.designation ||
              (parsed.data.role === 'TELECALLER'
                ? 'Telecaller'
                : parsed.data.role === 'ADMIN'
                ? 'Administrator'
                : 'Salesperson / Agent'),
            active: true,
          })
          .returning();

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'USER_CREATED',
          entityType: 'User',
          entityId: created.id,
          newValue: { email: created.email, role: created.role },
        });

        res.status(201).json({ user: created });
      } catch {
        res.status(400).json({ error: 'Email already exists or invalid user data.' });
      }
    }
  );

  router.patch(
    '/admin/users/:id',
    requireAuth,
    requireRole('ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const targetId = parseInt(String(req.params.id), 10);
        if (targetId === req.crmUser!.id && (req.body.role || req.body.active === false)) {
          res.status(400).json({
            error: 'Cannot change your own role or deactivate your own account.',
          });
          return;
        }
        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.id, targetId))
          .limit(1);
        if (!existing) {
          res.status(404).json({ error: 'User not found.' });
          return;
        }

        const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
        if (['ADMIN', 'TELECALLER', 'AGENT'].includes(req.body?.role)) {
          updates.role = req.body.role as CRMUserRole;
        }
        if (typeof req.body?.active === 'boolean') {
          updates.active = req.body.active;
        }
        if (typeof req.body?.designation === 'string') {
          updates.designation = req.body.designation.trim();
        }

        const [updated] = await db
          .update(users)
          .set(updates)
          .where(eq(users.id, targetId))
          .returning();

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'USER_ROLE_UPDATED',
          entityType: 'User',
          entityId: targetId,
          previousValue: { role: existing.role, active: existing.active },
          newValue: { role: updated.role, active: updated.active },
        });

        res.json({ user: updated });
      } catch {
        res.status(500).json({ error: 'Unable to update user.' });
      }
    }
  );

  router.get(
    '/admin/audit-logs',
    requireAuth,
    requireRole('ADMIN'),
    async (_req: AuthRequest, res: Response) => {
      const rows = await db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(150);
      res.json({
        items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      });
    }
  );

  // =========================================================================
  // 6. AGENT / SALESPERSON ENDPOINTS (Strictly Assigned Records Only)
  // =========================================================================

  router.get(
    '/agent/properties',
    requireAuth,
    requireRole('AGENT', 'ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const u = req.crmUser!;
        const rows = await db
          .select()
          .from(properties)
          .where(
            u.role === 'ADMIN' ? undefined : eq(properties.assignedAgentId, u.id)
          )
          .orderBy(desc(properties.updatedAt));

        const allSellers = await db.select().from(sellers);
        const sellerMap = new Map(allSellers.map((s) => [s.id, s]));
        const mediaRows = await listMediaForPropertyIds(rows.map((r) => r.id));
        const mediaMap = new Map<number, ReturnType<typeof serializeMediaDTO>[]>();
        for (const m of mediaRows) {
          if (!m.propertyId) continue;
          const arr = mediaMap.get(m.propertyId) || [];
          arr.push(serializeMediaDTO(m, 'internal'));
          mediaMap.set(m.propertyId, arr);
        }

        res.json({
          items: rows.map((p) => {
            const mList = mediaMap.get(p.id) || [];
            const seller = sellerMap.get(p.sellerId);
            return {
              ...p,
              createdAt: p.createdAt.toISOString(),
              updatedAt: p.updatedAt.toISOString(),
              publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
              sellerName: seller?.name || 'Owner',
              sellerPhone: seller?.phone || '',
              sellerWhatsapp: seller?.whatsapp || '',
              media: mList,
              coverImageUrl: mList[0]?.thumbnailUrl || mList[0]?.url || null,
            };
          }),
        });
      } catch {
        res.status(500).json({ error: 'Unable to load assigned properties.' });
      }
    }
  );

  router.get(
    '/agent/properties/:id',
    requireAuth,
    requireRole('AGENT', 'ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const [prop] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .limit(1);
        if (!prop) {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        if (req.crmUser!.role === 'AGENT' && prop.assignedAgentId !== req.crmUser!.id) {
          res.status(403).json({
            error: 'Access denied. You can only view properties assigned to you.',
          });
          return;
        }

        const [seller] = await db
          .select()
          .from(sellers)
          .where(eq(sellers.id, prop.sellerId))
          .limit(1);
        const media = await listMediaForPropertyIds([prop.id]);
        const followUps = await db
          .select()
          .from(propertyFollowUps)
          .where(eq(propertyFollowUps.propertyId, prop.id))
          .orderBy(desc(propertyFollowUps.createdAt));

        res.json({
          property: {
            ...prop,
            createdAt: prop.createdAt.toISOString(),
            updatedAt: prop.updatedAt.toISOString(),
          },
          seller,
          media: media.map((m) => serializeMediaDTO(m, 'internal')),
          followUps: followUps.map((f) => ({
            ...f,
            createdAt: f.createdAt.toISOString(),
          })),
        });
      } catch {
        res.status(500).json({ error: 'Unable to load property record.' });
      }
    }
  );

  router.patch(
    '/agent/properties/:id',
    requireAuth,
    requireRole('AGENT', 'ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const [prop] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .limit(1);
        if (!prop) {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        if (req.crmUser!.role === 'AGENT' && prop.assignedAgentId !== req.crmUser!.id) {
          res.status(403).json({
            error: 'Access denied. You can only update properties assigned to you.',
          });
          return;
        }

        // Explicitly block Agents from modifying publishing, approval, or assignments
        if (
          req.crmUser!.role === 'AGENT' &&
          (req.body.isPublished !== undefined ||
            req.body.approvalStatus !== undefined ||
            req.body.assignedAgentId !== undefined)
        ) {
          res.status(403).json({
            error: 'Only Administrators can change approval, publishing, or agent assignments.',
          });
          return;
        }

        const agentAllowed = z.object({
          status: z
            .enum(['Available', 'Under Negotiation', 'Reserved', 'Rented'])
            .optional(),
          roadConnectivity: z.string().trim().max(200).optional(),
          description: z.string().trim().max(4000).optional(),
          internalNotes: z.string().trim().max(2000).optional(),
        });
        const parsed = agentAllowed.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'Invalid property update payload.' });
          return;
        }

        const [updated] = await db
          .update(properties)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(properties.id, propertyId))
          .returning();

        await recordAuditLog(db, {
          actorId: req.crmUser!.id,
          actorName: req.crmUser!.name,
          actorRole: req.crmUser!.role,
          action: 'AGENT_PROPERTY_UPDATED',
          entityType: 'Property',
          entityId: propertyId,
          newValue: parsed.data,
        });

        res.json({ property: updated });
      } catch {
        res.status(500).json({ error: 'Unable to update assigned property.' });
      }
    }
  );

  router.post(
    '/agent/properties/:id/media',
    requireAuth,
    requireRole('AGENT', 'ADMIN'),
    handlePropertyMediaUpload
  );

  router.post(
    '/agent/properties/:id/follow-ups',
    requireAuth,
    requireRole('AGENT', 'ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const propertyId = parseInt(String(req.params.id), 10);
        const [prop] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId))
          .limit(1);
        if (!prop) {
          res.status(404).json({ error: 'Property not found.' });
          return;
        }
        if (req.crmUser!.role === 'AGENT' && prop.assignedAgentId !== req.crmUser!.id) {
          res.status(403).json({
            error: 'Access denied. You can only log follow-ups for assigned properties.',
          });
          return;
        }

        const schema = z.object({
          title: z.string().trim().min(2).max(160),
          activityType: z.string().trim().max(40).default('Call'),
          scheduledDate: z.string().trim().min(8).max(20),
          scheduledTime: z.string().trim().max(10).default('10:30'),
          notes: z.string().trim().max(1000).default(''),
          status: z.enum(['PENDING', 'COMPLETED']).default('PENDING'),
        });
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid follow-up.' });
          return;
        }

        const [created] = await db
          .insert(propertyFollowUps)
          .values({
            propertyId,
            agentId: req.crmUser!.id,
            title: parsed.data.title,
            activityType: parsed.data.activityType,
            scheduledDate: parsed.data.scheduledDate,
            scheduledTime: parsed.data.scheduledTime,
            notes: parsed.data.notes,
            status: parsed.data.status,
            completedAt: parsed.data.status === 'COMPLETED' ? new Date() : null,
          })
          .returning();

        res.status(201).json({ followUp: created });
      } catch {
        res.status(500).json({ error: 'Unable to create follow-up.' });
      }
    }
  );

  router.patch(
    '/agent/follow-ups/:followUpId',
    requireAuth,
    requireRole('AGENT', 'ADMIN'),
    async (req: AuthRequest, res: Response) => {
      try {
        const followUpId = parseInt(String(req.params.followUpId), 10);
        const [fup] = await db
          .select()
          .from(propertyFollowUps)
          .where(eq(propertyFollowUps.id, followUpId))
          .limit(1);
        if (!fup) {
          res.status(404).json({ error: 'Follow-up not found.' });
          return;
        }
        if (req.crmUser!.role === 'AGENT' && fup.agentId !== req.crmUser!.id) {
          res.status(403).json({ error: 'Access denied.' });
          return;
        }

        const nextStatus = req.body?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
        const [updated] = await db
          .update(propertyFollowUps)
          .set({
            status: nextStatus,
            completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
            notes:
              typeof req.body?.notes === 'string' ? req.body.notes.trim() : fup.notes,
            updatedAt: new Date(),
          })
          .where(eq(propertyFollowUps.id, followUpId))
          .returning();

        res.json({ followUp: updated });
      } catch {
        res.status(500).json({ error: 'Unable to update follow-up.' });
      }
    }
  );

  return router;
}
