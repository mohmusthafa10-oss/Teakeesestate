import { createSeedDatabase } from '../data/seedData';
import {
  ActivityLog,
  AgencySettings,
  CRMDatabase,
  Deal,
  Expense,
  FollowUp,
  Investment,
  Investor,
  Lead,
  Property,
  PropertyDocument,
  PropertyImage,
  PropertyMatch,
  PropertyStatus,
  RentalBooking,
  RunningCategory,
  Seller,
  SiteVisit,
  Tenant,
  User,
} from '../types/crm';
import { generateId, getTodayISO } from '../utils/formatters';

const STORAGE_KEY = 're_crm_database_v1';

function loadDatabase(): CRMDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedDatabase();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as CRMDatabase;
    if (!parsed || !Array.isArray(parsed.properties) || !parsed.settings) {
      const seed = createSeedDatabase();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    return createSeedDatabase();
  }
}

function saveDatabase(db: CRMDatabase): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function nextCode(prefix: string, existingCodes: string[], start = 1001): string {
  const nums = existingCodes
    .map((c) => {
      const m = c.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => n > 0);
  const maxNum = nums.length > 0 ? Math.max(...nums) : start - 1;
  return `${prefix}-${maxNum + 1}`;
}

export function statusToRunningCategory(
  status: PropertyStatus,
  isManaged: boolean
): RunningCategory {
  if (status === 'Sold') return 'Inactive';
  if (status === 'Inactive') return 'Inactive';
  if (status === 'Rented') return isManaged ? 'Managed / Operating' : 'Rented / Occupied';
  if (status === 'Under Negotiation') return 'Under Negotiation';
  if (status === 'Reserved') return 'Reserved';
  return isManaged ? 'Managed / Operating' : 'Active Listing';
}

export const crmService = {
  getDatabase(): CRMDatabase {
    return loadDatabase();
  },

  resetToDemo(): CRMDatabase {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    return seed;
  },

  appendActivity(
    db: CRMDatabase,
    entry: Omit<ActivityLog, 'id' | 'timestamp'>
  ): ActivityLog[] {
    const log: ActivityLog = {
      ...entry,
      id: generateId('act'),
      timestamp: new Date().toISOString(),
    };
    return [log, ...db.activityLogs].slice(0, 120);
  },

  // Combined Seller + Property (or Add Property to Existing Seller)
  registerSellerAndProperty(
    db: CRMDatabase,
    payload: {
      mode: 'new-seller' | 'existing-seller';
      existingSellerId?: string;
      seller?: {
        name: string;
        phone: string;
        whatsapp: string;
        address: string;
        notes?: string;
      };
      property: {
        title: string;
        type: Property['type'];
        location: string;
        areaValue: number;
        areaUnit: Property['areaUnit'];
        askingPrice: number;
        description: string;
        assignedAgentId: string;
        status: PropertyStatus;
        isManaged?: boolean;
        nextFollowUpDate: string;
        internalNotes: string;
        images: { url: string; caption: string }[];
        documents: { name: string; docType: string; fileSize: string }[];
      };
    }
  ): { db: CRMDatabase; property: Property; seller: Seller } {
    const now = new Date().toISOString();
    const today = getTodayISO();
    const actorId = db.settings.currentUserId;

    let seller: Seller;
    let updatedSellers = [...db.sellers];

    if (payload.mode === 'existing-seller' && payload.existingSellerId) {
      const found = db.sellers.find((s) => s.id === payload.existingSellerId);
      if (!found) throw new Error('Selected seller record not found.');
      seller = {
        ...found,
        lastContactAt: now,
        updated_at: now,
      };
      updatedSellers = updatedSellers.map((s) => (s.id === seller.id ? seller : s));
    } else {
      if (!payload.seller || !payload.seller.name.trim()) {
        throw new Error('Seller name is required.');
      }
      seller = {
        id: generateId('slr'),
        code: nextCode(
          'SLR',
          db.sellers.map((s) => s.code),
          1001
        ),
        name: payload.seller.name.trim(),
        phone: payload.seller.phone.trim(),
        whatsapp: (payload.seller.whatsapp || payload.seller.phone).trim(),
        address: payload.seller.address.trim(),
        notes: payload.seller.notes?.trim() || '',
        assignedAgentId: payload.property.assignedAgentId,
        lastContactAt: now,
        created_at: now,
        updated_at: now,
      };
      updatedSellers = [seller, ...updatedSellers];
    }

    const areaDisplay = `${payload.property.areaValue} ${payload.property.areaUnit}`;
    const isManaged = Boolean(payload.property.isManaged);
    const property: Property = {
      id: generateId('prp'),
      code: nextCode(
        'PRP',
        db.properties.map((p) => p.code),
        2001
      ),
      title: payload.property.title.trim(),
      type: payload.property.type,
      location: payload.property.location.trim(),
      areaValue: payload.property.areaValue,
      areaUnit: payload.property.areaUnit,
      areaDisplay,
      askingPrice: payload.property.askingPrice,
      description: payload.property.description.trim(),
      sellerId: seller.id,
      status: payload.property.status,
      runningCategory: statusToRunningCategory(payload.property.status, isManaged),
      isManaged,
      assignedAgentId: payload.property.assignedAgentId,
      internalNotes: payload.property.internalNotes.trim(),
      nextFollowUpDate: payload.property.nextFollowUpDate,
      addedDate: today,
      coordinates: {
        lat: 12.2 + Math.random() * 0.25,
        lng: 75.02 + Math.random() * 0.25,
      },
      created_at: now,
      updated_at: now,
    };

    const newImages: PropertyImage[] = payload.property.images
      .filter((img) => img.url.trim())
      .map((img, idx) => ({
        id: generateId('img'),
        propertyId: property.id,
        url: img.url.trim(),
        caption: img.caption.trim() || `Property photo ${idx + 1}`,
        isPrimary: idx === 0,
        created_at: now,
      }));

    const newDocs: PropertyDocument[] = payload.property.documents
      .filter((doc) => doc.name.trim())
      .map((doc) => ({
        id: generateId('doc'),
        entityType: 'Property',
        entityId: property.id,
        name: doc.name.trim(),
        docType: doc.docType || 'Property Document',
        fileSize: doc.fileSize || '1.2 MB',
        uploadedAt: today,
      }));

    let updatedFollowUps = [...db.followUps];
    if (payload.property.nextFollowUpDate) {
      const fup: FollowUp = {
        id: generateId('fup'),
        title: `Property follow-up: ${property.title}`,
        relatedType: 'Seller',
        relatedId: seller.id,
        propertyId: property.id,
        assignedAgentId: property.assignedAgentId,
        date: payload.property.nextFollowUpDate,
        time: db.settings.followUpDefaults.defaultTime || '10:30',
        activityType: 'Call',
        notes: payload.property.internalNotes || 'Scheduled during property onboarding.',
        status: 'Pending',
        created_at: now,
        updated_at: now,
      };
      updatedFollowUps = [fup, ...updatedFollowUps];
    }

    let nextDb: CRMDatabase = {
      ...db,
      sellers: updatedSellers,
      properties: [property, ...db.properties],
      propertyImages: [...newImages, ...db.propertyImages],
      propertyDocuments: [...newDocs, ...db.propertyDocuments],
      followUps: updatedFollowUps,
    };

    if (payload.mode === 'new-seller') {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Seller',
        entityId: seller.id,
        action: 'Seller Registered',
        summary: `New seller ${seller.name} registered with property ${property.title}`,
        actorId,
      });
    } else {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: property.id,
        action: 'Property Added',
        summary: `Added ${property.title} under existing seller ${seller.name}`,
        actorId,
      });
    }

    saveDatabase(nextDb);
    return { db: nextDb, property, seller };
  },

  updateProperty(
    db: CRMDatabase,
    propertyId: string,
    updates: Partial<Property>
  ): CRMDatabase {
    const now = new Date().toISOString();
    const existing = db.properties.find((p) => p.id === propertyId);
    if (!existing) throw new Error('Property not found');

    const nextStatus = updates.status ?? existing.status;
    const nextIsManaged = updates.isManaged ?? existing.isManaged;
    const nextAreaVal = updates.areaValue ?? existing.areaValue;
    const nextAreaUnit = updates.areaUnit ?? existing.areaUnit;

    const updatedProp: Property = {
      ...existing,
      ...updates,
      areaDisplay: updates.areaDisplay ?? `${nextAreaVal} ${nextAreaUnit}`,
      runningCategory:
        updates.runningCategory ?? statusToRunningCategory(nextStatus, nextIsManaged),
      updated_at: now,
    };

    const nextDb: CRMDatabase = {
      ...db,
      properties: db.properties.map((p) => (p.id === propertyId ? updatedProp : p)),
    };

    if (updates.status && updates.status !== existing.status) {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: propertyId,
        action: 'Status Updated',
        summary: `${existing.title} changed from ${existing.status} to ${updates.status}`,
        actorId: db.settings.currentUserId,
      });
    } else {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: propertyId,
        action: 'Property Updated',
        summary: `Updated details for ${updatedProp.title}`,
        actorId: db.settings.currentUserId,
      });
    }

    saveDatabase(nextDb);
    return nextDb;
  },

  deleteProperty(db: CRMDatabase, propertyId: string): CRMDatabase {
    const existing = db.properties.find((p) => p.id === propertyId);
    const hasClosedDeal = db.deals.some(
      (d) => d.propertyId === propertyId && d.status === 'Closed'
    );
    if (hasClosedDeal) {
      throw new Error('Cannot delete a property with a closed transaction.');
    }
    const nextDb: CRMDatabase = {
      ...db,
      properties: db.properties.filter((p) => p.id !== propertyId),
      propertyImages: db.propertyImages.filter((i) => i.propertyId !== propertyId),
      propertyMatches: db.propertyMatches.filter((m) => m.propertyId !== propertyId),
      followUps: db.followUps.filter((f) => f.propertyId !== propertyId),
      siteVisits: db.siteVisits.filter((s) => s.propertyId !== propertyId),
      deals: db.deals.filter((d) => d.propertyId !== propertyId),
    };
    if (existing) {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: propertyId,
        action: 'Property Removed',
        summary: `Removed property ${existing.title} (${existing.code})`,
        actorId: db.settings.currentUserId,
      });
    }
    saveDatabase(nextDb);
    return nextDb;
  },

  addPropertyImage(
    db: CRMDatabase,
    propertyId: string,
    url: string,
    caption: string,
    isPrimary = false
  ): CRMDatabase {
    const now = new Date().toISOString();
    const img: PropertyImage = {
      id: generateId('img'),
      propertyId,
      url,
      caption: caption || 'Property photo',
      isPrimary,
      created_at: now,
    };
    const updatedImages = isPrimary
      ? db.propertyImages.map((i) =>
          i.propertyId === propertyId ? { ...i, isPrimary: false } : i
        )
      : db.propertyImages;

    const nextDb: CRMDatabase = {
      ...db,
      propertyImages: [...updatedImages, img],
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  addDocument(
    db: CRMDatabase,
    doc: Omit<PropertyDocument, 'id' | 'uploadedAt'>
  ): CRMDatabase {
    const newDoc: PropertyDocument = {
      ...doc,
      id: generateId('doc'),
      uploadedAt: getTodayISO(),
    };
    const nextDb: CRMDatabase = {
      ...db,
      propertyDocuments: [newDoc, ...db.propertyDocuments],
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  deleteDocument(db: CRMDatabase, docId: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      propertyDocuments: db.propertyDocuments.filter((d) => d.id !== docId),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Sellers CRUD
  upsertSeller(
    db: CRMDatabase,
    input: Partial<Seller> & { name: string; phone: string }
  ): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const nextDb: CRMDatabase = {
        ...db,
        sellers: db.sellers.map((s) =>
          s.id === input.id ? { ...s, ...input, updated_at: now } : s
        ),
      };
      saveDatabase(nextDb);
      return nextDb;
    }
    const seller: Seller = {
      id: generateId('slr'),
      code: nextCode(
        'SLR',
        db.sellers.map((s) => s.code),
        1001
      ),
      name: input.name.trim(),
      phone: input.phone.trim(),
      whatsapp: (input.whatsapp || input.phone).trim(),
      address: input.address?.trim() || '',
      notes: input.notes?.trim() || '',
      assignedAgentId: input.assignedAgentId || db.settings.currentUserId,
      lastContactAt: now,
      created_at: now,
      updated_at: now,
    };
    const nextDb: CRMDatabase = {
      ...db,
      sellers: [seller, ...db.sellers],
    };
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Seller',
      entityId: seller.id,
      action: 'Seller Added',
      summary: `Registered seller ${seller.name}`,
      actorId: db.settings.currentUserId,
    });
    saveDatabase(nextDb);
    return nextDb;
  },

  deleteSeller(db: CRMDatabase, sellerId: string): CRMDatabase {
    const owned = db.properties.filter((p) => p.sellerId === sellerId);
    if (owned.length > 0) {
      throw new Error(
        `Cannot delete seller because ${owned.length} property record(s) are linked to this seller.`
      );
    }
    const nextDb: CRMDatabase = {
      ...db,
      sellers: db.sellers.filter((s) => s.id !== sellerId),
      followUps: db.followUps.filter(
        (f) => !(f.relatedType === 'Seller' && f.relatedId === sellerId)
      ),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Leads CRUD (Independent of properties)
  upsertLead(
    db: CRMDatabase,
    input: Partial<Lead> & { name: string; phone: string }
  ): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const existing = db.leads.find((l) => l.id === input.id);
      const nextDb: CRMDatabase = {
        ...db,
        leads: db.leads.map((l) =>
          l.id === input.id ? { ...l, ...input, updated_at: now } : l
        ),
      };
      if (existing && input.status && input.status !== existing.status) {
        nextDb.activityLogs = this.appendActivity(nextDb, {
          entityType: 'Lead',
          entityId: input.id,
          action: 'Lead Status Updated',
          summary: `${existing.name} moved from ${existing.status} to ${input.status}`,
          actorId: db.settings.currentUserId,
        });
      }
      saveDatabase(nextDb);
      return nextDb;
    }

    const lead: Lead = {
      id: generateId('led'),
      code: nextCode(
        'LED',
        db.leads.map((l) => l.code),
        3001
      ),
      name: input.name.trim(),
      phone: input.phone.trim(),
      whatsapp: (input.whatsapp || input.phone).trim(),
      preferredLocation: input.preferredLocation?.trim() || '',
      minBudget: Number(input.minBudget) || 0,
      maxBudget: Number(input.maxBudget) || 0,
      propertyType: input.propertyType || 'Any',
      requirementDescription: input.requirementDescription?.trim() || '',
      status: input.status || 'New',
      assignedAgentId: input.assignedAgentId || db.settings.currentUserId,
      nextFollowUpDate: input.nextFollowUpDate || '',
      notes: input.notes?.trim() || '',
      created_at: now,
      updated_at: now,
    };

    let followUps = [...db.followUps];
    if (lead.nextFollowUpDate) {
      followUps = [
        {
          id: generateId('fup'),
          title: `Follow up with buyer ${lead.name}`,
          relatedType: 'Lead',
          relatedId: lead.id,
          assignedAgentId: lead.assignedAgentId,
          date: lead.nextFollowUpDate,
          time: db.settings.followUpDefaults.defaultTime || '10:30',
          activityType: 'Call',
          notes: lead.requirementDescription.slice(0, 140),
          status: 'Pending',
          created_at: now,
          updated_at: now,
        },
        ...followUps,
      ];
    }

    const nextDb: CRMDatabase = {
      ...db,
      leads: [lead, ...db.leads],
      followUps,
    };
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Lead',
      entityId: lead.id,
      action: 'Lead Registered',
      summary: `New buyer lead ${lead.name} looking in ${lead.preferredLocation || 'any location'}`,
      actorId: db.settings.currentUserId,
    });
    saveDatabase(nextDb);
    return nextDb;
  },

  deleteLead(db: CRMDatabase, leadId: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      leads: db.leads.filter((l) => l.id !== leadId),
      propertyMatches: db.propertyMatches.filter((m) => m.leadId !== leadId),
      followUps: db.followUps.filter(
        (f) => !(f.relatedType === 'Lead' && f.relatedId === leadId)
      ),
      siteVisits: db.siteVisits.filter((s) => s.leadId !== leadId),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Property Matches (Many-to-Many)
  connectMatches(
    db: CRMDatabase,
    connections: {
      leadId: string;
      propertyId: string;
      matchScore: number;
      matchReasons: string[];
      markShared?: boolean;
    }[]
  ): CRMDatabase {
    const now = new Date().toISOString();
    const today = getTodayISO();
    let updatedMatches = [...db.propertyMatches];
    let updatedLeads = [...db.leads];

    connections.forEach((conn) => {
      const existing = updatedMatches.find(
        (m) => m.leadId === conn.leadId && m.propertyId === conn.propertyId
      );
      if (existing) {
        if (conn.markShared && !existing.isShared) {
          updatedMatches = updatedMatches.map((m) =>
            m.id === existing.id
              ? { ...m, isShared: true, sharedAt: today, updated_at: now }
              : m
          );
        }
      } else {
        const match: PropertyMatch = {
          id: generateId('mtc'),
          leadId: conn.leadId,
          propertyId: conn.propertyId,
          matchScore: conn.matchScore,
          matchReasons: conn.matchReasons,
          matchedAt: today,
          sharedAt: conn.markShared ? today : undefined,
          isShared: Boolean(conn.markShared),
          buyerInterest: 'Pending',
          siteVisitScheduled: false,
          outcome: 'Open',
          notes: '',
          created_at: now,
          updated_at: now,
        };
        updatedMatches = [match, ...updatedMatches];
      }

      if (conn.markShared) {
        updatedLeads = updatedLeads.map((l) =>
          l.id === conn.leadId && (l.status === 'New' || l.status === 'Contacted' || l.status === 'Qualified')
            ? { ...l, status: 'Property Shared', updated_at: now }
            : l
        );
      }
    });

    const nextDb: CRMDatabase = {
      ...db,
      propertyMatches: updatedMatches,
      leads: updatedLeads,
    };

    if (connections.length > 0) {
      const firstLead = db.leads.find((l) => l.id === connections[0].leadId);
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Match',
        entityId: connections[0].leadId,
        action: connections[0].markShared ? 'Properties Shared' : 'Properties Matched',
        summary: `Connected ${connections.length} property option(s) for ${firstLead?.name || 'buyer'}`,
        actorId: db.settings.currentUserId,
      });
    }

    saveDatabase(nextDb);
    return nextDb;
  },

  updateMatch(
    db: CRMDatabase,
    matchId: string,
    updates: Partial<PropertyMatch>
  ): CRMDatabase {
    const now = new Date().toISOString();
    const today = getTodayISO();
    const nextDb: CRMDatabase = {
      ...db,
      propertyMatches: db.propertyMatches.map((m) =>
        m.id === matchId
          ? {
              ...m,
              ...updates,
              sharedAt: updates.isShared && !m.sharedAt ? today : m.sharedAt,
              updated_at: now,
            }
          : m
      ),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  removeMatch(db: CRMDatabase, matchId: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      propertyMatches: db.propertyMatches.filter((m) => m.id !== matchId),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Follow-ups
  upsertFollowUp(
    db: CRMDatabase,
    input: Partial<FollowUp> & {
      title: string;
      relatedType: 'Lead' | 'Seller';
      relatedId: string;
      date: string;
    }
  ): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const nextDb: CRMDatabase = {
        ...db,
        followUps: db.followUps.map((f) =>
          f.id === input.id ? { ...f, ...input, updated_at: now } : f
        ),
      };
      saveDatabase(nextDb);
      return nextDb;
    }

    const fup: FollowUp = {
      id: generateId('fup'),
      title: input.title.trim(),
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      propertyId: input.propertyId || undefined,
      assignedAgentId: input.assignedAgentId || db.settings.currentUserId,
      date: input.date,
      time: input.time || db.settings.followUpDefaults.defaultTime || '10:30',
      activityType: input.activityType || 'Call',
      notes: input.notes?.trim() || '',
      status: input.status || 'Pending',
      created_at: now,
      updated_at: now,
    };

    const nextDb: CRMDatabase = {
      ...db,
      followUps: [fup, ...db.followUps],
    };

    if (fup.relatedType === 'Seller') {
      nextDb.sellers = nextDb.sellers.map((s) =>
        s.id === fup.relatedId ? { ...s, lastContactAt: now, updated_at: now } : s
      );
    }

    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'FollowUp',
      entityId: fup.id,
      action: 'Follow-up Scheduled',
      summary: `${fup.activityType}: ${fup.title} on ${fup.date}`,
      actorId: db.settings.currentUserId,
    });

    saveDatabase(nextDb);
    return nextDb;
  },

  completeFollowUp(
    db: CRMDatabase,
    followUpId: string,
    completionNotes: string,
    nextFollowUp?: { date: string; time: string; title: string; activityType: FollowUp['activityType'] }
  ): CRMDatabase {
    const now = new Date().toISOString();
    const target = db.followUps.find((f) => f.id === followUpId);
    if (!target) return db;

    let followUps = db.followUps.map((f) =>
      f.id === followUpId
        ? {
            ...f,
            status: 'Completed' as const,
            notes: completionNotes ? `${f.notes ? f.notes + '\n' : ''}${completionNotes}` : f.notes,
            completedAt: now,
            updated_at: now,
          }
        : f
    );

    if (nextFollowUp && nextFollowUp.date) {
      followUps = [
        {
          id: generateId('fup'),
          title: nextFollowUp.title || `Next follow-up: ${target.title}`,
          relatedType: target.relatedType,
          relatedId: target.relatedId,
          propertyId: target.propertyId,
          assignedAgentId: target.assignedAgentId,
          date: nextFollowUp.date,
          time: nextFollowUp.time || '10:30',
          activityType: nextFollowUp.activityType || 'Call',
          notes: '',
          status: 'Pending',
          created_at: now,
          updated_at: now,
        },
        ...followUps,
      ];
    }

    let nextDb: CRMDatabase = {
      ...db,
      followUps,
    };

    if (target.relatedType === 'Seller') {
      nextDb.sellers = nextDb.sellers.map((s) =>
        s.id === target.relatedId ? { ...s, lastContactAt: now, updated_at: now } : s
      );
    } else {
      nextDb.leads = nextDb.leads.map((l) =>
        l.id === target.relatedId
          ? {
              ...l,
              nextFollowUpDate: nextFollowUp?.date || l.nextFollowUpDate,
              updated_at: now,
            }
          : l
      );
    }

    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'FollowUp',
      entityId: followUpId,
      action: 'Follow-up Completed',
      summary: `Completed ${target.activityType}: ${target.title}`,
      actorId: db.settings.currentUserId,
    });

    saveDatabase(nextDb);
    return nextDb;
  },

  deleteFollowUp(db: CRMDatabase, id: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      followUps: db.followUps.filter((f) => f.id !== id),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Site Visits
  addSiteVisit(
    db: CRMDatabase,
    visit: Omit<SiteVisit, 'id' | 'created_at' | 'updated_at'>
  ): CRMDatabase {
    const now = new Date().toISOString();
    const sv: SiteVisit = {
      ...visit,
      id: generateId('sv'),
      created_at: now,
      updated_at: now,
    };
    const nextDb: CRMDatabase = {
      ...db,
      siteVisits: [sv, ...db.siteVisits],
      propertyMatches: db.propertyMatches.map((m) =>
        m.leadId === visit.leadId && m.propertyId === visit.propertyId
          ? { ...m, siteVisitScheduled: true, updated_at: now }
          : m
      ),
      leads: db.leads.map((l) =>
        l.id === visit.leadId &&
        ['New', 'Contacted', 'Qualified', 'Property Shared'].includes(l.status)
          ? { ...l, status: 'Site Visit', updated_at: now }
          : l
      ),
    };
    const prop = db.properties.find((p) => p.id === visit.propertyId);
    const lead = db.leads.find((l) => l.id === visit.leadId);
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'SiteVisit',
      entityId: sv.id,
      action: 'Site Visit Scheduled',
      summary: `Scheduled visit for ${lead?.name || 'buyer'} at ${prop?.title || 'property'} on ${visit.scheduledDate}`,
      actorId: db.settings.currentUserId,
    });
    saveDatabase(nextDb);
    return nextDb;
  },

  updateSiteVisit(
    db: CRMDatabase,
    visitId: string,
    updates: Partial<SiteVisit>
  ): CRMDatabase {
    const now = new Date().toISOString();
    const nextDb: CRMDatabase = {
      ...db,
      siteVisits: db.siteVisits.map((s) =>
        s.id === visitId ? { ...s, ...updates, updated_at: now } : s
      ),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Deals & Sales (with Property closure automation & guard)
  upsertDeal(
    db: CRMDatabase,
    input: Partial<Deal> & {
      dealType: 'Sale' | 'Rental';
      leadId: string;
      propertyId: string;
      agreedPrice: number;
      commissionRate: number;
      status: Deal['status'];
    }
  ): CRMDatabase {
    const now = new Date().toISOString();
    const property = db.properties.find((p) => p.id === input.propertyId);
    if (!property) throw new Error('Property record not found.');

    // Guard against simultaneous closed sale transactions on the same property
    if (input.status === 'Closed' && input.dealType === 'Sale') {
      const otherClosedSale = db.deals.find(
        (d) =>
          d.propertyId === input.propertyId &&
          d.dealType === 'Sale' &&
          d.status === 'Closed' &&
          d.id !== input.id
      );
      if (otherClosedSale) {
        throw new Error(
          `Property already has a closed sale transaction (${otherClosedSale.code}).`
        );
      }
    }

    const commissionAmount = Math.round(
      (input.agreedPrice * (input.commissionRate || 0)) / 100
    );

    let deal: Deal;
    let updatedDeals = [...db.deals];
    if (input.id) {
      const existing = db.deals.find((d) => d.id === input.id);
      if (!existing) throw new Error('Deal not found');
      deal = {
        ...existing,
        ...input,
        sellerId: property.sellerId,
        commissionAmount,
        updated_at: now,
      };
      updatedDeals = updatedDeals.map((d) => (d.id === deal.id ? deal : d));
    } else {
      deal = {
        id: generateId('del'),
        code: nextCode(
          'DEL',
          db.deals.map((d) => d.code),
          4001
        ),
        dealType: input.dealType,
        leadId: input.leadId,
        sellerId: property.sellerId,
        propertyId: input.propertyId,
        assignedAgentId: input.assignedAgentId || property.assignedAgentId,
        agreedPrice: input.agreedPrice,
        commissionRate: input.commissionRate,
        commissionAmount,
        dealDate: input.dealDate || getTodayISO(),
        status: input.status,
        notes: input.notes?.trim() || '',
        created_at: now,
        updated_at: now,
      };
      updatedDeals = [deal, ...updatedDeals];
    }

    let updatedProperties = [...db.properties];
    let updatedLeads = [...db.leads];

    if (deal.status === 'Closed') {
      const closedPropStatus: PropertyStatus = deal.dealType === 'Sale' ? 'Sold' : 'Rented';
      updatedProperties = updatedProperties.map((p) =>
        p.id === deal.propertyId
          ? {
              ...p,
              status: closedPropStatus,
              runningCategory: statusToRunningCategory(closedPropStatus, p.isManaged),
              updated_at: now,
            }
          : p
      );
      updatedLeads = updatedLeads.map((l) =>
        l.id === deal.leadId
          ? {
              ...l,
              status: 'Converted',
              conversionDetails: `Closed ${deal.dealType} Deal ${deal.code} for ${property.title}`,
              updated_at: now,
            }
          : l
      );
    } else if (deal.status === 'Negotiation' && property.status === 'Available') {
      updatedProperties = updatedProperties.map((p) =>
        p.id === deal.propertyId
          ? {
              ...p,
              status: 'Under Negotiation',
              runningCategory: 'Under Negotiation',
              updated_at: now,
            }
          : p
      );
    } else if (deal.status === 'Booking' && (property.status === 'Available' || property.status === 'Under Negotiation')) {
      updatedProperties = updatedProperties.map((p) =>
        p.id === deal.propertyId
          ? {
              ...p,
              status: 'Reserved',
              runningCategory: 'Reserved',
              updated_at: now,
            }
          : p
      );
    }

    const nextDb: CRMDatabase = {
      ...db,
      deals: updatedDeals,
      properties: updatedProperties,
      leads: updatedLeads,
    };

    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Deal',
      entityId: deal.id,
      action: deal.status === 'Closed' ? 'Deal Closed' : `Deal ${deal.status}`,
      summary: `${deal.code} (${property.title}) marked ${deal.status}`,
      actorId: db.settings.currentUserId,
    });

    saveDatabase(nextDb);
    return nextDb;
  },

  deleteDeal(db: CRMDatabase, dealId: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      deals: db.deals.filter((d) => d.id !== dealId),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Investments & Investors
  upsertInvestor(db: CRMDatabase, input: Partial<Investor> & { name: string }): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const nextDb: CRMDatabase = {
        ...db,
        investors: db.investors.map((i) =>
          i.id === input.id ? { ...i, ...input, updated_at: now } : i
        ),
      };
      saveDatabase(nextDb);
      return nextDb;
    }
    const investor: Investor = {
      id: generateId('invr'),
      name: input.name.trim(),
      phone: input.phone?.trim() || '',
      email: input.email?.trim() || '',
      notes: input.notes?.trim() || '',
      created_at: now,
      updated_at: now,
    };
    const nextDb: CRMDatabase = {
      ...db,
      investors: [investor, ...db.investors],
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  upsertInvestment(
    db: CRMDatabase,
    input: Partial<Investment> & {
      propertyId: string;
      investorId: string;
      investmentAmount: number;
    }
  ): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const nextDb: CRMDatabase = {
        ...db,
        investments: db.investments.map((inv) =>
          inv.id === input.id ? { ...inv, ...input, updated_at: now } : inv
        ),
      };
      saveDatabase(nextDb);
      return nextDb;
    }
    const inv: Investment = {
      id: generateId('inv'),
      code: nextCode(
        'INV',
        db.investments.map((i) => i.code),
        5001
      ),
      propertyId: input.propertyId,
      investorId: input.investorId,
      investmentAmount: input.investmentAmount,
      additionalExpenses: input.additionalExpenses || 0,
      expectedReturn: input.expectedReturn || 0,
      actualReturn: input.actualReturn || 0,
      investmentDate: input.investmentDate || getTodayISO(),
      durationMonths: input.durationMonths || 12,
      status: input.status || 'Active',
      notes: input.notes?.trim() || '',
      created_at: now,
      updated_at: now,
    };
    const nextDb: CRMDatabase = {
      ...db,
      investments: [inv, ...db.investments],
    };
    const prop = db.properties.find((p) => p.id === inv.propertyId);
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Investment',
      entityId: inv.id,
      action: 'Investment Logged',
      summary: `Logged investment ${inv.code} on ${prop?.title || 'property'}`,
      actorId: db.settings.currentUserId,
    });
    saveDatabase(nextDb);
    return nextDb;
  },

  deleteInvestment(db: CRMDatabase, id: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      investments: db.investments.filter((i) => i.id !== id),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Stay & Rentals
  upsertTenant(db: CRMDatabase, input: Partial<Tenant> & { name: string }): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const nextDb: CRMDatabase = {
        ...db,
        tenants: db.tenants.map((t) =>
          t.id === input.id ? { ...t, ...input, updated_at: now } : t
        ),
      };
      saveDatabase(nextDb);
      return nextDb;
    }
    const tenant: Tenant = {
      id: generateId('ten'),
      name: input.name.trim(),
      phone: input.phone?.trim() || '',
      email: input.email?.trim() || '',
      idProof: input.idProof?.trim() || '',
      notes: input.notes?.trim() || '',
      created_at: now,
      updated_at: now,
    };
    const nextDb: CRMDatabase = {
      ...db,
      tenants: [tenant, ...db.tenants],
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  upsertRentalBooking(
    db: CRMDatabase,
    input: Partial<RentalBooking> & {
      propertyId: string;
      rentalType: RentalBooking['rentalType'];
      rateAmount: number;
    }
  ): CRMDatabase {
    const now = new Date().toISOString();
    let updatedBookings = [...db.rentalBookings];
    let bookingId = input.id;

    if (input.id) {
      updatedBookings = updatedBookings.map((b) =>
        b.id === input.id ? { ...b, ...input, updated_at: now } : b
      );
    } else {
      const booking: RentalBooking = {
        id: generateId('rnt'),
        code: nextCode(
          'RNT',
          db.rentalBookings.map((b) => b.code),
          6001
        ),
        propertyId: input.propertyId,
        tenantId: input.tenantId,
        rentalType: input.rentalType,
        rateAmount: input.rateAmount,
        bookingDate: input.bookingDate || getTodayISO(),
        checkIn: input.checkIn || getTodayISO(),
        checkOut: input.checkOut || '',
        deposit: input.deposit || 0,
        contractRef: input.contractRef || '',
        incomeReceived: input.incomeReceived || 0,
        status: input.status || 'Booked',
        maintenanceNotes: input.maintenanceNotes || '',
        created_at: now,
        updated_at: now,
      };
      bookingId = booking.id;
      updatedBookings = [booking, ...updatedBookings];
    }

    // Ensure property reflects Managed / Operating or Rented status cleanly
    const updatedProperties = db.properties.map((p) =>
      p.id === input.propertyId
        ? {
            ...p,
            isManaged: true,
            status:
              input.status === 'Occupied' || input.status === 'Booked'
                ? ('Rented' as const)
                : p.status,
            runningCategory:
              input.status === 'Occupied'
                ? ('Managed / Operating' as const)
                : p.runningCategory,
            updated_at: now,
          }
        : p
    );

    const nextDb: CRMDatabase = {
      ...db,
      rentalBookings: updatedBookings,
      properties: updatedProperties,
    };

    const prop = db.properties.find((p) => p.id === input.propertyId);
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Rental',
      entityId: bookingId || input.propertyId,
      action: input.id ? 'Rental Updated' : 'Rental Booking Added',
      summary: `Updated stay/rental for ${prop?.title || 'property'} (${input.status || 'Booked'})`,
      actorId: db.settings.currentUserId,
    });
    saveDatabase(nextDb);
    return nextDb;
  },

  deleteRentalBooking(db: CRMDatabase, id: string): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      rentalBookings: db.rentalBookings.filter((r) => r.id !== id),
      expenses: db.expenses.filter((e) => !(e.entityType === 'Rental' && e.entityId === id)),
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  addExpense(
    db: CRMDatabase,
    expense: Omit<Expense, 'id' | 'created_at'>
  ): CRMDatabase {
    const exp: Expense = {
      ...expense,
      id: generateId('exp'),
      created_at: new Date().toISOString(),
    };
    const nextDb: CRMDatabase = {
      ...db,
      expenses: [exp, ...db.expenses],
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  // Settings & Team
  upsertUser(db: CRMDatabase, input: Partial<User> & { name: string; email: string }): CRMDatabase {
    const now = new Date().toISOString();
    if (input.id) {
      const nextDb: CRMDatabase = {
        ...db,
        users: db.users.map((u) =>
          u.id === input.id ? { ...u, ...input, updated_at: now } : u
        ),
      };
      saveDatabase(nextDb);
      return nextDb;
    }
    const user: User = {
      id: generateId('usr'),
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || '',
      role: input.role || 'Agent',
      designation: input.designation?.trim() || 'Property Advisor',
      active: input.active ?? true,
      created_at: now,
      updated_at: now,
    };
    const nextDb: CRMDatabase = {
      ...db,
      users: [...db.users, user],
    };
    saveDatabase(nextDb);
    return nextDb;
  },

  updateSettings(db: CRMDatabase, updates: Partial<AgencySettings>): CRMDatabase {
    const nextDb: CRMDatabase = {
      ...db,
      settings: {
        ...db.settings,
        ...updates,
        followUpDefaults: {
          ...db.settings.followUpDefaults,
          ...(updates.followUpDefaults || {}),
        },
      },
    };
    saveDatabase(nextDb);
    return nextDb;
  },
};
