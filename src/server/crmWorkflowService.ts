import crypto from 'node:crypto';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
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
import { mediaStorage } from './mediaStorage.ts';

export type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function recordAuditLog(
  conn: DbOrTx,
  params: {
    actorId?: number | null;
    actorName: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string | number;
    previousValue?: unknown;
    newValue?: unknown;
  }
): Promise<void> {
  await conn.insert(auditLogs).values({
    actorId: params.actorId ?? null,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: String(params.entityId),
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
  });
}

export async function createNotification(
  conn: DbOrTx,
  params: {
    recipientUserId?: number | null;
    recipientRole?: CRMUserRole | null;
    eventType: string;
    title: string;
    message: string;
    entityType: string;
    entityId: number;
  }
): Promise<void> {
  await conn.insert(notifications).values({
    recipientUserId: params.recipientUserId ?? null,
    recipientRole: params.recipientRole ?? null,
    eventType: params.eventType,
    title: params.title,
    message: params.message,
    entityType: params.entityType,
    entityId: params.entityId,
    isRead: false,
  });
}

export function generateSubmissionReference(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `SUB-${datePart}-${randPart}`;
}

export async function generateNextTakCode(conn: DbOrTx): Promise<string> {
  const rows = await conn.select({ code: properties.code }).from(properties);
  const used = new Set(rows.map((r) => r.code.toUpperCase()));
  let maxNum = 0;
  for (const r of rows) {
    const m = r.code.toUpperCase().match(/^TAK(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  let candidate = maxNum + 1;
  while (used.has(`TAK${String(candidate).padStart(3, '0')}`)) {
    candidate += 1;
  }
  return `TAK${String(candidate).padStart(3, '0')}`;
}

export async function generateNextSellerCode(conn: DbOrTx): Promise<string> {
  const rows = await conn.select({ code: sellers.code }).from(sellers);
  let maxNum = 1000;
  for (const r of rows) {
    const m = r.code.match(/(\d+)$/);
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  }
  return `SLR-${maxNum + 1}`;
}

export function computeEffectiveContactStatus(sub: {
  contactStatus: string;
  firstContactAt: Date | null;
  contactDeadlineAt: Date;
}): { contactStatus: 'PENDING' | 'CONTACTED' | 'OVERDUE'; isOverdue: boolean } {
  if (sub.firstContactAt || sub.contactStatus === 'CONTACTED') {
    return { contactStatus: 'CONTACTED', isOverdue: false };
  }
  const now = new Date();
  if (now.getTime() > new Date(sub.contactDeadlineAt).getTime()) {
    return { contactStatus: 'OVERDUE', isOverdue: true };
  }
  return { contactStatus: 'PENDING', isOverdue: false };
}

export function serializeMediaDTO(
  row: typeof propertyMedia.$inferSelect,
  scope: 'public' | 'internal'
) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    submissionId: row.submissionId,
    originalFilename: scope === 'public' ? undefined : row.originalFilename,
    fileType: row.fileType,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    mediaCategory: row.mediaCategory,
    displayOrder: row.displayOrder,
    isCover: row.isCover,
    url: mediaStorage.getFileUrl(row, scope, 'full'),
    thumbnailUrl:
      row.mediaCategory === 'PHOTO'
        ? mediaStorage.getFileUrl(row, scope, 'thumb')
        : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function serializePublicPropertyDTO(
  prop: typeof properties.$inferSelect,
  mediaRows: (typeof propertyMedia.$inferSelect)[]
) {
  const sorted = [...mediaRows].sort(
    (a, b) => Number(b.isCover) - Number(a.isCover) || a.displayOrder - b.displayOrder
  );
  const photos = sorted
    .filter((m) => m.mediaCategory === 'PHOTO')
    .map((m) => serializeMediaDTO(m, 'public'));
  const videos = sorted
    .filter((m) => m.mediaCategory === 'VIDEO')
    .map((m) => serializeMediaDTO(m, 'public'));

  // STRICT PUBLIC SANITIZATION: never return seller phone, seller name, internalNotes, agent, or commission
  return {
    id: prop.id,
    code: prop.code,
    title: prop.title,
    type: prop.type,
    category: prop.category,
    district: prop.district,
    panchayath: prop.panchayath,
    locality: prop.locality,
    location: prop.location,
    areaDisplay: prop.areaDisplay,
    bedrooms: prop.bedrooms,
    bathrooms: prop.bathrooms,
    roadConnectivity: prop.roadConnectivity,
    expectedPrice: prop.expectedPrice > 0 ? prop.expectedPrice : null,
    description: prop.description,
    status: prop.status,
    listedDate: prop.listedDate,
    publishedAt: prop.publishedAt ? prop.publishedAt.toISOString() : null,
    coverImageUrl: photos[0]?.url || null,
    photos,
    videos,
  };
}

export async function convertSubmissionToPropertyTx(params: {
  submissionId: number;
  actor: typeof users.$inferSelect;
  overrides?: {
    title?: string;
    category?: string;
    district?: string;
    panchayath?: string;
    locality?: string;
    areaValue?: number;
    areaUnit?: string;
    expectedPrice?: number;
    assignedAgentId?: number | null;
  };
}) {
  return await db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(propertySubmissions)
      .where(eq(propertySubmissions.id, params.submissionId))
      .limit(1);

    if (!sub) {
      throw new Error('SUBMISSION_NOT_FOUND');
    }
    if (sub.convertedPropertyId || sub.status === 'CONVERTED_TO_PROPERTY') {
      throw new Error('ALREADY_CONVERTED');
    }
    if (sub.status !== 'APPROVED') {
      throw new Error('MUST_BE_APPROVED_FIRST');
    }

    // Double-check no property already references this submission
    const [existingBySub] = await tx
      .select({ id: properties.id })
      .from(properties)
      .where(eq(properties.submissionId, sub.id))
      .limit(1);
    if (existingBySub) {
      throw new Error('ALREADY_CONVERTED');
    }

    // Match existing seller by normalized phone or create new seller record
    const cleanPhone = sub.mobileNumber.trim();
    const [existingSeller] = await tx
      .select()
      .from(sellers)
      .where(eq(sellers.phone, cleanPhone))
      .limit(1);

    const agentId =
      params.overrides?.assignedAgentId !== undefined
        ? params.overrides.assignedAgentId
        : sub.assignedAgentId;

    let sellerRecord = existingSeller;
    if (!sellerRecord) {
      const sellerCode = await generateNextSellerCode(tx);
      const [createdSeller] = await tx
        .insert(sellers)
        .values({
          code: sellerCode,
          name: sub.sellerName,
          phone: cleanPhone,
          whatsapp: cleanPhone,
          address: sub.location,
          relationshipWithProperty: 'Owner',
          notes: sub.additionalNotes || '',
          assignedAgentId: agentId ?? null,
          lastContactedAt: sub.firstContactAt ?? null,
        })
        .returning();
      sellerRecord = createdSeller;
    }

    const code = await generateNextTakCode(tx);
    const today = new Date().toISOString().slice(0, 10);
    const title =
      params.overrides?.title?.trim() ||
      `${sub.propertyType} in ${sub.locality || sub.location}`;

    const sizeText = sub.propertySize?.trim() || '';
    const parsedAreaNum = parseFloat(sizeText);
    const areaValue =
      params.overrides?.areaValue ??
      (Number.isFinite(parsedAreaNum) && parsedAreaNum > 0 ? parsedAreaNum : 0);
    const areaUnit =
      params.overrides?.areaUnit ||
      (sizeText.toLowerCase().includes('acre')
        ? 'Acres'
        : sizeText.toLowerCase().includes('sq')
        ? 'Sq.ft'
        : 'Cents');
    const areaDisplay = sizeText || (areaValue > 0 ? `${areaValue} ${areaUnit}` : 'Specified in description');

    // CRITICAL: Approved converted property starts UNPUBLISHED (isPublished: false)
    const [createdProp] = await tx
      .insert(properties)
      .values({
        code,
        title,
        type: sub.propertyType,
        category: params.overrides?.category || 'Residential',
        district: params.overrides?.district ?? sub.district ?? '',
        panchayath: params.overrides?.panchayath ?? sub.panchayath ?? '',
        locality: params.overrides?.locality ?? sub.locality ?? '',
        location: sub.location,
        areaValue,
        areaUnit,
        areaDisplay,
        bedrooms: sub.bedrooms,
        bathrooms: sub.bathrooms,
        roadConnectivity: 'To be verified on inspection',
        expectedPrice: params.overrides?.expectedPrice ?? sub.expectedPrice ?? 0,
        description: sub.shortDescription,
        sellerId: sellerRecord.id,
        submissionId: sub.id,
        status: 'Available',
        approvalStatus: 'APPROVED',
        isPublished: false,
        assignedAgentId: agentId ?? null,
        internalNotes: sub.internalNotes || sub.additionalNotes || '',
        listedDate: today,
        isDemoData: false,
      })
      .returning();

    // Link existing media metadata rows without duplicating storage files
    await tx
      .update(propertyMedia)
      .set({ propertyId: createdProp.id })
      .where(eq(propertyMedia.submissionId, sub.id));

    if (agentId) {
      await tx.insert(propertyAssignments).values({
        propertyId: createdProp.id,
        agentId,
        previousAgentId: null,
        assignedBy: params.actor.id,
        assignmentStatus: 'ACTIVE',
        notes: `Assigned during conversion from ${sub.referenceNumber}`,
      });

      await createNotification(tx, {
        recipientUserId: agentId,
        recipientRole: 'AGENT',
        eventType: 'PROPERTY_ASSIGNED',
        title: `Property Assigned: ${createdProp.code}`,
        message: `${createdProp.title} (${createdProp.location}) was assigned to you.`,
        entityType: 'Property',
        entityId: createdProp.id,
      });
    }

    const [updatedSub] = await tx
      .update(propertySubmissions)
      .set({
        status: 'CONVERTED_TO_PROPERTY',
        convertedPropertyId: createdProp.id,
        assignedAgentId: agentId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(propertySubmissions.id, sub.id))
      .returning();

    await tx.insert(propertySubmissionHistory).values({
      submissionId: sub.id,
      actorId: params.actor.id,
      actorName: params.actor.name,
      action: 'CONVERTED_TO_PROPERTY',
      previousStatus: sub.status,
      newStatus: 'CONVERTED_TO_PROPERTY',
      notes: `Converted to CRM property ${createdProp.code} (unpublished draft)`,
    });

    await recordAuditLog(tx, {
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'SUBMISSION_CONVERTED_TO_PROPERTY',
      entityType: 'PropertySubmission',
      entityId: sub.id,
      previousValue: { status: sub.status },
      newValue: {
        status: 'CONVERTED_TO_PROPERTY',
        propertyId: createdProp.id,
        propertyCode: createdProp.code,
        isPublished: false,
      },
    });

    return { submission: updatedSub, property: createdProp, seller: sellerRecord };
  });
}

export async function setPropertyPublishedStateTx(params: {
  propertyId: number;
  publish: boolean;
  actor: typeof users.$inferSelect;
  notes?: string;
}) {
  return await db.transaction(async (tx) => {
    const [prop] = await tx
      .select()
      .from(properties)
      .where(eq(properties.id, params.propertyId))
      .limit(1);

    if (!prop) throw new Error('PROPERTY_NOT_FOUND');

    if (params.publish && prop.approvalStatus !== 'APPROVED') {
      throw new Error('ONLY_APPROVED_CAN_PUBLISH');
    }

    const now = new Date();
    const prevPublished = prop.isPublished;

    const [updated] = await tx
      .update(properties)
      .set(
        params.publish
          ? {
              isPublished: true,
              publishedAt: now,
              publishedBy: params.actor.id,
              updatedAt: now,
            }
          : {
              isPublished: false,
              unpublishedAt: now,
              unpublishedBy: params.actor.id,
              updatedAt: now,
            }
      )
      .where(eq(properties.id, prop.id))
      .returning();

    await tx.insert(propertyPublicationHistory).values({
      propertyId: prop.id,
      actorId: params.actor.id,
      actorName: params.actor.name,
      action: params.publish ? 'PUBLISHED' : 'UNPUBLISHED',
      notes: params.notes?.trim() || '',
    });

    await createNotification(tx, {
      recipientRole: 'ADMIN',
      recipientUserId: prop.assignedAgentId ?? null,
      eventType: params.publish ? 'PROPERTY_PUBLISHED' : 'PROPERTY_UNPUBLISHED',
      title: `${prop.code} ${params.publish ? 'Published' : 'Unpublished'}`,
      message: `${prop.title} is now ${
        params.publish ? 'live on the public website' : 'removed from public visibility'
      }.`,
      entityType: 'Property',
      entityId: prop.id,
    });

    await recordAuditLog(tx, {
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: params.publish ? 'PROPERTY_PUBLISHED' : 'PROPERTY_UNPUBLISHED',
      entityType: 'Property',
      entityId: prop.id,
      previousValue: { isPublished: prevPublished },
      newValue: { isPublished: params.publish, notes: params.notes || '' },
    });

    return updated;
  });
}

export async function assignPropertyAgentTx(params: {
  propertyId: number;
  agentId: number;
  actor: typeof users.$inferSelect;
  notes?: string;
}) {
  return await db.transaction(async (tx) => {
    const [prop] = await tx
      .select()
      .from(properties)
      .where(eq(properties.id, params.propertyId))
      .limit(1);
    if (!prop) throw new Error('PROPERTY_NOT_FOUND');

    const [targetAgent] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, params.agentId), eq(users.active, true)))
      .limit(1);
    if (!targetAgent || (targetAgent.role !== 'AGENT' && targetAgent.role !== 'ADMIN')) {
      throw new Error('INVALID_AGENT');
    }

    const previousAgentId = prop.assignedAgentId;

    await tx
      .update(propertyAssignments)
      .set({ assignmentStatus: 'REASSIGNED' })
      .where(
        and(
          eq(propertyAssignments.propertyId, prop.id),
          eq(propertyAssignments.assignmentStatus, 'ACTIVE')
        )
      );

    const [assignmentRow] = await tx
      .insert(propertyAssignments)
      .values({
        propertyId: prop.id,
        agentId: targetAgent.id,
        previousAgentId: previousAgentId ?? null,
        assignedBy: params.actor.id,
        assignmentStatus: 'ACTIVE',
        notes: params.notes?.trim() || '',
      })
      .returning();

    const [updatedProp] = await tx
      .update(properties)
      .set({ assignedAgentId: targetAgent.id, updatedAt: new Date() })
      .where(eq(properties.id, prop.id))
      .returning();

    await createNotification(tx, {
      recipientUserId: targetAgent.id,
      recipientRole: targetAgent.role,
      eventType: 'PROPERTY_ASSIGNED',
      title: `Assigned Property ${prop.code}`,
      message: `${prop.title} (${prop.location}) has been assigned to you by ${params.actor.name}.`,
      entityType: 'Property',
      entityId: prop.id,
    });

    await recordAuditLog(tx, {
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      action: 'PROPERTY_ASSIGNED',
      entityType: 'Property',
      entityId: prop.id,
      previousValue: { assignedAgentId: previousAgentId },
      newValue: {
        assignedAgentId: targetAgent.id,
        agentName: targetAgent.name,
        notes: params.notes || '',
      },
    });

    return { property: updatedProp, assignment: assignmentRow, agent: targetAgent };
  });
}

// Clean in-memory rate limiter for public submissions
const publicSubmissionBuckets = new Map<string, number[]>();

export function checkPublicRateLimit(ip: string, maxRequests = 10, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const prev = (publicSubmissionBuckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (prev.length >= maxRequests) {
    publicSubmissionBuckets.set(ip, prev);
    return false;
  }
  prev.push(now);
  publicSubmissionBuckets.set(ip, prev);
  return true;
}

export async function findRecentDuplicateSubmission(
  mobileNumber: string,
  location: string,
  propertyType: string
) {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
  const [dup] = await db
    .select({
      id: propertySubmissions.id,
      referenceNumber: propertySubmissions.referenceNumber,
    })
    .from(propertySubmissions)
    .where(
      and(
        eq(propertySubmissions.mobileNumber, mobileNumber.trim()),
        eq(propertySubmissions.propertyType, propertyType.trim()),
        sql`lower(${propertySubmissions.location}) = ${location.trim().toLowerCase()}`,
        ne(propertySubmissions.status, 'REJECTED'),
        sql`${propertySubmissions.submittedAt} >= ${tenMinutesAgo}`
      )
    )
    .limit(1);
  return dup || null;
}

export async function listMediaForPropertyIds(propertyIds: number[]) {
  if (propertyIds.length === 0) return [];
  return await db
    .select()
    .from(propertyMedia)
    .where(sql`${propertyMedia.propertyId} IN (${sql.join(propertyIds.map((id) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(propertyMedia.isCover), propertyMedia.displayOrder, propertyMedia.id);
}
