import {
  ActivityLog,
  CRMDatabase,
  Deal,
  FollowUp,
  Investment,
  Lead,
  Property,
  PropertyMatch,
  RentalBooking,
  Seller,
  SellerAdvance,
  SiteVisit,
  User,
} from '../types/crm';

const rawBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
const API_BASE = (rawBase || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? '' : 'http://localhost:8000')).replace(/\/+$/, '');
const TOKEN_KEY = 'crm_access_token';
const REFRESH_KEY = 'crm_refresh_token';

class ApiClient {
  private getHeaders(contentType: boolean = true): HeadersInit {
    const headers: Record<string, string> = {};
    if (contentType) {
      headers['Content-Type'] = 'application/json';
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}${endpoint}`;
    const headers = { ...this.getHeaders(!(options.body instanceof FormData)), ...(options.headers as Record<string, string>) };
    
    let res = await fetch(url, { ...options, headers });

    if (res.status === 401 && localStorage.getItem(REFRESH_KEY)) {
      // Attempt token refresh
      const refreshed = await this.refreshToken();
      if (refreshed) {
        const retryHeaders = {
          ...this.getHeaders(!(options.body instanceof FormData)),
          ...(options.headers as Record<string, string>),
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        };
        res = await fetch(url, { ...options, headers: retryHeaders });
      }
    }

    if (!res.ok) {
      let errorMsg = `API Error ${res.status}: ${res.statusText}`;
      try {
        const errJson = await res.json();
        if (errJson.detail) {
          errorMsg = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {}
      throw new Error(errorMsg);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return (await res.json()) as T;
  }

  // ==================== AUTH ====================
  async login(username: string, password: string):Promise<{ access_token: string; refresh_token: string; user: User }> {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(err.detail || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
    return data;
  }

  async refreshToken(): Promise<boolean> {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) return false;

    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        this.logout();
        return false;
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      return true;
    } catch {
      this.logout();
      return false;
    }
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  async getMe(): Promise<User> {
    return this.request<User>('/api/auth/me');
  }

  async updateProfile(data: { name?: string; phone?: string; designation?: string; password?: string }): Promise<User> {
    return this.request<User>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ==================== DASHBOARD ====================
  async getDashboardSummary(): Promise<any> {
    return this.request('/api/dashboard/summary');
  }

  async getRecentActivities(): Promise<ActivityLog[]> {
    return this.request<ActivityLog[]>('/api/dashboard/activities');
  }

  // ==================== SELLERS ====================
  async getSellers(params: { page?: number; page_size?: number; search?: string } = {}): Promise<{ items: Seller[]; total: number }> {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.page_size) query.append('page_size', params.page_size.toString());
    if (params.search) query.append('search', params.search);
    return this.request<{ items: Seller[]; total: number }>(`/api/sellers?${query.toString()}`);
  }

  async getSeller(id: string): Promise<Seller> {
    return this.request<Seller>(`/api/sellers/${id}`);
  }

  async getSellerProperties(id: string): Promise<Property[]> {
    return this.request<Property[]>(`/api/sellers/${id}/properties`);
  }

  async createSeller(data: Partial<Seller>): Promise<Seller> {
    return this.request<Seller>('/api/sellers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSeller(id: string, data: Partial<Seller>): Promise<Seller> {
    return this.request<Seller>(`/api/sellers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ==================== PROPERTIES ====================
  async getProperties(params: Record<string, any> = {}): Promise<{ items: Property[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v.toString());
      }
    });
    return this.request<{ items: Property[]; total: number }>(`/api/properties?${query.toString()}`);
  }

  async getProperty(id: string): Promise<Property> {
    return this.request<Property>(`/api/properties/${id}`);
  }

  async getMapProperties(filters: Record<string, any> = {}): Promise<Property[]> {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) query.append(k, v.toString());
    });
    return this.request<Property[]>(`/api/properties/map?${query.toString()}`);
  }

  async createProperty(data: any): Promise<Property> {
    return this.request<Property>('/api/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateProperty(id: string, data: any): Promise<Property> {
    return this.request<Property>(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getPropertyPriceHistory(id: string): Promise<any[]> {
    return this.request<any[]>(`/api/properties/${id}/history`);
  }

  async getMatchingLeadsForProperty(id: string): Promise<any[]> {
    return this.request<any[]>(`/api/properties/${id}/leads`);
  }

  // ==================== COMBINED REGISTRATION ====================
  async registerSellerAndProperty(payload: any): Promise<{ seller: Seller; property: Property; advance?: SellerAdvance }> {
    return this.request<{ seller: Seller; property: Property; advance?: SellerAdvance }>('/api/registration/seller-property', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== LEADS ====================
  async getLeads(params: Record<string, any> = {}): Promise<{ items: Lead[]; total: number }> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.append(k, v.toString());
    });
    return this.request<{ items: Lead[]; total: number }>(`/api/leads?${query.toString()}`);
  }

  async getLead(id: string): Promise<Lead> {
    return this.request<Lead>(`/api/leads/${id}`);
  }

  async createLead(data: any): Promise<Lead> {
    return this.request<Lead>('/api/leads', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLead(id: string, data: any): Promise<Lead> {
    return this.request<Lead>(`/api/leads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getMatchingPropertiesForLead(id: string): Promise<any[]> {
    return this.request<any[]>(`/api/leads/${id}/matches`);
  }

  // ==================== MATCHES ====================
  async getMatches(params: { lead_id?: string; property_id?: string } = {}): Promise<PropertyMatch[]> {
    const query = new URLSearchParams();
    if (params.lead_id) query.append('lead_id', params.lead_id);
    if (params.property_id) query.append('property_id', params.property_id);
    return this.request<PropertyMatch[]>(`/api/matches?${query.toString()}`);
  }

  async createMatch(data: any): Promise<PropertyMatch> {
    return this.request<PropertyMatch>('/api/matches', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMatch(id: string, data: any): Promise<PropertyMatch> {
    return this.request<PropertyMatch>(`/api/matches/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ==================== FOLLOW-UPS ====================
  async getFollowUps(params: { page?: number; page_size?: number; status?: string } = {}): Promise<{ items: FollowUp[]; total: number }> {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.page_size) query.append('page_size', params.page_size.toString());
    if (params.status) query.append('status', params.status);
    return this.request<{ items: FollowUp[]; total: number }>(`/api/followups?${query.toString()}`);
  }

  async createFollowUp(data: any): Promise<FollowUp> {
    return this.request<FollowUp>('/api/followups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateFollowUp(id: string, data: any): Promise<FollowUp> {
    return this.request<FollowUp>(`/api/followups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async completeFollowUp(id: string, payload: any): Promise<FollowUp> {
    return this.request<FollowUp>(`/api/followups/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ==================== SITE VISITS ====================
  async getSiteVisits(params: { property_id?: string; lead_id?: string } = {}): Promise<SiteVisit[]> {
    const query = new URLSearchParams();
    if (params.property_id) query.append('property_id', params.property_id);
    if (params.lead_id) query.append('lead_id', params.lead_id);
    return this.request<SiteVisit[]>(`/api/site-visits?${query.toString()}`);
  }

  async createSiteVisit(data: any): Promise<SiteVisit> {
    return this.request<SiteVisit>('/api/site-visits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateSiteVisit(id: string, data: any): Promise<SiteVisit> {
    return this.request<SiteVisit>(`/api/site-visits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ==================== DEALS ====================
  async getDeals(params: { page?: number; page_size?: number; status?: string } = {}): Promise<{ items: Deal[]; total: number }> {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.page_size) query.append('page_size', params.page_size.toString());
    if (params.status) query.append('status', params.status);
    return this.request<{ items: Deal[]; total: number }>(`/api/deals?${query.toString()}`);
  }

  async createDeal(data: any): Promise<Deal> {
    return this.request<Deal>('/api/deals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateDeal(id: string, data: any): Promise<Deal> {
    return this.request<Deal>(`/api/deals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ==================== ADVANCES & INVESTMENTS ====================
  async getAdvances(params: { seller_id?: string; property_id?: string } = {}): Promise<SellerAdvance[]> {
    const query = new URLSearchParams();
    if (params.seller_id) query.append('seller_id', params.seller_id);
    if (params.property_id) query.append('property_id', params.property_id);
    return this.request<SellerAdvance[]>(`/api/finance/advances?${query.toString()}`);
  }

  async createAdvance(data: any): Promise<SellerAdvance> {
    return this.request<SellerAdvance>('/api/finance/advances', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAdvance(id: string, data: any): Promise<SellerAdvance> {
    return this.request<SellerAdvance>(`/api/finance/advances/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getInvestments(): Promise<Investment[]> {
    return this.request<Investment[]>('/api/finance/investments');
  }

  async createInvestment(data: any): Promise<Investment> {
    return this.request<Investment>('/api/finance/investments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ==================== RENTALS ====================
  async getRentals(property_id?: string): Promise<RentalBooking[]> {
    const query = property_id ? `?property_id=${property_id}` : '';
    return this.request<RentalBooking[]>(`/api/rentals${query}`);
  }

  async createRental(data: any): Promise<RentalBooking> {
    return this.request<RentalBooking>('/api/rentals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRental(id: string, data: any): Promise<RentalBooking> {
    return this.request<RentalBooking>(`/api/rentals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // ==================== REPORTS ====================
  async getPropertyReports(): Promise<any> {
    return this.request('/api/reports/properties');
  }

  async getLeadReports(): Promise<any> {
    return this.request('/api/reports/leads');
  }

  async getSalesReport(): Promise<any> {
    return this.request('/api/reports/sales');
  }

  // ==================== SETTINGS & USERS ====================
  async getSettings(): Promise<any> {
    return this.request('/api/settings');
  }

  async updateSettings(data: any): Promise<any> {
    return this.request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/api/users');
  }

  async createUser(data: any): Promise<User> {
    return this.request<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
