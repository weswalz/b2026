# BLVD Park Admin System Guide

## Architecture Overview

```
blvdpark/
├── src/
│   ├── components/
│   │   └── admin/
│   │       ├── AdminLayout.tsx
│   │       ├── AdminSidebar.tsx
│   │       ├── AdminEvents.tsx
│   │       ├── AdminGallery.tsx
│   │       ├── AdminMenu.tsx
│   │       ├── AdminReservations.tsx
│   │       ├── AdminPrivateEvents.tsx
│   │       ├── AdminContactForms.tsx
│   │       └── AdminHours.tsx
│   ├── pages/
│   │   └── admin/
│   │       ├── index.astro
│   │       ├── login.astro
│   │       ├── events.astro
│   │       ├── gallery.astro
│   │       ├── menu.astro
│   │       ├── reservations.astro
│   │       ├── private-events.astro
│   │       ├── contact.astro
│   │       └── hours.astro
│   └── lib/
│       ├── api.ts
│       └── authStore.ts
├── backend/
│   ├── server.js
│   ├── database/
│   │   └── blvdpark.db
│   └── .env
└── public/
    └── uploads/
```

---

## 1. Database Schema

```javascript
// backend/init-db.js
const Database = require('better-sqlite3');
const db = new Database('./database/blvdpark.db');

db.exec(`
  -- Events (steak nights, watch parties, specials)
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'special',
    image TEXT,
    ticketUrl TEXT,
    status TEXT DEFAULT 'active',
    isRecurring INTEGER DEFAULT 0,
    recurringPattern TEXT,
    recurringEndDate TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Gallery
  CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    alt TEXT NOT NULL,
    category TEXT DEFAULT 'venue',
    position INTEGER,
    galleryType TEXT DEFAULT 'main',
    uploadDate DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Menu items (food + drinks)
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    image TEXT,
    isAvailable INTEGER DEFAULT 1,
    isLunchOnly INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- VIP Table Reservations
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    partySize INTEGER NOT NULL,
    tablePreference TEXT,
    specialRequests TEXT,
    status TEXT DEFAULT 'pending',
    contacted INTEGER DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Private Event Inquiries
  CREATE TABLE IF NOT EXISTS private_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    company TEXT,
    eventType TEXT NOT NULL,
    preferredDate TEXT,
    guestCount INTEGER,
    budget TEXT,
    details TEXT,
    status TEXT DEFAULT 'new',
    notes TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- General Contact Form
  CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'unread',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Business Hours
  CREATE TABLE IF NOT EXISTS business_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dayOfWeek INTEGER NOT NULL UNIQUE,
    openTime TEXT,
    closeTime TEXT,
    isClosed INTEGER DEFAULT 0,
    note TEXT
  );

  -- Sessions for auth
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId TEXT UNIQUE NOT NULL,
    refreshTokenHash TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME NOT NULL
  );
`);

// Seed default hours
const insertHours = db.prepare(`
  INSERT OR IGNORE INTO business_hours (dayOfWeek, openTime, closeTime, isClosed)
  VALUES (?, ?, ?, ?)
`);

const defaultHours = [
  [0, '11:00', '22:00', 0],  // Sunday
  [1, '11:00', '22:00', 0],  // Monday
  [2, '11:00', '22:00', 0],  // Tuesday
  [3, '11:00', '22:00', 0],  // Wednesday
  [4, '11:00', '23:00', 0],  // Thursday
  [5, '11:00', '00:00', 0],  // Friday
  [6, '11:00', '00:00', 0],  // Saturday
];

defaultHours.forEach(h => insertHours.run(...h));

console.log('Database initialized');
db.close();
```

---

## 2. Backend Server

```javascript
// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const app = express();
const db = new Database('./database/blvdpark.db');
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4321',
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Multer config
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../public/uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// Auth middleware
const requireAuth = (req, res, next) => {
  const apiKey = req.headers['x-auth-key'];
  const authHeader = req.headers.authorization;

  if (apiKey === process.env.ADMIN_API_KEY) return next();
  if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === process.env.ADMIN_API_KEY) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
};

// ============== HEALTH ==============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============== EVENTS ==============
app.get('/api/events', (req, res) => {
  try {
    const events = db.prepare(`
      SELECT * FROM events
      WHERE status = 'active'
      ORDER BY date ASC, time ASC
    `).all();
    res.json(events);
  } catch (err) {
    console.error('Events fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.get('/api/events/:id', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

app.post('/api/events', requireAuth, upload.single('image'), (req, res) => {
  const { title, date, time, description, category, ticketUrl, isRecurring, recurringPattern, recurringEndDate } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = db.prepare(`
      INSERT INTO events (title, date, time, description, category, image, ticketUrl, isRecurring, recurringPattern, recurringEndDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, date, time, description, category || 'special', image, ticketUrl, isRecurring ? 1 : 0, recurringPattern, recurringEndDate);

    res.json({ id: result.lastInsertRowid, title, date, time, description, category, image, ticketUrl });
  } catch (err) {
    console.error('Event create error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

app.put('/api/events/:id', requireAuth, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { title, date, time, description, category, ticketUrl, status, isRecurring, recurringPattern, recurringEndDate } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    const existing = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    db.prepare(`
      UPDATE events SET
        title = COALESCE(?, title),
        date = COALESCE(?, date),
        time = COALESCE(?, time),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        image = COALESCE(?, image),
        ticketUrl = COALESCE(?, ticketUrl),
        status = COALESCE(?, status),
        isRecurring = COALESCE(?, isRecurring),
        recurringPattern = COALESCE(?, recurringPattern),
        recurringEndDate = COALESCE(?, recurringEndDate),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, date, time, description, category, image, ticketUrl, status, isRecurring ? 1 : 0, recurringPattern, recurringEndDate, id);

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    console.error('Event update error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// ============== GALLERY ==============
app.get('/api/gallery', (req, res) => {
  const { type, category } = req.query;
  let query = 'SELECT * FROM gallery_images WHERE 1=1';
  const params = [];

  if (type) {
    query += ' AND galleryType = ?';
    params.push(type);
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  query += ' ORDER BY position ASC, uploadDate DESC';

  try {
    const images = db.prepare(query).all(...params);
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

app.post('/api/gallery', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const { alt = 'Gallery image', category = 'venue', galleryType = 'main' } = req.body;
  const url = `/uploads/${req.file.filename}`;

  const maxPos = db.prepare('SELECT MAX(position) as max FROM gallery_images').get();
  const position = (maxPos?.max || 0) + 1;

  try {
    const result = db.prepare(`
      INSERT INTO gallery_images (url, alt, category, position, galleryType)
      VALUES (?, ?, ?, ?, ?)
    `).run(url, alt, category, position, galleryType);

    res.json({ id: result.lastInsertRowid, url, alt, category, position, galleryType });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save image' });
  }
});

app.put('/api/gallery/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { alt, category, galleryType } = req.body;

  try {
    db.prepare(`
      UPDATE gallery_images SET
        alt = COALESCE(?, alt),
        category = COALESCE(?, category),
        galleryType = COALESCE(?, galleryType)
      WHERE id = ?
    `).run(alt, category, galleryType, id);

    const updated = db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update image' });
  }
});

app.put('/api/gallery/reorder', requireAuth, (req, res) => {
  const { images } = req.body;

  try {
    const stmt = db.prepare('UPDATE gallery_images SET position = ? WHERE id = ?');
    const updateMany = db.transaction((items) => {
      for (const item of items) stmt.run(item.position, item.id);
    });
    updateMany(images);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

app.delete('/api/gallery/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM gallery_images WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ============== MENU ==============
app.get('/api/menu', (req, res) => {
  const { category, lunchOnly } = req.query;
  let query = 'SELECT * FROM menu_items WHERE isAvailable = 1';
  const params = [];

  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  if (lunchOnly === 'true') {
    query += ' AND isLunchOnly = 1';
  }

  query += ' ORDER BY category, subcategory, name';

  try {
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

app.post('/api/menu', requireAuth, upload.single('image'), (req, res) => {
  const { name, description, price, category, subcategory, isLunchOnly } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const result = db.prepare(`
      INSERT INTO menu_items (name, description, price, category, subcategory, image, isLunchOnly)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, description, parseFloat(price), category, subcategory, image, isLunchOnly ? 1 : 0);

    res.json({ id: result.lastInsertRowid, name, description, price, category, subcategory, image });
  } catch (err) {
    console.error('Menu create error:', err);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

app.put('/api/menu/:id', requireAuth, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, price, category, subcategory, isAvailable, isLunchOnly } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : undefined;

  try {
    db.prepare(`
      UPDATE menu_items SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        price = COALESCE(?, price),
        category = COALESCE(?, category),
        subcategory = COALESCE(?, subcategory),
        image = COALESCE(?, image),
        isAvailable = COALESCE(?, isAvailable),
        isLunchOnly = COALESCE(?, isLunchOnly),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, description, price ? parseFloat(price) : undefined, category, subcategory, image,
           isAvailable !== undefined ? (isAvailable ? 1 : 0) : undefined,
           isLunchOnly !== undefined ? (isLunchOnly ? 1 : 0) : undefined, id);

    const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

app.delete('/api/menu/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ============== RESERVATIONS ==============
app.get('/api/reservations', requireAuth, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM reservations';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY date DESC, time DESC';

  try {
    const reservations = db.prepare(query).all(...params);
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reservations' });
  }
});

app.post('/api/reservations', (req, res) => {
  const { name, email, phone, date, time, partySize, tablePreference, specialRequests } = req.body;

  if (!name || !email || !phone || !date || !time || !partySize) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO reservations (name, email, phone, date, time, partySize, tablePreference, specialRequests)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email, phone, date, time, parseInt(partySize), tablePreference, specialRequests);

    res.json({ id: result.lastInsertRowid, message: 'Reservation submitted successfully' });
  } catch (err) {
    console.error('Reservation error:', err);
    res.status(500).json({ error: 'Failed to submit reservation' });
  }
});

app.patch('/api/reservations/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status, contacted } = req.body;

  try {
    db.prepare(`
      UPDATE reservations SET
        status = COALESCE(?, status),
        contacted = COALESCE(?, contacted)
      WHERE id = ?
    `).run(status, contacted !== undefined ? (contacted ? 1 : 0) : undefined, id);

    const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

app.delete('/api/reservations/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reservation' });
  }
});

// ============== PRIVATE EVENTS ==============
app.get('/api/private-events', requireAuth, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM private_events';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY createdAt DESC';

  try {
    const events = db.prepare(query).all(...params);
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch private events' });
  }
});

app.post('/api/private-events', (req, res) => {
  const { name, email, phone, company, eventType, preferredDate, guestCount, budget, details } = req.body;

  if (!name || !email || !phone || !eventType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO private_events (name, email, phone, company, eventType, preferredDate, guestCount, budget, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email, phone, company, eventType, preferredDate, guestCount ? parseInt(guestCount) : null, budget, details);

    res.json({ id: result.lastInsertRowid, message: 'Inquiry submitted successfully' });
  } catch (err) {
    console.error('Private event error:', err);
    res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

app.patch('/api/private-events/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  try {
    db.prepare(`
      UPDATE private_events SET
        status = COALESCE(?, status),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(status, notes, id);

    const updated = db.prepare('SELECT * FROM private_events WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update private event' });
  }
});

app.delete('/api/private-events/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM private_events WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete private event' });
  }
});

// ============== CONTACT FORMS ==============
app.get('/api/contact', requireAuth, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM contact_submissions';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY createdAt DESC';

  try {
    const submissions = db.prepare(query).all(...params);
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contact submissions' });
  }
});

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO contact_submissions (name, email, subject, message)
      VALUES (?, ?, ?, ?)
    `).run(name, email, subject, message);

    res.json({ id: result.lastInsertRowid, message: 'Message sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit message' });
  }
});

app.patch('/api/contact/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    db.prepare('UPDATE contact_submissions SET status = ? WHERE id = ?').run(status, id);
    const updated = db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

app.delete('/api/contact/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete submission' });
  }
});

// ============== BUSINESS HOURS ==============
app.get('/api/hours', (req, res) => {
  try {
    const hours = db.prepare('SELECT * FROM business_hours ORDER BY dayOfWeek').all();
    res.json(hours);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch hours' });
  }
});

app.put('/api/hours', requireAuth, (req, res) => {
  const { hours } = req.body;

  try {
    const stmt = db.prepare(`
      UPDATE business_hours SET
        openTime = ?,
        closeTime = ?,
        isClosed = ?,
        note = ?
      WHERE dayOfWeek = ?
    `);

    const updateMany = db.transaction((items) => {
      for (const h of items) {
        stmt.run(h.openTime, h.closeTime, h.isClosed ? 1 : 0, h.note, h.dayOfWeek);
      }
    });
    updateMany(hours);

    const updated = db.prepare('SELECT * FROM business_hours ORDER BY dayOfWeek').all();
    res.json(updated);
  } catch (err) {
    console.error('Hours update error:', err);
    res.status(500).json({ error: 'Failed to update hours' });
  }
});

app.listen(PORT, () => {
  console.log(`BLVD Park API running on port ${PORT}`);
});
```

**backend/.env**
```
PORT=3001
ADMIN_API_KEY=your-secret-key-here
FRONTEND_URL=http://localhost:4321
```

---

## 3. API Client

```typescript
// src/lib/api.ts
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
}

export interface GalleryImage {
  id: number;
  url: string;
  alt: string;
  category: string;
  position: number;
  galleryType: 'home' | 'main';
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

// API Methods
export const api = {
  // Events
  async getEvents(): Promise<Event[]> {
    const res = await fetch(`${API_URL}/api/events`);
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
  async getMenu(category?: string): Promise<MenuItem[]> {
    const url = category ? `${API_URL}/api/menu?category=${category}` : `${API_URL}/api/menu`;
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
```

---

## 4. Dependencies

```bash
# Frontend
npm install @tanstack/react-query @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# Backend
cd backend && npm install express better-sqlite3 multer cors dotenv uuid
```

**.env (frontend)**
```
PUBLIC_API_URL=http://localhost:3001
```

---

## 5. Admin Pages Summary

| Page | Route | Features |
|------|-------|----------|
| Dashboard | `/admin` | Stats, upcoming events, recent activity |
| Events | `/admin/events` | CRUD, recurring, categories, images |
| Gallery | `/admin/gallery` | Upload, drag reorder, categories, home/main toggle |
| Menu | `/admin/menu` | CRUD, categories, lunch-only, availability |
| Reservations | `/admin/reservations` | Status workflow, contact tracking |
| Private Events | `/admin/private-events` | Inquiry pipeline, notes, status |
| Contact | `/admin/contact` | Unread tracking, reply links |
| Hours | `/admin/hours` | Day-by-day editing, preview |

---

## 6. Running

```bash
# Terminal 1 - Backend
cd backend
node init-db.js  # First time
node server.js

# Terminal 2 - Frontend
npm run dev
```

Access admin at `http://localhost:4321/admin`
