export type UserRole = 'Admin' | 'Agent';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  designation: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type PropertyType =
  | 'Plot / Land'
  | 'Villa'
  | 'Flat / Apartment'
  | 'Agriculture'
  | 'Commercial'
  | 'Other';

export type PropertyStatus =
  | 'Available'
  | 'Under Negotiation'
  | 'Reserved'
  | 'Sold'
  | 'Rented'
  | 'Inactive';

export type RunningCategory =
  | 'Active Listing'
  | 'Under Negotiation'
  | 'Reserved'
  | 'Managed / Operating'
  | 'Rented / Occupied'
  | 'Inactive';

export type AreaUnit = 'Cents' | 'Sq.ft' | 'Acres';

export interface PropertyImage {
  id: string;
  propertyId: string;
  url: string;
  caption: string;
  isPrimary: boolean;
  created_at: string;
}

export interface PropertyDocument {
  id: string;
  entityType: 'Property' | 'Seller' | 'Deal' | 'Rental';
  entityId: string;
  name: string;
  docType: string;
  fileSize: string;
  uploadedAt: string;
  notes?: string;
}

export interface Seller {
  id: string;
  code: string;
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  notes: string;
  assignedAgentId: string;
  lastContactAt: string;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  code: string;
  title: string;
  type: PropertyType;
  location: string;
  areaValue: number;
  areaUnit: AreaUnit;
  areaDisplay: string;
  askingPrice: number;
  description: string;
  sellerId: string;
  status: PropertyStatus;
  runningCategory: RunningCategory;
  isManaged: boolean;
  assignedAgentId: string;
  internalNotes: string;
  nextFollowUpDate: string;
  addedDate: string;
  coordinates: { lat: number; lng: number };
  created_at: string;
  updated_at: string;
}

export type LeadStatus =
  | 'New'
  | 'Contacted'
  | 'Qualified'
  | 'Property Shared'
  | 'Site Visit'
  | 'Negotiation'
  | 'Converted'
  | 'Lost'
  | 'On Hold';

export interface Lead {
  id: string;
  code: string;
  name: string;
  phone: string;
  whatsapp: string;
  preferredLocation: string;
  minBudget: number;
  maxBudget: number;
  propertyType: PropertyType | 'Any';
  requirementDescription: string;
  status: LeadStatus;
  assignedAgentId: string;
  nextFollowUpDate: string;
  notes: string;
  conversionDetails?: string;
  created_at: string;
  updated_at: string;
}

export type BuyerInterest = 'Pending' | 'High' | 'Medium' | 'Low' | 'Rejected';
export type MatchOutcome =
  | 'Open'
  | 'Shortlisted'
  | 'Site Visit Done'
  | 'Negotiating'
  | 'Deal Created'
  | 'Declined';

export interface PropertyMatch {
  id: string;
  leadId: string;
  propertyId: string;
  matchScore: number;
  matchReasons: string[];
  matchedAt: string;
  sharedAt?: string;
  isShared: boolean;
  buyerInterest: BuyerInterest;
  siteVisitScheduled: boolean;
  outcome: MatchOutcome;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type FollowUpActivityType =
  | 'Call'
  | 'WhatsApp'
  | 'Meeting'
  | 'Site Visit'
  | 'Email'
  | 'Other';

export interface FollowUp {
  id: string;
  title: string;
  relatedType: 'Lead' | 'Seller';
  relatedId: string;
  propertyId?: string;
  assignedAgentId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  activityType: FollowUpActivityType;
  notes: string;
  status: 'Pending' | 'Completed';
  completedAt?: string;
  created_at: string;
  updated_at: string;
}

export interface SiteVisit {
  id: string;
  propertyId: string;
  leadId: string;
  agentId: string;
  scheduledDate: string;
  scheduledTime: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled' | 'Rescheduled';
  feedback: string;
  created_at: string;
  updated_at: string;
}

export type DealStatus =
  | 'Interested'
  | 'Site Visit'
  | 'Negotiation'
  | 'Booking'
  | 'Closed'
  | 'Cancelled'
  | 'Lost';

export interface Deal {
  id: string;
  code: string;
  dealType: 'Sale' | 'Rental';
  leadId: string;
  sellerId: string;
  propertyId: string;
  assignedAgentId: string;
  agreedPrice: number;
  commissionRate: number;
  commissionAmount: number;
  dealDate: string;
  status: DealStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Investor {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Investment {
  id: string;
  code: string;
  propertyId: string;
  investorId: string;
  investmentAmount: number;
  additionalExpenses: number;
  expectedReturn: number;
  actualReturn: number;
  investmentDate: string;
  durationMonths: number;
  status: 'Active' | 'Completed' | 'Pending';
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  phone: string;
  email: string;
  idProof: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type RentalType = 'Daily Stay' | 'Monthly' | 'Yearly';
export type RentalStatus = 'Available' | 'Booked' | 'Occupied' | 'Maintenance' | 'Vacant';

export interface RentalBooking {
  id: string;
  code: string;
  propertyId: string;
  tenantId?: string;
  rentalType: RentalType;
  rateAmount: number;
  bookingDate: string;
  checkIn: string;
  checkOut: string;
  deposit: number;
  contractRef: string;
  incomeReceived: number;
  status: RentalStatus;
  maintenanceNotes: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  entityType: 'Property' | 'Rental' | 'Investment';
  entityId: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  entityType:
    | 'Property'
    | 'Seller'
    | 'Lead'
    | 'Match'
    | 'FollowUp'
    | 'SiteVisit'
    | 'Deal'
    | 'Investment'
    | 'Rental'
    | 'System';
  entityId: string;
  action: string;
  summary: string;
  actorId: string;
  timestamp: string;
}

export interface AgencySettings {
  agencyName: string;
  agencyTagline: string;
  currencySymbol: string;
  defaultCommissionRate: number;
  propertyCategories: PropertyType[];
  leadStatuses: LeadStatus[];
  followUpDefaults: {
    defaultTime: string;
    reminderWindowHours: number;
    autoCreateOnRegistration: boolean;
  };
  currentUserId: string;
}

export interface CRMDatabase {
  users: User[];
  sellers: Seller[];
  properties: Property[];
  propertyImages: PropertyImage[];
  propertyDocuments: PropertyDocument[];
  leads: Lead[];
  propertyMatches: PropertyMatch[];
  followUps: FollowUp[];
  siteVisits: SiteVisit[];
  deals: Deal[];
  investors: Investor[];
  investments: Investment[];
  tenants: Tenant[];
  rentalBookings: RentalBooking[];
  expenses: Expense[];
  activityLogs: ActivityLog[];
  settings: AgencySettings;
}

export type RoutePage =
  | 'dashboard'
  | 'properties'
  | 'property-detail'
  | 'register-property'
  | 'leads'
  | 'lead-detail'
  | 'sellers'
  | 'seller-detail'
  | 'running-properties'
  | 'follow-ups'
  | 'deals'
  | 'investments'
  | 'rentals'
  | 'reports'
  | 'settings';
