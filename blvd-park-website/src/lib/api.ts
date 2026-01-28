const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3001';

const getAuthHeaders = (): HeadersInit => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('blvd-auth-token');
  return token ? { 'x-auth-key': token } : {};
};

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

export interface PrivateEvent {
  id: number;
  name: string;
  email: string;
  phone: string;
  company: string | null;
  eventType: string;
  preferredDate: string | null;
  guestCount: number | null;
  budget: string | null;
  details: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
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
  newPrivateEvents: number;
  unreadMessages: number;
}

// API Methods
export const api = {
  // Auth
  async verifyAuth(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${API_URL}/api/health`, {
        headers: { 'x-auth-key': apiKey },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Stats
  async getStats(): Promise<DashboardStats> {
    const res = await fetch(`${API_URL}/api/stats`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  // Events
  async getEvents(all = false): Promise<Event[]> {
    const url = all ? `${API_URL}/api/events?all=true` : `${API_URL}/api/events`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch events');
    return res.json();
  },

  async createEvent(data: FormData): Promise<Event> {
    const res = await fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw new Error('Failed to create event');
    return res.json();
  },

  async updateEvent(id: number, data: FormData): Promise<Event> {
    const res = await fetch(`${API_URL}/api/events/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update event');
    return res.json();
  },

  async deleteEvent(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/events/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete event');
  },

  // Gallery
  async getGallery(type?: string): Promise<GalleryImage[]> {
    const url = type ? `${API_URL}/api/gallery?type=${type}` : `${API_URL}/api/gallery`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch gallery');
    return res.json();
  },

  async uploadImage(data: FormData): Promise<GalleryImage> {
    const res = await fetch(`${API_URL}/api/gallery`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw new Error('Failed to upload image');
    return res.json();
  },

  async updateImage(id: number, data: Partial<GalleryImage>): Promise<GalleryImage> {
    const res = await fetch(`${API_URL}/api/gallery/${id}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update image');
    return res.json();
  },

  async reorderGallery(images: { id: number; position: number }[]): Promise<void> {
    const res = await fetch(`${API_URL}/api/gallery/reorder`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });
    if (!res.ok) throw new Error('Failed to reorder');
  },

  async deleteImage(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/gallery/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete image');
  },

  // Menu
  async getMenu(category?: string, all = false): Promise<MenuItem[]> {
    let url = `${API_URL}/api/menu`;
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (all) params.append('all', 'true');
    if (params.toString()) url += `?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch menu');
    return res.json();
  },

  async createMenuItem(data: FormData): Promise<MenuItem> {
    const res = await fetch(`${API_URL}/api/menu`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw new Error('Failed to create menu item');
    return res.json();
  },

  async updateMenuItem(id: number, data: FormData): Promise<MenuItem> {
    const res = await fetch(`${API_URL}/api/menu/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: data,
    });
    if (!res.ok) throw new Error('Failed to update menu item');
    return res.json();
  },

  async deleteMenuItem(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/menu/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete menu item');
  },

  // Reservations
  async getReservations(status?: string): Promise<Reservation[]> {
    const url = status ? `${API_URL}/api/reservations?status=${status}` : `${API_URL}/api/reservations`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch reservations');
    return res.json();
  },

  async updateReservation(id: number, data: Partial<Reservation>): Promise<Reservation> {
    const res = await fetch(`${API_URL}/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update reservation');
    return res.json();
  },

  async deleteReservation(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/reservations/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete reservation');
  },

  // Private Events
  async getPrivateEvents(status?: string): Promise<PrivateEvent[]> {
    const url = status ? `${API_URL}/api/private-events?status=${status}` : `${API_URL}/api/private-events`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch private events');
    return res.json();
  },

  async updatePrivateEvent(id: number, data: Partial<PrivateEvent>): Promise<PrivateEvent> {
    const res = await fetch(`${API_URL}/api/private-events/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update private event');
    return res.json();
  },

  async deletePrivateEvent(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/private-events/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete private event');
  },

  // Contact
  async getContactSubmissions(status?: string): Promise<ContactSubmission[]> {
    const url = status ? `${API_URL}/api/contact?status=${status}` : `${API_URL}/api/contact`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch contact submissions');
    return res.json();
  },

  async updateContactSubmission(id: number, data: Partial<ContactSubmission>): Promise<ContactSubmission> {
    const res = await fetch(`${API_URL}/api/contact/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update submission');
    return res.json();
  },

  async deleteContactSubmission(id: number): Promise<void> {
    const res = await fetch(`${API_URL}/api/contact/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error('Failed to delete submission');
  },

  // Hours
  async getHours(): Promise<BusinessHours[]> {
    const res = await fetch(`${API_URL}/api/hours`);
    if (!res.ok) throw new Error('Failed to fetch hours');
    return res.json();
  },

  async updateHours(hours: BusinessHours[]): Promise<BusinessHours[]> {
    const res = await fetch(`${API_URL}/api/hours`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours }),
    });
    if (!res.ok) throw new Error('Failed to update hours');
    return res.json();
  },
};

export const getImageUrl = (path: string) => `${API_URL}${path}`;
export { API_URL };
