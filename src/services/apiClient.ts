import { auth } from '../lib/firebase';

export type ServerUserRole = 'ADMIN' | 'TELECALLER' | 'AGENT';

export interface CRMUserProfile {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: ServerUserRole;
  designation: string;
  active: boolean;
}

export interface MediaDTO {
  id: number;
  propertyId: number | null;
  submissionId: number | null;
  originalFilename?: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  mediaCategory: 'PHOTO' | 'VIDEO';
  displayOrder: number;
  isCover: boolean;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface PublicPropertyDTO {
  id: number;
  code: string;
  title: string;
  type: string;
  category: string;
  district: string;
  panchayath: string;
  locality: string;
  location: string;
  areaDisplay: string;
  bedrooms: number | null;
  bathrooms: number | null;
  roadConnectivity: string;
  expectedPrice: number | null;
  description: string;
  status: string;
  listedDate: string;
  publishedAt: string | null;
  coverImageUrl: string | null;
  photos: MediaDTO[];
  videos: MediaDTO[];
}

export interface PublicSubmissionReceipt {
  referenceNumber: string;
  status: string;
  submittedAt: string;
  contactDeadlineAt: string;
  photoCount: number;
  videoCount: number;
}

export type SubmissionStatusType =
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_PROPERTY';

export interface SubmissionRecordDTO {
  id: number;
  referenceNumber: string;
  sellerName: string;
  mobileNumber: string;
  sellerEmail?: string;
  propertyType: string;
  location: string;
  district: string;
  panchayath: string;
  locality: string;
  shortDescription: string;
  expectedPrice: number | null;
  propertySize: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  additionalNotes: string | null;
  source: 'PUBLIC' | 'TELECALLER';
  submittedByUserId: number | null;
  submittedByName?: string | null;
  status: SubmissionStatusType;
  submittedAt: string;
  contactDeadlineAt: string;
  firstContactAt: string | null;
  contactStatus: 'PENDING' | 'CONTACTED' | 'OVERDUE';
  isContactOverdue: boolean;
  reviewedBy: number | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  correctionNotes: string | null;
  internalNotes: string;
  assignedAgentId: number | null;
  assignedAgentName: string | null;
  convertedPropertyId: number | null;
  photoCount?: number;
  videoCount?: number;
}

export interface SubmissionSummaryStats {
  total: number;
  pendingReview: number;
  underReview: number;
  approved: number;
  rejected: number;
  converted: number;
  overdueContact: number;
}

export interface SubmissionHistoryDTO {
  id: number;
  submissionId: number;
  actorId: number | null;
  actorName: string;
  action: string;
  previousStatus: string | null;
  newStatus: string | null;
  notes: string;
  createdAt: string;
}

export interface AdminPropertyDTO {
  id: number;
  code: string;
  title: string;
  type: string;
  category: string;
  district: string;
  panchayath: string;
  locality: string;
  location: string;
  areaValue: number;
  areaUnit: string;
  areaDisplay: string;
  bedrooms: number | null;
  bathrooms: number | null;
  roadConnectivity: string;
  expectedPrice: number;
  marketPrice: number | null;
  description: string;
  sellerId: number;
  sellerName: string;
  sellerPhone: string;
  sellerWhatsapp?: string;
  submissionId: number | null;
  status: string;
  approvalStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  isPublished: boolean;
  publishedAt: string | null;
  unpublishedAt: string | null;
  assignedAgentId: number | null;
  assignedAgentName?: string;
  internalNotes: string;
  listedDate: string;
  createdAt: string;
  updatedAt: string;
  media: MediaDTO[];
  coverImageUrl: string | null;
}

export interface TeamMemberDTO {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: ServerUserRole;
  designation: string;
  active: boolean;
}

export interface NotificationDTO {
  id: number;
  eventType: string;
  title: string;
  message: string;
  entityType: string;
  entityId: number;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogDTO {
  id: number;
  actorId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export interface TelecallerSubmissionDTO {
  id: number;
  referenceNumber: string;
  sellerName: string;
  mobileNumber: string;
  sellerEmail?: string;
  propertyType: string;
  location: string;
  expectedPrice: number | null;
  propertySize: string | null;
  status: SubmissionStatusType;
  contactStatus: 'PENDING' | 'CONTACTED' | 'OVERDUE';
  submittedAt: string;
  contactDeadlineAt: string;
}

export interface PropertyFollowUpDTO {
  id: number;
  propertyId: number | null;
  submissionId: number | null;
  agentId: number;
  title: string;
  activityType: string;
  scheduledDate: string;
  scheduledTime: string;
  notes: string;
  status: 'PENDING' | 'COMPLETED';
  completedAt: string | null;
  createdAt: string;
}

async function getBearerToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  return await currentUser.getIdToken();
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    withAuth?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, withAuth = true } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (withAuth) {
    const token = await getBearerToken();
    if (!token) {
      throw new Error('Authentication session required.');
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error || `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return payload as T;
}

async function uploadFormDataWithProgress<T>(
  path: string,
  formData: FormData,
  options: { withAuth: boolean; onProgress?: (percent: number) => void }
): Promise<T> {
  const token = options.withAuth ? await getBearerToken() : null;
  if (options.withAuth && !token) {
    throw new Error('Authentication session required.');
  }

  return await new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: any = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as T);
      } else {
        reject(new Error(data?.error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during file upload.'));
    xhr.send(formData);
  });
}

export const apiClient = {
  // Public Endpoints
  submitPublicProperty: (formData: FormData, onProgress?: (pct: number) => void) =>
    uploadFormDataWithProgress<PublicSubmissionReceipt>(
      '/public/property-submissions',
      formData,
      { withAuth: false, onProgress }
    ),

  getPublicProperties: (params: {
    page?: number;
    limit?: number;
    search?: string;
    propertyType?: string;
    location?: string;
    minPrice?: string;
    maxPrice?: string;
  }) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'All') sp.set(k, String(v));
    });
    const qs = sp.toString();
    return apiRequest<{
      items: PublicPropertyDTO[];
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }>(`/public/properties${qs ? `?${qs}` : ''}`, { withAuth: false });
  },

  getPublicPropertyDetail: (idOrCode: string) =>
    apiRequest<PublicPropertyDTO>(`/public/properties/${encodeURIComponent(idOrCode)}`, {
      withAuth: false,
    }),

  // Auth & Notifications
  getMe: () =>
    apiRequest<{ user: CRMUserProfile; unreadNotifications: number }>('/auth/me'),

  getNotifications: () =>
    apiRequest<{ items: NotificationDTO[] }>('/notifications'),

  markNotificationRead: (id: number) =>
    apiRequest<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),

  // Telecaller
  getTelecallerSubmissions: () =>
    apiRequest<{ items: TelecallerSubmissionDTO[] }>('/telecaller/submissions'),

  submitTelecallerProperty: (formData: FormData, onProgress?: (pct: number) => void) =>
    uploadFormDataWithProgress<PublicSubmissionReceipt & { id: number }>(
      '/telecaller/properties',
      formData,
      { withAuth: true, onProgress }
    ),

  // Admin Submissions
  getAdminSubmissions: (params: {
    status?: string;
    contactStatus?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'ALL') sp.set(k, String(v));
    });
    const qs = sp.toString();
    return apiRequest<{
      summary: SubmissionSummaryStats;
      total: number;
      page: number;
      limit: number;
      items: SubmissionRecordDTO[];
    }>(`/admin/property-submissions${qs ? `?${qs}` : ''}`);
  },

  getAdminSubmissionDetail: (id: number) =>
    apiRequest<{
      submission: SubmissionRecordDTO;
      media: MediaDTO[];
      history: SubmissionHistoryDTO[];
    }>(`/admin/property-submissions/${id}`),

  updateAdminSubmission: (id: number, body: Record<string, unknown>) =>
    apiRequest<{ submission: SubmissionRecordDTO }>(`/admin/property-submissions/${id}`, {
      method: 'PATCH',
      body,
    }),

  approveSubmission: (id: number, notes?: string) =>
    apiRequest<{ submission: SubmissionRecordDTO }>(
      `/admin/property-submissions/${id}/approve`,
      { method: 'POST', body: { notes } }
    ),

  rejectSubmission: (id: number, reason: string) =>
    apiRequest<{ submission: SubmissionRecordDTO }>(
      `/admin/property-submissions/${id}/reject`,
      { method: 'POST', body: { reason } }
    ),

  requestSubmissionInfo: (id: number, notes: string) =>
    apiRequest<{ submission: SubmissionRecordDTO }>(
      `/admin/property-submissions/${id}/request-information`,
      { method: 'POST', body: { notes } }
    ),

  logSubmissionContact: (id: number, method: string, notes: string) =>
    apiRequest<{ submission: SubmissionRecordDTO }>(
      `/admin/property-submissions/${id}/log-contact`,
      { method: 'POST', body: { method, notes } }
    ),

  convertSubmissionToProperty: (id: number, overrides?: Record<string, unknown>) =>
    apiRequest<{
      submission: SubmissionRecordDTO;
      property: AdminPropertyDTO;
    }>(`/admin/property-submissions/${id}/convert`, {
      method: 'POST',
      body: overrides || {},
    }),

  // Admin Properties, Publishing, Assignment & Team
  getAdminProperties: () =>
    apiRequest<{ items: AdminPropertyDTO[] }>('/admin/properties'),

  updateAdminProperty: (id: number, body: Record<string, unknown>) =>
    apiRequest<{ property: AdminPropertyDTO }>(`/admin/properties/${id}`, {
      method: 'PATCH',
      body,
    }),

  publishProperty: (id: number, notes?: string) =>
    apiRequest<{ property: AdminPropertyDTO }>(`/admin/properties/${id}/publish`, {
      method: 'POST',
      body: { notes },
    }),

  unpublishProperty: (id: number, notes?: string) =>
    apiRequest<{ property: AdminPropertyDTO }>(`/admin/properties/${id}/unpublish`, {
      method: 'POST',
      body: { notes },
    }),

  assignPropertyAgent: (id: number, agentId: number, notes?: string) =>
    apiRequest<{ property: AdminPropertyDTO }>(`/admin/properties/${id}/assign`, {
      method: 'POST',
      body: { agentId, notes },
    }),

  getPropertyHistory: (id: number) =>
    apiRequest<{
      assignments: Array<{
        id: number;
        agentId: number;
        agentName: string;
        previousAgentName: string | null;
        assignedByName: string;
        assignmentStatus: string;
        notes: string;
        assignedAt: string;
      }>;
      publicationHistory: Array<{
        id: number;
        actorName: string;
        action: string;
        notes: string;
        createdAt: string;
      }>;
    }>(`/admin/properties/${id}/assignments`),

  uploadPropertyMedia: (
    propertyId: number,
    formData: FormData,
    onProgress?: (pct: number) => void
  ) =>
    uploadFormDataWithProgress<{ items: MediaDTO[] }>(
      `/properties/${propertyId}/media`,
      formData,
      { withAuth: true, onProgress }
    ),

  reorderPropertyMedia: (
    propertyId: number,
    payload: { coverMediaId?: number; orderedMediaIds?: number[] }
  ) =>
    apiRequest<{ items: MediaDTO[] }>(`/properties/${propertyId}/media/reorder`, {
      method: 'PATCH',
      body: payload,
    }),

  deleteMedia: (mediaId: number) =>
    apiRequest<{ ok: boolean }>(`/media/${mediaId}`, { method: 'DELETE' }),

  getAdminUsers: () => apiRequest<{ items: TeamMemberDTO[] }>('/admin/users'),

  createAdminUser: (body: {
    name: string;
    email: string;
    phone?: string;
    role: ServerUserRole;
    designation?: string;
  }) => apiRequest<{ user: TeamMemberDTO }>('/admin/users', { method: 'POST', body }),

  updateAdminUser: (
    id: number,
    body: { role?: ServerUserRole; active?: boolean; designation?: string }
  ) =>
    apiRequest<{ user: TeamMemberDTO }>(`/admin/users/${id}`, {
      method: 'PATCH',
      body,
    }),

  getAuditLogs: () => apiRequest<{ items: AuditLogDTO[] }>('/admin/audit-logs'),

  // Agent Scoped Endpoints
  getAgentProperties: () =>
    apiRequest<{ items: AdminPropertyDTO[] }>('/agent/properties'),

  getAgentPropertyDetail: (id: number) =>
    apiRequest<{
      property: AdminPropertyDTO;
      seller: { id: number; name: string; phone: string; whatsapp: string; address: string };
      media: MediaDTO[];
      followUps: PropertyFollowUpDTO[];
    }>(`/agent/properties/${id}`),

  updateAgentProperty: (
    id: number,
    body: { status?: string; roadConnectivity?: string; description?: string; internalNotes?: string }
  ) =>
    apiRequest<{ property: AdminPropertyDTO }>(`/agent/properties/${id}`, {
      method: 'PATCH',
      body,
    }),

  createAgentFollowUp: (
    propertyId: number,
    body: {
      title: string;
      activityType: string;
      scheduledDate: string;
      scheduledTime: string;
      notes: string;
      status?: 'PENDING' | 'COMPLETED';
    }
  ) =>
    apiRequest<{ followUp: PropertyFollowUpDTO }>(
      `/agent/properties/${propertyId}/follow-ups`,
      { method: 'POST', body }
    ),

  updateAgentFollowUp: (
    followUpId: number,
    body: { status: 'PENDING' | 'COMPLETED'; notes?: string }
  ) =>
    apiRequest<{ followUp: PropertyFollowUpDTO }>(`/agent/follow-ups/${followUpId}`, {
      method: 'PATCH',
      body,
    }),
};
