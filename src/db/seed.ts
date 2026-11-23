import { count, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  properties,
  propertyAssignments,
  propertyMedia,
  propertyPublicationHistory,
  propertySubmissionHistory,
  propertySubmissions,
  sellers,
  users,
} from './schema.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureInitialSeed(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = runSeed().catch((err) => {
    seedPromise = null;
    console.error('Initial PostgreSQL seed error:', err);
  });
  return seedPromise;
}

async function runSeed(): Promise<void> {
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);
  if (userCount > 0) return;

  const now = new Date();
  const daysAgo = (days: number) => {
    const d = new Date(now.getTime() - days * 86400_000);
    return d.toISOString().slice(0, 10);
  };
  const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3600_000);

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        legacyId: 'usr-1',
        name: 'Arjun Menon',
        email: 'arjun@teakees.in',
        phone: '+91 98470 11220',
        role: 'ADMIN',
        designation: 'Managing Partner',
        active: true,
      },
      {
        legacyId: 'usr-2',
        name: 'Meera Nair',
        email: 'meera@teakees.in',
        phone: '+91 98471 33445',
        role: 'AGENT',
        designation: 'Senior Property Advisor',
        active: true,
      },
      {
        legacyId: 'usr-3',
        name: 'Karthik Varma',
        email: 'karthik@teakees.in',
        phone: '+91 97450 88991',
        role: 'AGENT',
        designation: 'Land & Investment Specialist',
        active: true,
      },
      {
        legacyId: 'usr-4',
        name: 'Sana Fathima',
        email: 'sana@teakees.in',
        phone: '+91 94460 55219',
        role: 'AGENT',
        designation: 'Rentals & Stays Coordinator',
        active: true,
      },
      {
        legacyId: 'usr-5',
        name: 'Divya Krishnan',
        email: 'divya@teakees.in',
        phone: '+91 94472 90811',
        role: 'TELECALLER',
        designation: 'Property Intake Telecaller',
        active: true,
      },
    ])
    .onConflictDoNothing()
    .returning();

  const adminUser =
    insertedUsers.find((u) => u.role === 'ADMIN') ||
    (await db.select().from(users).where(eq(users.role, 'ADMIN')))[0];
  const meera =
    insertedUsers.find((u) => u.legacyId === 'usr-2') || adminUser;
  const karthik =
    insertedUsers.find((u) => u.legacyId === 'usr-3') || adminUser;
  const sana =
    insertedUsers.find((u) => u.legacyId === 'usr-4') || adminUser;
  const telecaller =
    insertedUsers.find((u) => u.role === 'TELECALLER') || adminUser;

  if (!adminUser) return;

  const insertedSellers = await db
    .insert(sellers)
    .values([
      {
        legacyId: 'slr-1',
        code: 'SLR-1001',
        name: 'Rajeshwari Shenoy',
        phone: '+91 94471 20394',
        whatsapp: '+91 94471 20394',
        address: 'Puthiyakavu Junction, Kanhangad, Kasaragod',
        relationshipWithProperty: 'Owner',
        notes: 'Owns residential plot and courtyard villa.',
        assignedAgentId: meera.id,
        lastContactedAt: hoursFromNow(-24),
        lastContactMethod: 'Call',
        lastConversationNotes: 'Confirmed availability for weekend site visits.',
      },
      {
        legacyId: 'slr-2',
        code: 'SLR-1002',
        name: 'Mohammed Kunhi',
        phone: '+91 98950 44128',
        whatsapp: '+91 98950 44128',
        address: 'Bekal Fort Road, Pallikere, Kasaragod',
        relationshipWithProperty: 'Power of Attorney Holder',
        notes: 'NRI representative coordinating coastal properties.',
        assignedAgentId: sana.id,
        lastContactedAt: hoursFromNow(-480),
        lastContactMethod: 'WhatsApp',
        lastConversationNotes: 'Shared coastal plot pricing update.',
      },
      {
        legacyId: 'slr-3',
        code: 'SLR-1003',
        name: 'Devadasan Kurup',
        phone: '+91 94952 77810',
        whatsapp: '+91 94952 77810',
        address: 'Hilltop Estate, Ranipuram Road, Panathady',
        relationshipWithProperty: 'Co-owner',
        notes: 'Looking to divest cardamom & coffee estate.',
        assignedAgentId: karthik.id,
        lastContactedAt: hoursFromNow(-120),
        lastContactMethod: 'Meeting',
        lastConversationNotes: 'Reviewed soil survey sketch.',
      },
    ])
    .onConflictDoNothing()
    .returning();

  const slr1 = insertedSellers[0] || (await db.select().from(sellers))[0];
  const slr2 = insertedSellers[1] || slr1;
  const slr3 = insertedSellers[2] || slr1;

  if (!slr1) return;

  const insertedProps = await db
    .insert(properties)
    .values([
      {
        legacyId: 'prp-1',
        code: 'TAK001',
        title: 'Palm Grove Corner Plot — Hosdurg',
        type: 'Land',
        category: 'Residential',
        district: 'Kasaragod',
        panchayath: 'Kanhangad Municipality',
        locality: 'Hosdurg',
        fullAddress: 'Puthiyakavu Temple Road, Hosdurg, Kanhangad, Kasaragod 671315',
        location: 'Hosdurg, Kanhangad, Kasaragod',
        areaValue: 12,
        areaUnit: 'Cents',
        areaDisplay: '12 Cents',
        roadConnectivity: '18 ft Municipal Tar Road (Two-side corner)',
        expectedPrice: 2400000,
        marketPrice: 2300000,
        description:
          'Level rectangular residential plot with 18ft tar road frontage on two sides. Sweet open well water year-round and 3-phase KSEB line at plot corner.',
        sellerId: slr1.id,
        status: 'Available',
        approvalStatus: 'APPROVED',
        isPublished: true,
        publishedAt: hoursFromNow(-72),
        publishedBy: adminUser.id,
        assignedAgentId: meera.id,
        internalNotes: 'Clear Pattayam verified. Price negotiable for down payment.',
        latitude: 12.313,
        longitude: 75.091,
        listedDate: daysAgo(38),
        isDemoData: true,
      },
      {
        legacyId: 'prp-2',
        code: 'TAK002',
        title: 'Teakwood Courtyard Residence',
        type: 'Villa',
        category: 'Residential',
        district: 'Kasaragod',
        panchayath: 'Nileshwar Municipality',
        locality: 'Padannakkad',
        fullAddress: 'Courtyard Enclave, Padannakkad, Nileshwar, Kasaragod',
        location: 'Padannakkad, Nileshwar, Kasaragod',
        areaValue: 2850,
        areaUnit: 'Sq.ft',
        areaDisplay: '2,850 Sq.ft (18 Cents)',
        bedrooms: 4,
        bathrooms: 4,
        roadConnectivity: '12 ft Concrete Access Road connecting to NH-66',
        expectedPrice: 11800000,
        marketPrice: 11400000,
        description:
          'Architect-designed 4BHK courtyard villa featuring Burma teak louvers, laterite cladding, open sky-lit indoor water courtyard, and 5kW solar backup.',
        sellerId: slr1.id,
        status: 'Under Negotiation',
        approvalStatus: 'APPROVED',
        isPublished: true,
        publishedAt: hoursFromNow(-48),
        publishedBy: adminUser.id,
        assignedAgentId: meera.id,
        internalNotes: 'Two NRI families inspected.',
        latitude: 12.256,
        longitude: 75.134,
        listedDate: daysAgo(68),
        isDemoData: true,
      },
      {
        legacyId: 'prp-3',
        code: 'TAK003',
        title: 'Malabar Hilltop Cardamom & Pepper Estate',
        type: 'Land',
        category: 'Plantation',
        district: 'Kasaragod',
        panchayath: 'Panathady Grama Panchayath',
        locality: 'Ranipuram',
        location: 'Ranipuram, Panathady, Kasaragod',
        areaValue: 6.5,
        areaUnit: 'Acres',
        areaDisplay: '6.5 Acres',
        roadConnectivity: 'Panchayath Metal Road with Jeep Track',
        expectedPrice: 19500000,
        marketPrice: 18500000,
        description:
          '6.5-acre mist-clad plantation with mature silver oak shade trees, pepper vines, natural spring stream, and panoramic valley views near Ranipuram.',
        sellerId: slr3.id,
        status: 'Available',
        approvalStatus: 'APPROVED',
        isPublished: true,
        publishedAt: hoursFromNow(-24),
        publishedBy: adminUser.id,
        assignedAgentId: karthik.id,
        internalNotes: 'Eco-resort permit feasibility assessed.',
        latitude: 12.463,
        longitude: 75.342,
        listedDate: daysAgo(45),
        isDemoData: true,
      },
      {
        legacyId: 'prp-4',
        code: 'TAK004',
        title: 'Bekal Fort View Coastal Homestead',
        type: 'House',
        category: 'Residential',
        district: 'Kasaragod',
        panchayath: 'Pallikere Grama Panchayath',
        locality: 'Bekal',
        location: 'Bekal, Pallikere, Kasaragod',
        areaValue: 2100,
        areaUnit: 'Sq.ft',
        areaDisplay: '2,100 Sq.ft (15 Cents)',
        bedrooms: 3,
        bathrooms: 3,
        roadConnectivity: '15 ft Tarred Coastal Road',
        expectedPrice: 7800000,
        marketPrice: 7500000,
        description:
          'Breezy 3BHK coastal residence 900m from Bekal Beach Park with landscaped coconut garden, covered verandah, and compound gate.',
        sellerId: slr2.id,
        status: 'Available',
        approvalStatus: 'APPROVED',
        isPublished: false,
        assignedAgentId: sana.id,
        internalNotes: 'Awaiting owner confirmation before public website publishing.',
        latitude: 12.392,
        longitude: 75.035,
        listedDate: daysAgo(15),
        isDemoData: true,
      },
    ])
    .onConflictDoNothing()
    .returning();

  const mediaRows: Array<typeof propertyMedia.$inferInsert> = [];
  const samplePhotos = [
    '/src/assets/images/prop_land_coastal_1794980388013.jpg',
    '/src/assets/images/prop_villa_courtyard_1794980387156.jpg',
    '/src/assets/images/prop_agriculture_estate_1794980388181.jpg',
    '/src/assets/images/prop_stay_homestay_1794980390926.jpg',
  ];

  insertedProps.forEach((p, idx) => {
    mediaRows.push({
      propertyId: p.id,
      originalFilename: `${p.code.toLowerCase()}_cover.jpg`,
      storageKey: `seed-${p.code.toLowerCase()}-1`,
      fileType: 'JPEG',
      mimeType: 'image/jpeg',
      fileSize: 245000,
      mediaCategory: 'PHOTO',
      displayOrder: 0,
      isCover: true,
      externalUrl: samplePhotos[idx % samplePhotos.length],
      uploadedBy: adminUser.id,
    });
    if (p.isPublished) {
      db.insert(propertyPublicationHistory)
        .values({
          propertyId: p.id,
          actorId: adminUser.id,
          actorName: adminUser.name,
          action: 'PUBLISHED',
          notes: 'Initial showcase publication',
        })
        .catch(() => {});
    }
    if (p.assignedAgentId) {
      db.insert(propertyAssignments)
        .values({
          propertyId: p.id,
          agentId: p.assignedAgentId,
          assignedBy: adminUser.id,
          assignmentStatus: 'ACTIVE',
          notes: 'Initial portfolio assignment',
        })
        .catch(() => {});
    }
  });

  if (mediaRows.length > 0) {
    await db.insert(propertyMedia).values(mediaRows).onConflictDoNothing();
  }

  // Seed initial Property Submissions (including 1 overdue >48h and 1 fresh pending)
  const insertedSubs = await db
    .insert(propertySubmissions)
    .values([
      {
        referenceNumber: 'SUB-20261123-1001',
        sellerName: 'Suresh Babu P',
        mobileNumber: '+91 94475 61230',
        propertyType: 'House',
        location: 'Mavungal, Kanhangad, Kasaragod',
        district: 'Kasaragod',
        panchayath: 'Kanhangad Municipality',
        locality: 'Mavungal',
        shortDescription:
          '2,200 sq.ft 3BHK double-storey independent house on 10 cents with car porch and sweet well water near Mavungal junction.',
        expectedPrice: 6800000,
        propertySize: '10 Cents / 2,200 Sq.ft',
        bedrooms: 3,
        bathrooms: 3,
        additionalNotes: 'Prefer calls after 4 PM.',
        source: 'PUBLIC',
        status: 'PENDING_REVIEW',
        submittedAt: hoursFromNow(-6),
        contactDeadlineAt: hoursFromNow(42),
        contactStatus: 'PENDING',
      },
      {
        referenceNumber: 'SUB-20261120-1002',
        sellerName: 'Lakshmi Narayanan',
        mobileNumber: '+91 98468 77312',
        propertyType: 'Land',
        location: 'Udma, Kasaragod',
        district: 'Kasaragod',
        panchayath: 'Udma Grama Panchayath',
        locality: 'Udma',
        shortDescription:
          '20 cents level commercial-cum-residential roadside plot 300m from Udma town bus stop.',
        expectedPrice: 4600000,
        propertySize: '20 Cents',
        additionalNotes: 'Telecaller verified clear boundary stones.',
        source: 'TELECALLER',
        submittedByUserId: telecaller.id,
        status: 'UNDER_REVIEW',
        submittedAt: hoursFromNow(-60),
        contactDeadlineAt: hoursFromNow(-12),
        contactStatus: 'OVERDUE',
      },
    ])
    .onConflictDoNothing()
    .returning();

  for (const sub of insertedSubs) {
    await db
      .insert(propertySubmissionHistory)
      .values({
        submissionId: sub.id,
        actorId: sub.submittedByUserId || null,
        actorName: sub.source === 'TELECALLER' ? telecaller.name : sub.sellerName,
        action: 'SUBMITTED',
        newStatus: sub.status,
        notes:
          sub.source === 'TELECALLER'
            ? 'Submitted via Telecaller workspace'
            : 'Submitted via public /submit-property form',
      })
      .onConflictDoNothing();
  }
}
