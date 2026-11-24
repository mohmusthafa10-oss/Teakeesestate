import {
  AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export type CRMUserRole = 'ADMIN' | 'TELECALLER' | 'AGENT';
export type SubmissionStatus =
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_PROPERTY';
export type ContactSlaStatus = 'PENDING' | 'CONTACTED' | 'OVERDUE';
export type MediaCategory = 'PHOTO' | 'VIDEO';
export type PropertyApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').unique(),
    legacyId: text('legacy_id').unique(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone').default('').notNull(),
    role: text('role').$type<CRMUserRole>().default('AGENT').notNull(),
    designation: text('designation').default('Property Advisor').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('users_role_idx').on(t.role),
    index('users_active_idx').on(t.active),
  ]
);

export const sellers = pgTable(
  'sellers',
  {
    id: serial('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email').default('').notNull(),
    whatsapp: text('whatsapp').default('').notNull(),
    address: text('address').default('').notNull(),
    relationshipWithProperty: text('relationship_with_property').default('Owner').notNull(),
    notes: text('notes').default('').notNull(),
    assignedAgentId: integer('assigned_agent_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
    lastContactMethod: text('last_contact_method'),
    lastConversationNotes: text('last_conversation_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sellers_phone_idx').on(t.phone),
    index('sellers_assigned_agent_idx').on(t.assignedAgentId),
  ]
);

export const propertySubmissions = pgTable(
  'property_submissions',
  {
    id: serial('id').primaryKey(),
    referenceNumber: text('reference_number').notNull().unique(),
    sellerName: text('seller_name').notNull(),
    mobileNumber: text('mobile_number').notNull(),
    sellerEmail: text('seller_email').default('').notNull(),
    propertyType: text('property_type').notNull(),
    location: text('location').notNull(),
    district: text('district').default(''),
    panchayath: text('panchayath').default(''),
    locality: text('locality').default(''),
    shortDescription: text('short_description').notNull(),
    expectedPrice: bigint('expected_price', { mode: 'number' }),
    propertySize: text('property_size'),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    additionalNotes: text('additional_notes'),
    source: text('source').$type<'PUBLIC' | 'TELECALLER'>().default('PUBLIC').notNull(),
    submittedByUserId: integer('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    status: text('status')
      .$type<SubmissionStatus>()
      .default('PENDING_REVIEW')
      .notNull(),
    rejectionReason: text('rejection_reason'),
    correctionNotes: text('correction_notes'),
    internalNotes: text('internal_notes').default('').notNull(),
    assignedAgentId: integer('assigned_agent_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    convertedPropertyId: integer('converted_property_id')
      .references((): AnyPgColumn => properties.id, { onDelete: 'set null' })
      .unique(),
    reviewedBy: integer('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    contactDeadlineAt: timestamp('contact_deadline_at', { withTimezone: true }).notNull(),
    firstContactAt: timestamp('first_contact_at', { withTimezone: true }),
    contactStatus: text('contact_status')
      .$type<ContactSlaStatus>()
      .default('PENDING')
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('sub_status_idx').on(t.status),
    index('sub_mobile_idx').on(t.mobileNumber),
    index('sub_deadline_idx').on(t.contactDeadlineAt),
    index('sub_contact_status_idx').on(t.contactStatus),
    index('sub_submitted_by_idx').on(t.submittedByUserId),
  ]
);

export const properties = pgTable(
  'properties',
  {
    id: serial('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    type: text('type').notNull(),
    category: text('category').default('Residential').notNull(),
    district: text('district').default('').notNull(),
    panchayath: text('panchayath').default('').notNull(),
    locality: text('locality').default('').notNull(),
    fullAddress: text('full_address').default(''),
    googleMapsUrl: text('google_maps_url').default(''),
    location: text('location').notNull(),
    areaValue: doublePrecision('area_value').default(0).notNull(),
    areaUnit: text('area_unit').default('Cents').notNull(),
    areaDisplay: text('area_display').default('').notNull(),
    bedrooms: integer('bedrooms'),
    bathrooms: integer('bathrooms'),
    roadConnectivity: text('road_connectivity').default('Tar Road Access').notNull(),
    expectedPrice: bigint('expected_price', { mode: 'number' }).default(0).notNull(),
    marketPrice: bigint('market_price', { mode: 'number' }),
    description: text('description').notNull(),
    sellerId: integer('seller_id')
      .references(() => sellers.id, { onDelete: 'restrict' })
      .notNull(),
    submissionId: integer('submission_id')
      .references(() => propertySubmissions.id, { onDelete: 'set null' })
      .unique(),
    status: text('status').default('Available').notNull(),
    approvalStatus: text('approval_status')
      .$type<PropertyApprovalStatus>()
      .default('APPROVED')
      .notNull(),
    isPublished: boolean('is_published').default(false).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: integer('published_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    unpublishedAt: timestamp('unpublished_at', { withTimezone: true }),
    unpublishedBy: integer('unpublished_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAgentId: integer('assigned_agent_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    internalNotes: text('internal_notes').default('').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    listedDate: text('listed_date').notNull(),
    isDemoData: boolean('is_demo_data').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('prop_status_idx').on(t.status),
    index('prop_approval_idx').on(t.approvalStatus),
    index('prop_published_idx').on(t.isPublished),
    index('prop_agent_idx').on(t.assignedAgentId),
    index('prop_seller_idx').on(t.sellerId),
  ]
);

export const propertyMedia = pgTable(
  'property_media',
  {
    id: serial('id').primaryKey(),
    propertyId: integer('property_id').references(() => properties.id, {
      onDelete: 'cascade',
    }),
    submissionId: integer('submission_id').references(() => propertySubmissions.id, {
      onDelete: 'cascade',
    }),
    originalFilename: text('original_filename').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    fileType: text('file_type').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    mediaCategory: text('media_category').$type<MediaCategory>().notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    isCover: boolean('is_cover').default(false).notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSeconds: integer('duration_seconds'),
    storageProvider: text('storage_provider').default('LOCAL').notNull(),
    thumbnailStorageKey: text('thumbnail_storage_key'),
    externalUrl: text('external_url'),
    uploadedBy: integer('uploaded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('media_property_idx').on(t.propertyId),
    index('media_submission_idx').on(t.submissionId),
    index('media_category_idx').on(t.mediaCategory),
  ]
);

export const propertyAssignments = pgTable(
  'property_assignments',
  {
    id: serial('id').primaryKey(),
    propertyId: integer('property_id')
      .references(() => properties.id, { onDelete: 'cascade' })
      .notNull(),
    agentId: integer('agent_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    previousAgentId: integer('previous_agent_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedBy: integer('assigned_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    assignmentStatus: text('assignment_status')
      .$type<'ACTIVE' | 'REASSIGNED'>()
      .default('ACTIVE')
      .notNull(),
    notes: text('notes').default('').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('assign_property_idx').on(t.propertyId),
    index('assign_agent_idx').on(t.agentId),
    index('assign_status_idx').on(t.assignmentStatus),
  ]
);

export const propertySubmissionHistory = pgTable(
  'property_submission_history',
  {
    id: serial('id').primaryKey(),
    submissionId: integer('submission_id')
      .references(() => propertySubmissions.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    previousStatus: text('previous_status'),
    newStatus: text('new_status'),
    notes: text('notes').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sub_hist_submission_idx').on(t.submissionId)]
);

export const propertyPublicationHistory = pgTable(
  'property_publication_history',
  {
    id: serial('id').primaryKey(),
    propertyId: integer('property_id')
      .references(() => properties.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    action: text('action').$type<'PUBLISHED' | 'UNPUBLISHED'>().notNull(),
    notes: text('notes').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('pub_hist_property_idx').on(t.propertyId)]
);

export const propertyFollowUps = pgTable(
  'property_follow_ups',
  {
    id: serial('id').primaryKey(),
    propertyId: integer('property_id').references(() => properties.id, {
      onDelete: 'cascade',
    }),
    submissionId: integer('submission_id').references(() => propertySubmissions.id, {
      onDelete: 'cascade',
    }),
    agentId: integer('agent_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    activityType: text('activity_type').default('Call').notNull(),
    scheduledDate: text('scheduled_date').notNull(),
    scheduledTime: text('scheduled_time').default('10:30').notNull(),
    notes: text('notes').default('').notNull(),
    status: text('status').$type<'PENDING' | 'COMPLETED'>().default('PENDING').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('fup_property_idx').on(t.propertyId),
    index('fup_agent_idx').on(t.agentId),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    recipientUserId: integer('recipient_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    recipientRole: text('recipient_role').$type<CRMUserRole>(),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    isRead: boolean('is_read').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('notif_user_idx').on(t.recipientUserId),
    index('notif_role_idx').on(t.recipientRole),
    index('notif_read_idx').on(t.isRead),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    actorRole: text('actor_role').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_entity_idx').on(t.entityType, t.entityId),
    index('audit_created_idx').on(t.createdAt),
    uniqueIndex('audit_id_idx').on(t.id),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  assignedProperties: many(properties),
  submissions: many(propertySubmissions),
}));

export const sellersRelations = relations(sellers, ({ one, many }) => ({
  assignedAgent: one(users, {
    fields: [sellers.assignedAgentId],
    references: [users.id],
  }),
  properties: many(properties),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  seller: one(sellers, {
    fields: [properties.sellerId],
    references: [sellers.id],
  }),
  assignedAgent: one(users, {
    fields: [properties.assignedAgentId],
    references: [users.id],
  }),
  media: many(propertyMedia),
  assignments: many(propertyAssignments),
  publicationHistory: many(propertyPublicationHistory),
  followUps: many(propertyFollowUps),
}));

export const propertySubmissionsRelations = relations(
  propertySubmissions,
  ({ one, many }) => ({
    submittedBy: one(users, {
      fields: [propertySubmissions.submittedByUserId],
      references: [users.id],
    }),
    assignedAgent: one(users, {
      fields: [propertySubmissions.assignedAgentId],
      references: [users.id],
    }),
    media: many(propertyMedia),
    history: many(propertySubmissionHistory),
  })
);

export const propertyMediaRelations = relations(propertyMedia, ({ one }) => ({
  property: one(properties, {
    fields: [propertyMedia.propertyId],
    references: [properties.id],
  }),
  submission: one(propertySubmissions, {
    fields: [propertyMedia.submissionId],
    references: [propertySubmissions.id],
  }),
}));
