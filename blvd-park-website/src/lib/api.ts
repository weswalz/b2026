const API_URL = import.meta.env.PUBLIC_API_URL || 'https://blvdpark.com';

const getAuthHeaders = (): HeadersInit => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('blvd-auth-token');
  return token ? { 'x-auth-key': token } : {};
};

// Attaches HTTP status to thrown errors so callers (and QueryCache) can inspect it
function apiError(res: Response, message: string): Error {
  const err = new Error(message) as Error & { status: number };
  err.status = res.status;
  return err;
}

// Reads JSON error body and surfaces server-provided message; falls back to default.
async function apiErrorWithBody(res: Response, fallback: string): Promise<Error> {
  let serverMessage = '';
  try {
    const body = await res.clone().json();
    serverMessage = body?.message || body?.error || '';
  } catch (_e) { /* not JSON */ }
  const err = new Error(serverMessage || fallback) as Error & { status: number };
  err.status = res.status;
  return err;
}

// Types
export interface Event {
  id: number;
  title: string;
  date: string;
  time: string;
  description: string;
  category: string;
  image: string | null;
  ticketUrl: string | null;
  status: string;
  isRecurring: number;
  recurringPattern: string | null;
  recurringEndDate: string | null;
  slug: string | null;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  deleted_at: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GalleryImage {
  id: number;
  url: string;
  alt: string;
  category: string;
  position: number;
  galleryType: 'home' | 'main';
  uploadDate: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  subcategory: string | null;
  image: string | null;
  isAvailable: number;
  isLunchOnly: number;
  createdAt: string;
  updatedAt: string;
}

export interface Reservation {
  id: number;
  name: string;
  email: string;
  phone: string;
  date: string;
  time: string;
  partySize: number;
  tablePreference: string | null;
  specialRequests: string | null;
  status: string;
  contacted: number;
  createdAt: string;
}

export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: string;
  createdAt: string;
}

export interface BusinessHours {
  id: number;
  dayOfWeek: number;
  openTime: string | null;
  closeTime: string | null;
  isClosed: number;
  note: string | null;
}

export interface DashboardStats {
  activeEvents: number;
  galleryImages: number;
  menuItems: number;
  pendingReservations: number;
  unreadMessages: number;
}

export interface ContentField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'rich' | 'url' | 'image' | 'number' | 'boolean';
  default?: string | boolean;
}

export interface ContentSection {
  id: string;
  title: string;
  fields: ContentField[];
}

export interface ContentSchema {
  schema: ContentSection[];
}

export interface ContentItem {
  key: string;
  value: string;
  type?: string;
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: 'super_admin' | 'admin' | 'editor';
  isActive?: number;
  last_login?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PageSection {
  type: 'text' | 'html';
  body: string;
}

export interface MediaItem {
  url: string;
  filename: string;
  size: number;
  modified: string;
  source: 'gallery' | 'uploads';
}

// ---- SEO-ops (Wave-2) ----
export interface SeoDashboardSummary {
  resources: number;
  indexable: number;
  openIssues: number;
  criticalIssues: number;
  lastRun: SeoAuditRun | null;
}

export interface SeoAuditRun {
  id: number;
  baseUrl: string;
  status: string;
  triggerType: string;
  startedAt: string;
  completedAt: string | null;
  totalUrls: number;
  issueCount: number;
  error: string | null;
}

export interface SeoIssue {
  id: number;
  runId: number | null;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  code: string;
  url: string;
  title: string;
  evidence: string | null;
  recommendation: string | null;
  status: string;
  owner: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SeoTaxonomyTerm {
  id: number;
  name: string;
  slug: string;
  termType: 'category' | 'tag' | 'collection' | 'topic';
  description: string | null;
  parentTermId: number | null;
  indexEligible: number;
  isActive: number;
}

export interface SeoDuplicateTermPair {
  termAId: number;
  termAName: string;
  termBId: number;
  termBName: string;
  termType: string;
  similarity: number;
  sharedWords: string[];
}

export interface SeoMasterEntity {
  id: number;
  entityTypes: string[];
  name: string;
  idSlug: string;
  description: string | null;
  properties: Record<string, unknown>;
  sameAs: string[];
}

export interface SeoEntity {
  id: number;
  entityType: 'Person' | 'Organization' | 'Place' | 'Service';
  name: string;
  description: string | null;
  sameAs: string | null;
  schemaType: string | null;
}

export interface SitemapValidationRun {
  id: number;
  checkedAt: string;
  checkedBy: string | null;
  overallValid: number;
  fileCount: number;
  validFileCount: number;
  files: { sitemapKey: string; url: string; httpStatus: number | null; wellFormed: number; urlCount: number; errors: string[] }[];
}

export interface RedirectImportPreviewRow {
  index: number;
  fromPath: string;
  toPath: string;
  statusCode: number;
  matchType: string;
  notes: string | null;
  valid: boolean;
  errors: string[];
}

export interface RedirectImportJob {
  id: number;
  status: string;
  preview: RedirectImportPreviewRow[];
  result: unknown;
  createdAt: string;
  createdBy: string | null;
}

export interface RedirectItem {
  id: number;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: number;
  matchType: 'exact' | 'prefix' | 'regex';
  notes: string | null;
  hitCount: number;
  lastHitAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLogItem {
  id: number;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  username: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AccessLogItem extends ActivityLogItem {
  route: string | null;
  method: string | null;
  statusCode: number | null;
  userAgent: string | null;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface Page {
  id: number;
  slug: string;
  title: string;
  description: string;
  content_sections: string; // JSON string of PageSection[]
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  og_image: string;
  json_ld: string;
  robots: string;
  status: 'draft' | 'published';
  faq_items: string; // JSON string of FaqItem[]
  created_at: string;
  updated_at: string;
  updated_by: string;
}

// API Methods
export const api = {
  // Stats
  async getStats(): Promise<DashboardStats> {
    const res = await fetch(`${API_URL}/api/stats`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch stats');
    return res.json();
  },

  // Events
  async getEvents(all = false, deleted = false): Promise<Event[]> {
    const params = new URLSearchParams();
    if (all) params.append('all', 'true');
    if (deleted) params.append('deleted', 'true');
    const qs = params.toString();
    const url = qs ? `${API_URL}/api/events?${qs}` : `${API_URL}/api/events`;
    const res = await fetch(url);
    if (!res.ok) throw apiError(res, 'Failed to fetch events');
    return res.json();
  },

  async createEvent(data: FormData): Promise<Event> {
    const res = await fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create event');
    return res.json();
  },

  async updateEvent(id: number, data: FormData): Promise<Event> {
    const res = await fetch(`${API_URL}/api/events/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to update event');
    return res.json();
  },

  async deleteEvent(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/events/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete event');
  },

  async restoreEvent(id: number): Promise<Event> {
    const res = await fetch(`${API_URL}/api/events/${id}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to restore event');
    return res.json();
  },

  // Gallery
  async getGallery(type?: string): Promise<GalleryImage[]> {
    const url = type ? `${API_URL}/api/gallery?type=${type}` : `${API_URL}/api/gallery`;
    const res = await fetch(url);
    if (!res.ok) throw apiError(res, 'Failed to fetch gallery');
    return res.json();
  },

  async uploadImage(data: FormData): Promise<GalleryImage> {
    const res = await fetch(`${API_URL}/api/gallery`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw apiError(res, 'Failed to upload image');
    return res.json();
  },

  async updateImage(id: number, data: Partial<GalleryImage>): Promise<GalleryImage> {
    const res = await fetch(`${API_URL}/api/gallery/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw apiError(res, 'Failed to update image');
    return res.json();
  },

  async reorderGallery(images: { id: number; position: number }[]): Promise<void> {
    const res = await fetch(`${API_URL}/api/gallery/reorder`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });
    if (!res.ok) throw apiError(res, 'Failed to reorder');
  },

  async deleteImage(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/gallery/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete image');
  },

  // Menu
  async getMenu(category?: string, all = false): Promise<MenuItem[]> {
    let url = `${API_URL}/api/menu`;
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (all) params.append('all', 'true');
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) throw apiError(res, 'Failed to fetch menu');
    return res.json();
  },

  async createMenuItem(data: FormData): Promise<MenuItem> {
    const res = await fetch(`${API_URL}/api/menu`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw apiError(res, 'Failed to create menu item');
    return res.json();
  },

  async updateMenuItem(id: number, data: FormData): Promise<MenuItem> {
    const res = await fetch(`${API_URL}/api/menu/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw apiError(res, 'Failed to update menu item');
    return res.json();
  },

  async deleteMenuItem(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/menu/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete menu item');
  },

  // Reservations
  async getReservations(status?: string): Promise<Reservation[]> {
    const url = status ? `${API_URL}/api/reservations?status=${status}` : `${API_URL}/api/reservations`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch reservations');
    return res.json();
  },

  async updateReservation(id: number, data: Partial<Reservation>): Promise<Reservation> {
    const res = await fetch(`${API_URL}/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw apiError(res, 'Failed to update reservation');
    return res.json();
  },

  async deleteReservation(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/reservations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete reservation');
  },

  // Contact
  async getContactSubmissions(status?: string): Promise<ContactSubmission[]> {
    const url = status ? `${API_URL}/api/contact?status=${status}` : `${API_URL}/api/contact`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch contact submissions');
    return res.json();
  },

  async updateContactSubmission(id: number, data: Partial<ContactSubmission>): Promise<ContactSubmission> {
    const res = await fetch(`${API_URL}/api/contact/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw apiError(res, 'Failed to update submission');
    return res.json();
  },

  async deleteContactSubmission(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/contact/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete submission');
  },

  // Hours
  async getHours(): Promise<BusinessHours[]> {
    const res = await fetch(`${API_URL}/api/hours`);
    if (!res.ok) throw apiError(res, 'Failed to fetch hours');
    return res.json();
  },

  async updateHours(hours: BusinessHours[]): Promise<BusinessHours[]> {
    const res = await fetch(`${API_URL}/api/hours`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours }),
    });
    if (!res.ok) throw apiError(res, 'Failed to update hours');
    return res.json();
  },

  // Content (CMS)
  async getContentSchema(): Promise<ContentSchema> {
    const res = await fetch(`${API_URL}/api/content/schema`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch content schema');
    return res.json();
  },

  async getContent(): Promise<ContentItem[]> {
    const res = await fetch(`${API_URL}/api/content`);
    if (!res.ok) throw apiError(res, 'Failed to fetch content');
    const data = await res.json();
    return Array.isArray(data) ? data : data.items || [];
  },

  async updateContent(items: ContentItem[]): Promise<void> {
    const res = await fetch(`${API_URL}/api/content`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw apiError(res, 'Failed to update content');
  },

  // Pages (CMS)
  async getPages(): Promise<Page[]> {
    const res = await fetch(`${API_URL}/api/pages`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch pages');
    return res.json();
  },

  async createPage(data: FormData): Promise<Page> {
    const res = await fetch(`${API_URL}/api/pages`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create page');
    return res.json();
  },

  async updatePage(id: number, data: FormData): Promise<Page> {
    const res = await fetch(`${API_URL}/api/pages/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to update page');
    return res.json();
  },

  async deletePage(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/pages/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete page');
  },

  // Media
  async getMediaList(): Promise<MediaItem[]> {
    const res = await fetch(`${API_URL}/api/media/list`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch media list');
    return res.json();
  },

  // Users
  async getUsers(): Promise<User[]> {
    const res = await fetch(`${API_URL}/api/users`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch users');
    return res.json();
  },

  async createUser(data: { email: string; username: string; role: string }): Promise<User> {
    const res = await fetch(`${API_URL}/api/users`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create user');
    return res.json();
  },

  async updateUser(id: number, data: Partial<{ username: string; email: string; role: string; isActive: boolean }>): Promise<User> {
    const res = await fetch(`${API_URL}/api/users/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to update user');
    return res.json();
  },

  async resendInvite(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/users/${id}/resend-invite`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to resend invite');
  },

  // Redirects
  async getRedirects(): Promise<RedirectItem[]> {
    const res = await fetch(`${API_URL}/api/redirects`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch redirects');
    return res.json();
  },

  async createRedirect(data: Partial<RedirectItem>): Promise<RedirectItem> {
    const res = await fetch(`${API_URL}/api/redirects`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create redirect');
    return res.json();
  },

  async updateRedirect(id: number, data: Partial<RedirectItem>): Promise<RedirectItem> {
    const res = await fetch(`${API_URL}/api/redirects/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to update redirect');
    return res.json();
  },

  async deleteRedirect(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/redirects/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw apiError(res, 'Failed to delete redirect');
  },

  // Activity / access log
  async getActivity(): Promise<ActivityLogItem[]> {
    const res = await fetch(`${API_URL}/api/activity`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch activity log');
    return res.json();
  },

  async getAccessLog(): Promise<AccessLogItem[]> {
    const res = await fetch(`${API_URL}/api/access-log`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch access log');
    return res.json();
  },

  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw apiError(res, (errBody as any).error || 'Login failed');
    }
    return res.json();
  },

  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_URL}/api/auth/reset-password-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw apiError(res, (errBody as any).error || 'Failed to request password reset');
    }
    return res.json();
  },

  async resetPassword(userId: number, token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, token, new_password: newPassword }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw apiError(res, (errBody as any).error || 'Failed to reset password');
    }
    return res.json();
  },

  async verifyAuth(): Promise<{ authenticated: boolean; user?: User }> {
    const res = await fetch(`${API_URL}/api/auth/verify`, { headers: getAuthHeaders() });
    if (!res.ok) return { authenticated: false };
    return res.json();
  },

  async logout(): Promise<void> {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  },

  // ---- SEO-ops (Wave-2) ----
  async getSeoSummary(): Promise<SeoDashboardSummary> {
    const res = await fetch(`${API_URL}/api/seo/summary`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch SEO summary');
    return res.json();
  },

  async getSeoCrawlStatus(): Promise<{ running: boolean; crawlRunId: number | null }> {
    const res = await fetch(`${API_URL}/api/seo/crawl/status`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch crawl status');
    return res.json();
  },

  async runSeoCrawl(options: { scopeType?: 'all' | 'prefix'; scopePrefix?: string } = {}): Promise<{ started: boolean }> {
    const res = await fetch(`${API_URL}/api/seo/crawl`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to start crawl');
    return res.json();
  },

  async cancelSeoCrawl(crawlRunId: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/seo/crawl/cancel`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ crawlRunId }),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to cancel crawl');
  },

  async getSeoAuditRuns(limit = 20): Promise<SeoAuditRun[]> {
    const res = await fetch(`${API_URL}/api/seo/runs?limit=${limit}`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch audit runs');
    return res.json();
  },

  async getSeoIssues(status: string = 'open', limit = 250): Promise<SeoIssue[]> {
    const res = await fetch(`${API_URL}/api/seo/issues?status=${status}&limit=${limit}`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch SEO issues');
    return res.json();
  },

  async updateSeoIssue(id: number, data: { status: string; owner?: string }): Promise<SeoIssue> {
    const res = await fetch(`${API_URL}/api/seo/issues/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to update issue');
    return res.json();
  },

  // robots.txt
  async getRobotsText(): Promise<string> {
    const res = await fetch(`${API_URL}/api/seo/robots`);
    if (!res.ok) throw apiError(res, 'Failed to fetch robots.txt');
    return res.text();
  },

  async saveRobotsText(robotsText: string): Promise<{ success: boolean }> {
    const res = await fetch(`${API_URL}/api/seo/robots`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ robotsText }),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to save robots.txt');
    return res.json();
  },

  async testRobotsPath(robotsText: string, userAgent: string, path: string): Promise<{ allowed: boolean; matchedRule: { directive: string; value: string } | null }> {
    const res = await fetch(`${API_URL}/api/seo/robots/test`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ robotsText, userAgent, path }),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to test robots.txt path');
    return res.json();
  },

  // Sitemap validation
  async getSitemapValidations(limit = 10): Promise<SitemapValidationRun[]> {
    const res = await fetch(`${API_URL}/api/seo/sitemap/validations?limit=${limit}`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch sitemap validation history');
    return res.json();
  },

  async runSitemapValidation(): Promise<SitemapValidationRun> {
    const res = await fetch(`${API_URL}/api/seo/sitemap/validate`, { method: 'POST', headers: getAuthHeaders() });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to validate sitemap');
    return res.json();
  },

  // Taxonomy
  async getTaxonomyTerms(): Promise<SeoTaxonomyTerm[]> {
    const res = await fetch(`${API_URL}/api/seo/taxonomy/terms`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch taxonomy terms');
    return res.json();
  },

  async getTaxonomyDuplicates(): Promise<SeoDuplicateTermPair[]> {
    const res = await fetch(`${API_URL}/api/seo/taxonomy/duplicates`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch duplicate terms');
    return res.json();
  },

  async createTaxonomyTerm(data: { name: string; termType: string; description?: string }): Promise<SeoTaxonomyTerm> {
    const res = await fetch(`${API_URL}/api/seo/taxonomy/terms`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create taxonomy term');
    return res.json();
  },

  // Master entities
  async getMasterEntities(): Promise<SeoMasterEntity[]> {
    const res = await fetch(`${API_URL}/api/seo/master-entities`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch master entities');
    return res.json();
  },

  async createMasterEntity(data: { entityTypes: string[]; name: string; description?: string }): Promise<SeoMasterEntity> {
    const res = await fetch(`${API_URL}/api/seo/master-entities`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create master entity');
    return res.json();
  },

  // Entities (content-level)
  async getSeoEntities(): Promise<SeoEntity[]> {
    const res = await fetch(`${API_URL}/api/seo/entities`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to fetch entities');
    return res.json();
  },

  async createSeoEntity(data: { entityType: string; name: string; description?: string }): Promise<SeoEntity> {
    const res = await fetch(`${API_URL}/api/seo/entities`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to create entity');
    return res.json();
  },

  // Redirects CSV import
  async previewRedirectImport(records: Record<string, string>[]): Promise<RedirectImportJob> {
    const res = await fetch(`${API_URL}/api/redirects/import/preview`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to preview redirect import');
    return res.json();
  },

  async applyRedirectImport(id: number): Promise<RedirectImportJob> {
    const res = await fetch(`${API_URL}/api/redirects/import/${id}/apply`, { method: 'POST', headers: getAuthHeaders() });
    if (!res.ok) throw await apiErrorWithBody(res, 'Failed to apply redirect import');
    return res.json();
  },

  // GET /api/redirects/export.csv requires requireAuth (session token or
  // ADMIN_API_KEY), so a plain <a href> link would 401 for a session-token
  // user (browsers don't attach the x-auth-key header to a navigation) —
  // fetch with auth headers and hand back a Blob for the caller to turn
  // into an object URL, matching AdminRedirects.tsx's existing
  // handleExportCsv() client-side-blob-download pattern for the plain
  // (non-CSV-import) redirect export it already has.
  async exportRedirectsCsv(): Promise<Blob> {
    const res = await fetch(`${API_URL}/api/redirects/export.csv`, { headers: getAuthHeaders() });
    if (!res.ok) throw apiError(res, 'Failed to export redirects');
    return res.blob();
  },
};

export const getImageUrl = (path: string) => `${API_URL}${path}`;
export { API_URL };
