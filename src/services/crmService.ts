import { createSeedDatabase } from '../data/seedData';
import {
  ActivityLog,
  AdvancePaymentMethod,
  AdvanceStatus,
  AgencySettings,
  ContactMethod,
  CRMDatabase,
  Deal,
  Expense,
  FollowUp,
  Investment,
  Investor,
  Lead,
  PriceHistoryEntry,
  Property,
  PropertyCategory,
  PropertyDocument,
  PropertyImage,
  PropertyMatch,
  PropertyStatus,
  PropertyType,
  RentalBooking,
  RunningCategory,
  Seller,
  SellerAdvance,
  SellerRelationship,
  SiteVisit,
  Tenant,
  User,
} from '../types/crm';
import { generateId, getTodayISO } from '../utils/formatters';
import { isValidLatLng } from '../utils/geo';

const STORAGE_KEY = 're_crm_database_v1';
export const DEFAULT_LOGO_URL = '/assets/aistudio/image_abc712d4.png';

const DEFAULT_PROPERTY_TYPES: PropertyType[] = [
  'Land',
  'House',
  'Apartment',
  'Villa',
  'Shop',
  'Resort',
];

const DEFAULT_CATEGORY_GROUPS: PropertyCategory[] = [
  'Residential',
  'Commercial',
  'Plantation',
  'Agricultural',
  'Development',
  'Resort',
];

const DEFAULT_LEAD_SOURCES: string[] = [
  'Instagram',
  'Facebook',
  'WhatsApp',
  'Website',
  'Referral',
  'Walk-in',
  'Phone Call',
  'Advertisement',
  'Existing Customer',
  'Other',
];

function mapLegacyPropertyTypeAndCategory(
  rawType: string,
  existingCategory?: PropertyCategory
): { type: PropertyType; category: PropertyCategory } {
  switch (rawType) {
    case 'Plot / Land':
      return { type: 'Land', category: existingCategory || 'Residential' };
    case 'Flat / Apartment':
      return { type: 'Apartment', category: existingCategory || 'Residential' };
    case 'Agriculture':
      return { type: 'Land', category: existingCategory || 'Agricultural' };
    case 'Commercial':
      return { type: 'Shop', category: existingCategory || 'Commercial' };
    case 'Other':
      return { type: 'Land', category: existingCategory || 'Development' };
    case 'Land':
    case 'House':
    case 'Apartment':
    case 'Villa':
    case 'Shop':
    case 'Resort':
      return { type: rawType, category: existingCategory || 'Residential' };
    default:
      return { type: 'Land', category: existingCategory || 'Residential' };
  }
}

export const SELLER_RELATIONSHIPS: SellerRelationship[] = [
  'Owner',
  'Co-owner',
  'Relative',
  'Power of Attorney Holder',
  'Broker / Agent',
  'Authorized Representative',
  'Other',
];

export const CONTACT_METHODS: ContactMethod[] = [
  'Call',
  'WhatsApp',
  'Meeting',
  'Email',
  'Other',
];

export const ADVANCE_PAYMENT_METHODS: AdvancePaymentMethod[] = [
  'Bank Transfer',
  'UPI',
  'Cash',
  'Cheque',
  'Other',
];

export const ADVANCE_STATUSES: AdvanceStatus[] = [
  'Collected',
  'Adjusted',
  'Partially Refunded',
  'Refunded',
];

export function nextTakCode(existingCodes: string[]): string {
  const used = new Set(existingCodes.map((c) => c.toUpperCase()));
  const maxNum = existingCodes.reduce((max, c) => {
    const m = c.toUpperCase().match(/^TAK(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  let candidate = maxNum + 1;
  while (used.has(`TAK${String(candidate).padStart(3, '0')}`)) {
    candidate += 1;
  }
  return `TAK${String(candidate).padStart(3, '0')}`;
}

function migrateDatabase(parsed: CRMDatabase): { db: CRMDatabase; changed: boolean } {
  let changed = false;
  const db: CRMDatabase = { ...parsed };

  if (db.settings.logoUrl === undefined) {
    db.settings = { ...db.settings, logoUrl: DEFAULT_LOGO_URL };
    changed = true;
  }

  if (!Array.isArray(db.sellerAdvances)) {
    db.sellerAdvances = [];
    changed = true;
  }

  if (!Array.isArray(db.settings.propertyCategoryGroups)) {
    db.settings = { ...db.settings, propertyCategoryGroups: DEFAULT_CATEGORY_GROUPS };
    changed = true;
  }

  if (!Array.isArray(db.settings.leadSources)) {
    db.settings = { ...db.settings, leadSources: DEFAULT_LEAD_SOURCES };
    changed = true;
  }

  const hasLegacyTypes = (db.settings.propertyCategories as string[]).some((t) =>
    ['Plot / Land', 'Flat / Apartment', 'Agriculture', 'Commercial', 'Other'].includes(t)
  );
  if (hasLegacyTypes || !db.schemaVersion || db.schemaVersion < 2) {
    db.settings = { ...db.settings, propertyCategories: DEFAULT_PROPERTY_TYPES };
    changed = true;
  }

  if (!db.schemaVersion || db.schemaVersion < 2) {
    // Migrate sellers
    db.sellers = (db.sellers || []).map((s) => ({
      ...s,
      relationshipWithProperty: s.relationshipWithProperty || 'Owner',
      lastContactedDate: s.lastContactedDate || s.lastContactAt || s.created_at,
      lastContactMethod: s.lastContactMethod || 'Call',
      lastConversationNotes: s.lastConversationNotes || '',
    }));

    // Migrate properties deterministically to TAK001+ if legacy PRP- codes exist
    const existingTakCodes = (db.properties || [])
      .map((p) => p.code)
      .filter((c) => /^TAK\d+$/i.test(c));
    const usedCodes = new Set(existingTakCodes.map((c) => c.toUpperCase()));

    db.properties = (db.properties || []).map((p) => {
      let code = p.code;
      if (!/^TAK\d+$/i.test(code)) {
        code = nextTakCode(Array.from(usedCodes));
        usedCodes.add(code);
      }
      const mapped = mapLegacyPropertyTypeAndCategory(p.type as string, p.category);
      const locParts = (p.location || '').split(',').map((s) => s.trim()).filter(Boolean);
      const locality = p.locality || locParts[0] || 'Town Center';
      const panchayath = p.panchayath || locParts[1] || locParts[0] || 'Municipality';
      const district = p.district || locParts[2] || 'Kasaragod';
      const expectedPrice = p.expectedPrice ?? p.askingPrice ?? 0;
      const listedDate = p.listedDate || p.addedDate || p.created_at?.slice(0, 10) || getTodayISO();

      return {
        ...p,
        code,
        type: mapped.type,
        category: mapped.category,
        district,
        panchayath,
        locality,
        roadConnectivity: p.roadConnectivity || 'Tar Road Access',
        expectedPrice,
        askingPrice: expectedPrice,
        priceHistory: Array.isArray(p.priceHistory) ? p.priceHistory : [],
        listedDate,
        addedDate: p.addedDate || listedDate,
        sellerRelationship: p.sellerRelationship || 'Owner',
      };
    });

    // Migrate leads
    db.leads = (db.leads || []).map((l) => {
      const mappedType =
        l.propertyType === ('Any' as any)
          ? ('Any' as const)
          : mapLegacyPropertyTypeAndCategory(l.propertyType as string).type;
      return {
        ...l,
        leadSource: l.leadSource || 'Website',
        propertyType: mappedType,
        propertyCategory: l.propertyCategory || 'Any',
        lastContactedDate: l.lastContactedDate || (l.status !== 'New' ? l.updated_at : undefined),
        lastContactMethod: l.lastContactMethod || (l.status !== 'New' ? 'Call' : undefined),
        lastConversationNotes: l.lastConversationNotes || '',
      };
    });

    db.schemaVersion = 2;
    changed = true;
  }

  if (db.schemaVersion < 3) {
    db.properties = (db.properties || []).map((p) => {
      const lat =
        p.latitude !== undefined ? p.latitude : p.coordinates?.lat ?? null;
      const lng =
        p.longitude !== undefined ? p.longitude : p.coordinates?.lng ?? null;
      const valid = isValidLatLng(lat, lng);
      return {
        ...p,
        latitude: valid ? (lat as number) : null,
        longitude: valid ? (lng as number) : null,
        location_accuracy:
          p.location_accuracy ||
          (valid ? (p.id?.startsWith('prp-') ? 'Demo Coordinates' : 'Legacy Coordinates') : undefined),
        location_updated_at:
          p.location_updated_at || (valid ? p.updated_at || p.created_at : undefined),
        isDemoData: p.isDemoData ?? ['prp-1', 'prp-2', 'prp-3', 'prp-4', 'prp-5', 'prp-6', 'prp-7', 'prp-8'].includes(p.id),
        coordinates: valid ? { lat: lat as number, lng: lng as number } : null,
      };
    });
    db.schemaVersion = 3;
    changed = true;
  }

  return { db, changed };
}

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
    const { db, changed } = migrateDatabase(parsed);
    if (changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
    return db;
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
        relationshipWithProperty: SellerRelationship;
        notes?: string;
      };
      property: {
        title: string;
        type: Property['type'];
        category: PropertyCategory;
        district: string;
        panchayath: string;
        locality: string;
        fullAddress?: string;
        googleMapsUrl?: string;
        latitude?: number | null;
        longitude?: number | null;
        location_accuracy?: string;
        areaValue: number;
        areaUnit: Property['areaUnit'];
        roadConnectivity: string;
        distanceToHighway?: string;
        nearbyLandmarks?: string;
        waterAvailability?: string;
        terrain?: string;
        frontage?: string;
        electricity?: string;
        boundaryDetails?: string;
        otherFeatures?: string;
        expectedPrice: number;
        marketPrice?: number;
        description: string;
        sellerRelationship?: SellerRelationship;
        assignedAgentId: string;
        status: PropertyStatus;
        isManaged?: boolean;
        nextFollowUpDate: string;
        internalNotes: string;
        images: { url: string; caption: string }[];
        documents: { name: string; docType: string; fileSize: string }[];
      };
      advance?: {
        collected: boolean;
        amount: number;
        collectionDate: string;
        paymentMethod: AdvancePaymentMethod;
        transactionReference: string;
        remarks: string;
      };
    }
  ): { db: CRMDatabase; property: Property; seller: Seller } {
    const now = new Date().toISOString();
    const today = getTodayISO();
    const actorId = db.settings.currentUserId;
    const actorName = db.users.find((u) => u.id === actorId)?.name || 'Advisor';

    if (!payload.property.title.trim()) throw new Error('Property title is required.');
    if (!payload.property.district.trim()) throw new Error('District is required.');
    if (!payload.property.panchayath.trim())
      throw new Error('Panchayath / Municipality / Corporation is required.');
    if (!payload.property.locality.trim()) throw new Error('Locality / Place is required.');
    if (!payload.property.areaValue || payload.property.areaValue <= 0)
      throw new Error('Area / Size is required.');
    if (!payload.property.roadConnectivity.trim())
      throw new Error('Road Connectivity is required.');
    if (!payload.property.description.trim())
      throw new Error('Property Description is required.');
    if (!payload.property.expectedPrice || payload.property.expectedPrice <= 0)
      throw new Error('Expected Price is required.');

    if (payload.advance?.collected) {
      if (!payload.advance.amount || payload.advance.amount <= 0) {
        throw new Error('Advance Amount must be greater than zero.');
      }
      if (!payload.advance.collectionDate) {
        throw new Error('Advance Collection Date is required.');
      }
    }

    let seller: Seller;
    let updatedSellers = [...db.sellers];

    if (payload.mode === 'existing-seller' && payload.existingSellerId) {
      const found = db.sellers.find((s) => s.id === payload.existingSellerId);
      if (!found) throw new Error('Selected seller record not found.');
      seller = {
        ...found,
        updated_at: now,
      };
      updatedSellers = updatedSellers.map((s) => (s.id === seller.id ? seller : s));
    } else {
      if (!payload.seller || !payload.seller.name.trim() || !payload.seller.phone.trim()) {
        throw new Error('Seller name and phone number are required.');
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
        relationshipWithProperty: payload.seller.relationshipWithProperty || 'Owner',
        notes: payload.seller.notes?.trim() || '',
        assignedAgentId: payload.property.assignedAgentId,
        lastContactAt: now,
        lastContactedDate: now,
        lastContactMethod: 'Meeting',
        lastConversationNotes: 'Initial property registration onboarding.',
        created_at: now,
        updated_at: now,
      };
      updatedSellers = [seller, ...updatedSellers];
    }

    const areaDisplay = `${payload.property.areaValue} ${payload.property.areaUnit}`;
    const isManaged = Boolean(payload.property.isManaged);
    const derivedLocation = [
      payload.property.locality.trim(),
      payload.property.panchayath.trim(),
      payload.property.district.trim(),
    ]
      .filter(Boolean)
      .join(', ');

    const hasPin = isValidLatLng(payload.property.latitude, payload.property.longitude);
    const savedLat = hasPin ? Number(payload.property.latitude) : null;
    const savedLng = hasPin ? Number(payload.property.longitude) : null;
    const resolvedMapsUrl =
      payload.property.googleMapsUrl?.trim() ||
      (hasPin ? `https://www.google.com/maps?q=${savedLat},${savedLng}` : '');

    const property: Property = {
      id: generateId('prp'),
      code: nextTakCode(db.properties.map((p) => p.code)),
      title: payload.property.title.trim(),
      type: payload.property.type,
      category: payload.property.category,
      district: payload.property.district.trim(),
      panchayath: payload.property.panchayath.trim(),
      locality: payload.property.locality.trim(),
      fullAddress: payload.property.fullAddress?.trim() || '',
      googleMapsUrl: resolvedMapsUrl,
      location: derivedLocation,
      areaValue: payload.property.areaValue,
      areaUnit: payload.property.areaUnit,
      areaDisplay,
      roadConnectivity: payload.property.roadConnectivity.trim(),
      distanceToHighway: payload.property.distanceToHighway?.trim() || '',
      nearbyLandmarks: payload.property.nearbyLandmarks?.trim() || '',
      waterAvailability: payload.property.waterAvailability?.trim() || '',
      terrain: payload.property.terrain?.trim() || '',
      frontage: payload.property.frontage?.trim() || '',
      electricity: payload.property.electricity?.trim() || '',
      boundaryDetails: payload.property.boundaryDetails?.trim() || '',
      otherFeatures: payload.property.otherFeatures?.trim() || '',
      expectedPrice: payload.property.expectedPrice,
      marketPrice: payload.property.marketPrice || undefined,
      askingPrice: payload.property.expectedPrice,
      priceHistory: [],
      description: payload.property.description.trim(),
      sellerId: seller.id,
      sellerRelationship:
        payload.property.sellerRelationship || seller.relationshipWithProperty || 'Owner',
      status: payload.property.status,
      runningCategory: statusToRunningCategory(payload.property.status, isManaged),
      isManaged,
      assignedAgentId: payload.property.assignedAgentId,
      internalNotes: payload.property.internalNotes.trim(),
      nextFollowUpDate: payload.property.nextFollowUpDate,
      listedDate: today,
      addedDate: today,
      latitude: savedLat,
      longitude: savedLng,
      location_accuracy: hasPin
        ? payload.property.location_accuracy || 'Map Picker'
        : undefined,
      location_updated_at: hasPin ? now : undefined,
      isDemoData: false,
      coordinates:
        hasPin && savedLat !== null && savedLng !== null
          ? { lat: savedLat, lng: savedLng }
          : null,
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

    let updatedAdvances = [...(db.sellerAdvances || [])];
    if (payload.advance?.collected) {
      const adv: SellerAdvance = {
        id: generateId('adv'),
        code: nextCode(
          'ADV',
          updatedAdvances.map((a) => a.code),
          7001
        ),
        sellerId: seller.id,
        propertyId: property.id,
        amount: Number(payload.advance.amount),
        collectionDate: payload.advance.collectionDate || today,
        paymentMethod: payload.advance.paymentMethod || 'Bank Transfer',
        transactionReference: payload.advance.transactionReference?.trim() || '',
        status: 'Collected',
        remarks: payload.advance.remarks?.trim() || '',
        recordedBy: actorName,
        created_at: now,
        updated_at: now,
      };
      updatedAdvances = [adv, ...updatedAdvances];
    }

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
      sellerAdvances: updatedAdvances,
      followUps: updatedFollowUps,
    };

    if (payload.mode === 'new-seller') {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Seller',
        entityId: seller.id,
        action: 'Seller Registered',
        summary: `New seller ${seller.name} registered with property ${property.code} (${property.title})`,
        actorId,
      });
    } else {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: property.id,
        action: 'Property Added',
        summary: `Added ${property.code} (${property.title}) under existing seller ${seller.name}`,
        actorId,
      });
    }

    saveDatabase(nextDb);
    return { db: nextDb, property, seller };
  },

  updateProperty(
    db: CRMDatabase,
    propertyId: string,
    updates: Partial<Property> & { priceNote?: string }
  ): CRMDatabase {
    const now = new Date().toISOString();
    const today = getTodayISO();
    const existing = db.properties.find((p) => p.id === propertyId);
    if (!existing) throw new Error('Property not found');

    const actorName =
      db.users.find((u) => u.id === db.settings.currentUserId)?.name || 'Advisor';

    const nextStatus = updates.status ?? existing.status;
    const nextIsManaged = updates.isManaged ?? existing.isManaged;
    const nextAreaVal = updates.areaValue ?? existing.areaValue;
    const nextAreaUnit = updates.areaUnit ?? existing.areaUnit;

    const nextExpected =
      updates.expectedPrice !== undefined
        ? updates.expectedPrice
        : updates.askingPrice !== undefined
        ? updates.askingPrice
        : existing.expectedPrice ?? existing.askingPrice;

    const nextMarket =
      updates.marketPrice !== undefined ? updates.marketPrice : existing.marketPrice;

    const nextLocality = updates.locality ?? existing.locality;
    const nextPanchayath = updates.panchayath ?? existing.panchayath;
    const nextDistrict = updates.district ?? existing.district;
    const derivedLocation =
      updates.locality !== undefined ||
      updates.panchayath !== undefined ||
      updates.district !== undefined
        ? [nextLocality, nextPanchayath, nextDistrict].filter(Boolean).join(', ')
        : updates.location ?? existing.location;

    // Record price change history if Expected Price or Market Price changed
    let priceHistory = existing.priceHistory || [];
    const expectedChanged = nextExpected !== (existing.expectedPrice ?? existing.askingPrice);
    const marketChanged = nextMarket !== existing.marketPrice;
    if (expectedChanged || marketChanged) {
      const entry: PriceHistoryEntry = {
        id: generateId('ph'),
        date: today,
        previousExpectedPrice: existing.expectedPrice ?? existing.askingPrice,
        newExpectedPrice: nextExpected,
        previousMarketPrice: existing.marketPrice,
        newMarketPrice: nextMarket,
        updatedBy: actorName,
        note: updates.priceNote,
      };
      priceHistory = [entry, ...priceHistory];
    }

    const {
      priceNote: _omitNote,
      listedDate: _omitListed,
      addedDate: _omitAdded,
      code: _omitCode,
      ...safeUpdates
    } = updates;

    const coordsProvided =
      updates.latitude !== undefined || updates.longitude !== undefined;
    let nextLat = existing.latitude ?? existing.coordinates?.lat ?? null;
    let nextLng = existing.longitude ?? existing.coordinates?.lng ?? null;
    let nextAccuracy = existing.location_accuracy;
    let nextLocUpdatedAt = existing.location_updated_at;

    if (coordsProvided) {
      if (isValidLatLng(updates.latitude, updates.longitude)) {
        nextLat = Number(updates.latitude);
        nextLng = Number(updates.longitude);
        nextAccuracy = updates.location_accuracy || 'Map Picker';
        nextLocUpdatedAt = now;
      } else {
        nextLat = null;
        nextLng = null;
        nextAccuracy = undefined;
        nextLocUpdatedAt = now;
      }
    }

    const updatedProp: Property = {
      ...existing,
      ...safeUpdates,
      // Permanently preserve property code and original listing dates
      code: existing.code,
      listedDate: existing.listedDate || existing.addedDate,
      addedDate: existing.addedDate,
      location: derivedLocation,
      latitude: nextLat,
      longitude: nextLng,
      location_accuracy: nextAccuracy,
      location_updated_at: nextLocUpdatedAt,
      coordinates:
        nextLat !== null && nextLng !== null ? { lat: nextLat, lng: nextLng } : null,
      expectedPrice: nextExpected,
      marketPrice: nextMarket,
      askingPrice: nextExpected,
      priceHistory,
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
        summary: `${existing.code} (${existing.title}) changed from ${existing.status} to ${updates.status}`,
        actorId: db.settings.currentUserId,
      });
    } else if (expectedChanged || marketChanged) {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: propertyId,
        action: 'Pricing Updated',
        summary: `Updated pricing for ${updatedProp.code} (${updatedProp.title})`,
        actorId: db.settings.currentUserId,
      });
    } else {
      nextDb.activityLogs = this.appendActivity(nextDb, {
        entityType: 'Property',
        entityId: propertyId,
        action: 'Property Updated',
        summary: `Updated details for ${updatedProp.code} (${updatedProp.title})`,
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
      // Protect last-contacted fields from being overwritten by unrelated profile edits
      const {
        lastContactAt: _lcAt,
        lastContactedDate: _lcDate,
        lastContactMethod: _lcMethod,
        lastConversationNotes: _lcNotes,
        ...safeInput
      } = input;
      const nextDb: CRMDatabase = {
        ...db,
        sellers: db.sellers.map((s) =>
          s.id === input.id ? { ...s, ...safeInput, updated_at: now } : s
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
      relationshipWithProperty: input.relationshipWithProperty || 'Owner',
      notes: input.notes?.trim() || '',
      assignedAgentId: input.assignedAgentId || db.settings.currentUserId,
      lastContactAt: now,
      lastContactedDate: now,
      lastContactMethod: 'Call',
      lastConversationNotes: 'Initial seller profile registration.',
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

  // Seller Advance Collection CRUD (Financial tracking only, not sales revenue)
  addSellerAdvance(
    db: CRMDatabase,
    input: {
      sellerId: string;
      propertyId: string;
      amount: number;
      collectionDate: string;
      paymentMethod: AdvancePaymentMethod;
      transactionReference: string;
      remarks?: string;
    }
  ): CRMDatabase {
    if (!input.amount || input.amount <= 0) {
      throw new Error('Advance amount must be greater than zero.');
    }
    if (!input.collectionDate) {
      throw new Error('Collection date is required.');
    }
    const now = new Date().toISOString();
    const actorName =
      db.users.find((u) => u.id === db.settings.currentUserId)?.name || 'Advisor';
    const existingAdvances = db.sellerAdvances || [];
    const adv: SellerAdvance = {
      id: generateId('adv'),
      code: nextCode(
        'ADV',
        existingAdvances.map((a) => a.code),
        7001
      ),
      sellerId: input.sellerId,
      propertyId: input.propertyId,
      amount: Number(input.amount),
      collectionDate: input.collectionDate,
      paymentMethod: input.paymentMethod,
      transactionReference: input.transactionReference.trim(),
      status: 'Collected',
      remarks: input.remarks?.trim() || '',
      recordedBy: actorName,
      created_at: now,
      updated_at: now,
    };
    const prop = db.properties.find((p) => p.id === input.propertyId);
    const nextDb: CRMDatabase = {
      ...db,
      sellerAdvances: [adv, ...existingAdvances],
    };
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Advance',
      entityId: adv.id,
      action: 'Advance Recorded',
      summary: `Recorded seller advance ${adv.code} for ${prop?.code || 'property'}`,
      actorId: db.settings.currentUserId,
    });
    saveDatabase(nextDb);
    return nextDb;
  },

  updateSellerAdvance(
    db: CRMDatabase,
    advanceId: string,
    updates: {
      status: AdvanceStatus;
      refundAmount?: number;
      refundDate?: string;
      adjustedDealId?: string;
      remarks?: string;
    }
  ): CRMDatabase {
    const now = new Date().toISOString();
    const existing = (db.sellerAdvances || []).find((a) => a.id === advanceId);
    if (!existing) throw new Error('Advance record not found.');
    const nextDb: CRMDatabase = {
      ...db,
      sellerAdvances: (db.sellerAdvances || []).map((a) =>
        a.id === advanceId
          ? {
              ...a,
              ...updates,
              updated_at: now,
            }
          : a
      ),
    };
    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'Advance',
      entityId: advanceId,
      action: `Advance ${updates.status}`,
      summary: `${existing.code} marked ${updates.status}`,
      actorId: db.settings.currentUserId,
    });
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
      // Protect last-contacted fields from unrelated profile edits
      const {
        lastContactedDate: _lcDate,
        lastContactMethod: _lcMethod,
        lastConversationNotes: _lcNotes,
        ...safeInput
      } = input;
      const nextDb: CRMDatabase = {
        ...db,
        leads: db.leads.map((l) =>
          l.id === input.id ? { ...l, ...safeInput, updated_at: now } : l
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
      leadSource: input.leadSource || db.settings.leadSources?.[0] || 'Website',
      preferredLocation: input.preferredLocation?.trim() || '',
      minBudget: Number(input.minBudget) || 0,
      maxBudget: Number(input.maxBudget) || 0,
      propertyType: input.propertyType || 'Any',
      propertyCategory: input.propertyCategory || 'Any',
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
      summary: `New buyer lead ${lead.name} (${lead.leadSource}) looking in ${lead.preferredLocation || 'any location'}`,
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

    // Note: Scheduling a future pending task does not overwrite Last Contacted;
    // Last Contacted is automatically updated when a contact activity is completed.

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
    nextFollowUp?: { date: string; time: string; title: string; activityType: FollowUp['activityType'] },
    contactMethodOverride?: ContactMethod
  ): CRMDatabase {
    const now = new Date().toISOString();
    const target = db.followUps.find((f) => f.id === followUpId);
    if (!target) return db;

    const methodMap: Record<FollowUp['activityType'], ContactMethod> = {
      Call: 'Call',
      WhatsApp: 'WhatsApp',
      Meeting: 'Meeting',
      'Site Visit': 'Meeting',
      Email: 'Email',
      Other: 'Other',
    };
    const resolvedMethod: ContactMethod =
      contactMethodOverride || methodMap[target.activityType] || 'Other';
    const conversationNote =
      completionNotes.trim() || target.notes?.trim() || target.title;

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

    const nextDb: CRMDatabase = {
      ...db,
      followUps,
    };

    if (target.relatedType === 'Seller') {
      nextDb.sellers = nextDb.sellers.map((s) =>
        s.id === target.relatedId
          ? {
              ...s,
              lastContactAt: now,
              lastContactedDate: now,
              lastContactMethod: resolvedMethod,
              lastConversationNotes: conversationNote,
              updated_at: now,
            }
          : s
      );
    } else {
      nextDb.leads = nextDb.leads.map((l) =>
        l.id === target.relatedId
          ? {
              ...l,
              nextFollowUpDate: nextFollowUp?.date || l.nextFollowUpDate,
              lastContactedDate: now,
              lastContactMethod: resolvedMethod,
              lastConversationNotes: conversationNote,
              updated_at: now,
            }
          : l
      );
    }

    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'FollowUp',
      entityId: followUpId,
      action: 'Follow-up Completed',
      summary: `Completed ${resolvedMethod} follow-up: ${target.title}`,
      actorId: db.settings.currentUserId,
    });

    saveDatabase(nextDb);
    return nextDb;
  },

  logContactActivity(
    db: CRMDatabase,
    payload: {
      relatedType: 'Lead' | 'Seller';
      relatedId: string;
      propertyId?: string;
      contactMethod: ContactMethod;
      notes: string;
    }
  ): CRMDatabase {
    const now = new Date().toISOString();
    const today = getTodayISO();
    const nowTime = new Date().toTimeString().slice(0, 5);
    const noteText = payload.notes.trim();
    if (!noteText) throw new Error('Conversation notes are required.');

    const contactName =
      payload.relatedType === 'Lead'
        ? db.leads.find((l) => l.id === payload.relatedId)?.name || 'Lead'
        : db.sellers.find((s) => s.id === payload.relatedId)?.name || 'Seller';

    const fup: FollowUp = {
      id: generateId('fup'),
      title: `${payload.contactMethod} with ${contactName}`,
      relatedType: payload.relatedType,
      relatedId: payload.relatedId,
      propertyId: payload.propertyId || undefined,
      assignedAgentId: db.settings.currentUserId,
      date: today,
      time: nowTime,
      activityType: payload.contactMethod,
      notes: noteText,
      status: 'Completed',
      completedAt: now,
      created_at: now,
      updated_at: now,
    };

    const nextDb: CRMDatabase = {
      ...db,
      followUps: [fup, ...db.followUps],
      sellers:
        payload.relatedType === 'Seller'
          ? db.sellers.map((s) =>
              s.id === payload.relatedId
                ? {
                    ...s,
                    lastContactAt: now,
                    lastContactedDate: now,
                    lastContactMethod: payload.contactMethod,
                    lastConversationNotes: noteText,
                    updated_at: now,
                  }
                : s
            )
          : db.sellers,
      leads:
        payload.relatedType === 'Lead'
          ? db.leads.map((l) =>
              l.id === payload.relatedId
                ? {
                    ...l,
                    lastContactedDate: now,
                    lastContactMethod: payload.contactMethod,
                    lastConversationNotes: noteText,
                    updated_at: now,
                  }
                : l
            )
          : db.leads,
    };

    nextDb.activityLogs = this.appendActivity(nextDb, {
      entityType: 'FollowUp',
      entityId: fup.id,
      action: `${payload.contactMethod} Logged`,
      summary: `${payload.contactMethod} with ${contactName}: ${noteText.slice(0, 80)}`,
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
