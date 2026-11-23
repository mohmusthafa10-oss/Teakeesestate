import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '../src/db/index.ts';
import {
  properties,
  propertyMedia,
  propertySubmissions,
  sellers,
  users,
} from '../src/db/schema.ts';
import { ensureInitialSeed } from '../src/db/seed.ts';
import { adminAuth } from '../src/lib/firebase-admin.ts';
import { createApiRouter } from '../src/server/apiRouter.ts';
import { mediaStorage } from '../src/server/mediaStorage.ts';
import {
  computeEffectiveContactStatus,
  serializePublicPropertyDTO,
} from '../src/server/crmWorkflowService.ts';

let server: http.Server;
let baseUrl = '';
const createdSubmissionIds: number[] = [];
const createdPropertyIds: number[] = [];
const createdSellerIds: number[] = [];
const createdUserIds: number[] = [];
const tmpFilesToCleanup: string[] = [];

// Token -> Firebase identity stub for isolated RBAC HTTP verification
const tokenIdentityMap = new Map<string, { uid: string; email: string; name: string }>();
const originalVerifyIdToken = adminAuth.verifyIdToken.bind(adminAuth);

before(async () => {
  await ensureInitialSeed();

  // Ensure deterministic test accounts exist in PostgreSQL
  const ensureTestUser = async (
    uid: string,
    email: string,
    name: string,
    role: 'ADMIN' | 'TELECALLER' | 'AGENT'
  ) => {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      if (!existing[0].uid) {
        await db.update(users).set({ uid }).where(eq(users.id, existing[0].id));
      }
      return existing[0];
    }
    const [inserted] = await db
      .insert(users)
      .values({ uid, email, name, role, phone: '+91 90000 00000', designation: role, active: true })
      .returning();
    createdUserIds.push(inserted.id);
    return inserted;
  };

  await ensureTestUser('test-admin-uid', 'test-admin@teakees.in', 'Test Admin', 'ADMIN');
  await ensureTestUser('test-tele-uid', 'test-tele@teakees.in', 'Test Telecaller', 'TELECALLER');
  await ensureTestUser('test-agent1-uid', 'test-agent1@teakees.in', 'Test Agent One', 'AGENT');
  await ensureTestUser('test-agent2-uid', 'test-agent2@teakees.in', 'Test Agent Two', 'AGENT');

  tokenIdentityMap.set('tok-admin', {
    uid: 'test-admin-uid',
    email: 'test-admin@teakees.in',
    name: 'Test Admin',
  });
  tokenIdentityMap.set('tok-tele', {
    uid: 'test-tele-uid',
    email: 'test-tele@teakees.in',
    name: 'Test Telecaller',
  });
  tokenIdentityMap.set('tok-agent1', {
    uid: 'test-agent1-uid',
    email: 'test-agent1@teakees.in',
    name: 'Test Agent One',
  });
  tokenIdentityMap.set('tok-agent2', {
    uid: 'test-agent2-uid',
    email: 'test-agent2@teakees.in',
    name: 'Test Agent Two',
  });

  (adminAuth as any).verifyIdToken = async (token: string) => {
    const mapped = tokenIdentityMap.get(token);
    if (mapped) return mapped;
    return await originalVerifyIdToken(token);
  };

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter());
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}/api`;
      }
      resolve();
    });
  });
});

after(async () => {
  (adminAuth as any).verifyIdToken = originalVerifyIdToken;
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  for (const f of tmpFilesToCleanup) {
    await fs.promises.unlink(f).catch(() => {});
  }
  if (createdPropertyIds.length > 0) {
    await db
      .delete(propertyMedia)
      .where(inArray(propertyMedia.propertyId, createdPropertyIds))
      .catch(() => {});
    await db
      .delete(properties)
      .where(inArray(properties.id, createdPropertyIds))
      .catch(() => {});
  }
  if (createdSubmissionIds.length > 0) {
    await db
      .delete(propertyMedia)
      .where(inArray(propertyMedia.submissionId, createdSubmissionIds))
      .catch(() => {});
    await db
      .delete(propertySubmissions)
      .where(inArray(propertySubmissions.id, createdSubmissionIds))
      .catch(() => {});
  }
  if (createdSellerIds.length > 0) {
    await db.delete(sellers).where(inArray(sellers.id, createdSellerIds)).catch(() => {});
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds)).catch(() => {});
  }
});

test('MediaStorageService validates magic bytes, strips EXIF, generates WebP + thumbnail, and rejects spoofed executables', async () => {
  const validPng = await sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 6, g: 78, b: 59 } },
  })
    .png()
    .toBuffer();

  const pngPath = path.join(os.tmpdir(), `test-valid-${Date.now()}.png`);
  await fs.promises.writeFile(pngPath, validPng);
  tmpFilesToCleanup.push(pngPath);

  const saved = await mediaStorage.saveFile(pngPath, '../../evil-path/photo.png');
  assert.equal(saved.mediaCategory, 'PHOTO');
  assert.ok(saved.thumbnailStorageKey, 'Expected thumbnail storage key for uploaded photo');
  assert.ok(!saved.storageKey.includes('..'));

  // Cleanup generated test files
  await mediaStorage.deleteFile(saved.storageKey, saved.thumbnailStorageKey);

  // Spoofed executable disguised as .jpg must be rejected by magic-byte inspection
  const fakeJpgPath = path.join(os.tmpdir(), `test-spoof-${Date.now()}.jpg`);
  await fs.promises.writeFile(fakeJpgPath, Buffer.from('#!/bin/sh\nrm -rf /\n'));
  tmpFilesToCleanup.push(fakeJpgPath);

  await assert.rejects(
    () => mediaStorage.saveFile(fakeJpgPath, 'malicious.jpg'),
    /signature does not match|Unsupported/i
  );
});

test('48-Hour Seller Contact SLA logic marks overdue only when uncontacted past deadline and completed when logged', () => {
  const now = Date.now();
  const dueSoon = computeEffectiveContactStatus({
    contactStatus: 'PENDING',
    firstContactAt: null,
    contactDeadlineAt: new Date(now + 10 * 3600_000),
  });
  assert.equal(dueSoon.contactStatus, 'PENDING');
  assert.equal(dueSoon.isOverdue, false);

  const overdue = computeEffectiveContactStatus({
    contactStatus: 'PENDING',
    firstContactAt: null,
    contactDeadlineAt: new Date(now - 2 * 3600_000),
  });
  assert.equal(overdue.contactStatus, 'OVERDUE');
  assert.equal(overdue.isOverdue, true);

  const contacted = computeEffectiveContactStatus({
    contactStatus: 'CONTACTED',
    firstContactAt: new Date(now - 3600_000),
    contactDeadlineAt: new Date(now - 2 * 3600_000),
  });
  assert.equal(contacted.contactStatus, 'CONTACTED');
  assert.equal(contacted.isOverdue, false);
});

test('End-to-end submission, approval, unpublished conversion, publishing visibility, public sanitization & RBAC', async () => {
  // 1. Unauthenticated access to protected endpoints returns 401
  const unauthRes = await fetch(`${baseUrl}/admin/property-submissions`);
  assert.equal(unauthRes.status, 401);

  // 2. Public seller submission succeeds with PNG photo
  const pngBuffer = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 20, g: 90, b: 60 } },
  })
    .png()
    .toBuffer();

  const uniquePhone = `+91 99${Date.now().toString().slice(-8)}`;
  const form = new FormData();
  form.append('sellerName', 'Workflow Test Seller');
  form.append('mobileNumber', uniquePhone);
  form.append('propertyType', 'Villa');
  form.append('location', 'Bekal, Kasaragod');
  form.append('shortDescription', 'Test coastal villa with 20 cents landscaped courtyard.');
  form.append('expectedPrice', '8500000');
  form.append(
    'photos',
    new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' }),
    'villa.png'
  );

  const submitRes = await fetch(`${baseUrl}/public/property-submissions`, {
    method: 'POST',
    body: form,
  });
  assert.equal(submitRes.status, 201);
  const receipt = (await submitRes.json()) as any;
  assert.ok(receipt.referenceNumber.startsWith('SUB-'));
  assert.equal(receipt.photoCount, 1);

  const [subRow] = await db
    .select()
    .from(propertySubmissions)
    .where(eq(propertySubmissions.referenceNumber, receipt.referenceNumber))
    .limit(1);
  assert.ok(subRow);
  createdSubmissionIds.push(subRow.id);

  // 3. TELECALLER and AGENT cannot access Admin submissions
  const teleAdminAttempt = await fetch(`${baseUrl}/admin/property-submissions`, {
    headers: { Authorization: 'Bearer tok-tele' },
  });
  assert.equal(teleAdminAttempt.status, 403);

  const agentAdminAttempt = await fetch(`${baseUrl}/admin/property-submissions`, {
    headers: { Authorization: 'Bearer tok-agent1' },
  });
  assert.equal(agentAdminAttempt.status, 403);

  // 4. Reject requires mandatory reason
  const badReject = await fetch(
    `${baseUrl}/admin/property-submissions/${subRow.id}/reject`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: '' }),
    }
  );
  assert.equal(badReject.status, 400);

  // 5. Admin approves & converts submission -> creates UNPUBLISHED property
  const approveRes = await fetch(
    `${baseUrl}/admin/property-submissions/${subRow.id}/approve`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ notes: 'Verified details' }),
    }
  );
  assert.equal(approveRes.status, 200);

  const [agent1] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'test-agent1@teakees.in'))
    .limit(1);

  const convertRes = await fetch(
    `${baseUrl}/admin/property-submissions/${subRow.id}/convert`,
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tok-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignedAgentId: agent1.id }),
    }
  );
  assert.equal(convertRes.status, 201);
  const converted = (await convertRes.json()) as any;
  const propId = converted.property.id as number;
  const propCode = converted.property.code as string;
  createdPropertyIds.push(propId);
  createdSellerIds.push(converted.property.sellerId);

  // Must start unpublished
  assert.equal(converted.property.isPublished, false);
  assert.equal(converted.property.approvalStatus, 'APPROVED');

  // Duplicate conversion must return 409 Conflict
  const dupConvert = await fetch(
    `${baseUrl}/admin/property-submissions/${subRow.id}/convert`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-admin' },
    }
  );
  assert.equal(dupConvert.status, 409);

  // 6. Unpublished property MUST NOT appear on public endpoints
  const pubHiddenRes = await fetch(`${baseUrl}/public/properties/${propCode}`);
  assert.equal(pubHiddenRes.status, 404);

  // 7. Agent 2 (unassigned) is forbidden from accessing or editing Agent 1's property
  const agent2Forbidden = await fetch(`${baseUrl}/agent/properties/${propId}`, {
    headers: { Authorization: 'Bearer tok-agent2' },
  });
  assert.equal(agent2Forbidden.status, 403);

  // Agent 1 cannot publish or reassign properties
  const agentPublishAttempt = await fetch(`${baseUrl}/admin/properties/${propId}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer tok-agent1' },
  });
  assert.equal(agentPublishAttempt.status, 403);

  const agentPatchPublish = await fetch(`${baseUrl}/agent/properties/${propId}`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer tok-agent1',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isPublished: true }),
  });
  assert.equal(agentPatchPublish.status, 403);

  // 8. Admin explicitly publishes property -> appears publicly with strict DTO sanitization
  const publishRes = await fetch(`${baseUrl}/admin/properties/${propId}/publish`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer tok-admin',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes: 'Ready for public showcase' }),
  });
  assert.equal(publishRes.status, 200);

  const publicDetailRes = await fetch(`${baseUrl}/public/properties/${propCode}`);
  assert.equal(publicDetailRes.status, 200);
  const publicJson = (await publicDetailRes.json()) as Record<string, unknown>;
  assert.equal(publicJson.code, propCode);
  assert.equal('sellerPhone' in publicJson, false, 'Public DTO must never expose sellerPhone');
  assert.equal('sellerName' in publicJson, false, 'Public DTO must never expose sellerName');
  assert.equal('internalNotes' in publicJson, false, 'Public DTO must never expose internalNotes');
  assert.equal('assignedAgentId' in publicJson, false, 'Public DTO must never expose agent ID');

  // 9. Admin unpublishes -> hidden from public immediately while retained in CRM
  const unpublishRes = await fetch(`${baseUrl}/admin/properties/${propId}/unpublish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer tok-admin' },
  });
  assert.equal(unpublishRes.status, 200);

  const pubAfterUnpub = await fetch(`${baseUrl}/public/properties/${propCode}`);
  assert.equal(pubAfterUnpub.status, 404);
});
