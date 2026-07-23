const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const { initDatabase } = require('./init-db');
const { contentSchema, buildDefaultContent } = require('./content-schema');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const ssoRoutes = require('./routes/sso');

const app = express();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'blvdpark.db');
if (process.env.RESET_DB === 'true' && fs.existsSync(dbPath)) {
  fs.rmSync(dbPath, { force: true });
}
initDatabase(dbPath);
const db = new Database(dbPath);
const PORT = process.env.PORT || 3001;

// Expose db on app.locals for route modules (SSO, etc.)
app.locals.db = db;

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Ensure CMS table exists and seed defaults
const ensureContentSchema = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const seedDefaultContent = () => {
  const insert = db.prepare('INSERT OR IGNORE INTO site_content (key, value, type) VALUES (?, ?, ?)');
  contentSchema.forEach((section) => {
    section.fields.forEach((field) => {
      const rawValue = field.default ?? '';
      const value = typeof rawValue === 'string' ? rawValue : String(rawValue);
      insert.run(field.key, value, field.type || 'text');
    });
  });
};

ensureContentSchema();
seedDefaultContent();

const ensureContactPhoneColumn = () => {
  try {
    const columns = db.prepare("PRAGMA table_info(contact_submissions)").all();
    const hasPhone = columns.some((col) => col.name === 'phone');
    if (!hasPhone) {
      db.exec('ALTER TABLE contact_submissions ADD COLUMN phone TEXT');
    }
  } catch (err) {
    console.warn('Contact phone column check failed:', err);
  }
};

ensureContactPhoneColumn();

// Middleware
const allowedOrigins = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:4321,https://blvdpark.com,https://www.blvdpark.com')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadsDir));

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Handled by nginx/Cloudflare
  crossOriginEmbedderPolicy: false
}));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Too many submissions, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Realtime (SSE) subscribers
const sseClients = new Set();
const broadcast = (type, payload = {}) => {
  const data = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
  for (const res of sseClients) {
    res.write(`event: update\n`);
    res.write(`data: ${data}\n\n`);
  }
};

// Multer config
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype.startsWith('image/') && allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'), false);
    }
  }
});

// Input validation helpers
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const sanitize = (str, maxLen = 1000) => {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
};

// Auth middleware — checks API key OR valid session token, attaches user to req
const requireAuth = (req, res, next) => {
  const token = req.headers['x-auth-key']
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // API key grants super_admin access
  if (token === process.env.ADMIN_API_KEY) {
    req.user = { role: 'super_admin' };
    return next();
  }

  // Session token lookup
  try {
    const session = db.prepare(`
      SELECT u.id as user_id, u.email, u.username, u.role
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);

    if (session) {
      req.user = { id: session.user_id, email: session.email, username: session.username, role: session.role };
      return next();
    }
  } catch (err) {
    console.error('Session verification error:', err);
  }

  res.status(401).json({ error: 'Unauthorized' });
};

// ============== SSO ==============
app.use('/api/sso', ssoRoutes);

// ============== HEALTH ==============
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Realtime stream
app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write('retry: 5000\n\n');
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ============== CONTENT SCHEMA ==============
app.get('/api/content/schema', requireAuth, (req, res) => {
  res.json({ schema: contentSchema });
});

// ============== CONTENT ==============
app.get('/api/content', (req, res) => {
  try {
    const items = db.prepare('SELECT key, value, type FROM site_content ORDER BY key').all();
    res.json({ items });
  } catch (err) {
    console.error('Content fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

app.get('/api/content/:key', (req, res) => {
  try {
    const item = db.prepare('SELECT key, value, type FROM site_content WHERE key = ?').get(req.params.key);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

app.put('/api/content', requireAuth, (req, res) => {
  const { items, content } = req.body || {};
  const updates = Array.isArray(items)
    ? items
    : content && typeof content === 'object'
      ? Object.entries(content).map(([key, value]) => ({ key, value }))
      : [];

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'No content updates provided' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO site_content (key, value, type, updatedAt)
      VALUES (?, ?, COALESCE(?, 'text'), CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        type = excluded.type,
        updatedAt = CURRENT_TIMESTAMP
    `);

    const tx = db.transaction((rows) => {
      rows.forEach((row) => {
        if (!row || !row.key) return;
        const value = row.value === undefined || row.value === null ? '' : String(row.value);
        stmt.run(row.key, value, row.type);
      });
    });
    tx(updates);

    broadcast('content');
    res.json({ success: true, updated: updates.length });
  } catch (err) {
    console.error('Content update error:', err);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// ============== PAGES (CMS) ==============
const { validatePagePayload } = require('./lib/pages-validate');
const { sanitizeCmsHtml } = require('./lib/cms-sanitize');

// Defense-in-depth: html sections are sanitized on save AND re-sanitized on public read
const sanitizePageForPublic = (page) => {
  let sections = [];
  try { sections = JSON.parse(page.content_sections || '[]'); } catch (_e) {}
  sections = sections.map((s) => (s && s.type === 'html' ? { ...s, body: sanitizeCmsHtml(s.body) } : s));
  return { ...page, content_sections: JSON.stringify(sections) };
};

app.get('/api/pages/public-list', (req, res) => {
  try {
    const rows = db.prepare("SELECT slug, updated_at, robots FROM pages WHERE status = 'published' ORDER BY slug").all();
    res.json(rows);
  } catch (err) {
    console.error('Pages public-list error:', err);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

app.get('/api/pages/public/:slug', (req, res) => {
  try {
    const page = db.prepare("SELECT * FROM pages WHERE slug = ? AND status = 'published'").get(req.params.slug);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(sanitizePageForPublic(page));
  } catch (err) {
    console.error('Page public fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

app.get('/api/pages', requireAuth, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM pages ORDER BY updated_at DESC').all());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

app.get('/api/pages/:id', requireAuth, (req, res) => {
  try {
    const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch page' });
  }
});

app.post('/api/pages', requireAuth, upload.single('og_image_file'), (req, res) => {
  const result = validatePagePayload(req.body || {});
  if (!result.ok) {
    if (req.file) { try { fs.unlinkSync(path.join(uploadsDir, req.file.filename)); } catch (_e) {} }
    return res.status(400).json({ error: 'Validation failed', details: result.errors });
  }
  const page = result.page;
  if (req.file) page.og_image = `/uploads/${req.file.filename}`;
  try {
    const info = db.prepare(`
      INSERT INTO pages (slug, title, description, content_sections, seo_title, seo_description, seo_keywords, og_image, json_ld, robots, status, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(page.slug, page.title, page.description, page.content_sections, page.seo_title, page.seo_description, page.seo_keywords, page.og_image, page.json_ld, page.robots, page.status, req.user?.email || req.user?.username || 'api-key');
    const created = db.prepare('SELECT * FROM pages WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(created);
    broadcast('pages');
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Slug already exists' });
    }
    console.error('Page create error:', err);
    res.status(500).json({ error: 'Failed to create page' });
  }
});

app.put('/api/pages/:id', requireAuth, upload.single('og_image_file'), (req, res) => {
  const existing = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Page not found' });
  const result = validatePagePayload(req.body || {});
  if (!result.ok) {
    if (req.file) { try { fs.unlinkSync(path.join(uploadsDir, req.file.filename)); } catch (_e) {} }
    return res.status(400).json({ error: 'Validation failed', details: result.errors });
  }
  const page = result.page;
  if (req.file) page.og_image = `/uploads/${req.file.filename}`;
  try {
    db.prepare(`
      UPDATE pages SET slug = ?, title = ?, description = ?, content_sections = ?, seo_title = ?, seo_description = ?, seo_keywords = ?, og_image = ?, json_ld = ?, robots = ?, status = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
      WHERE id = ?
    `).run(page.slug, page.title, page.description, page.content_sections, page.seo_title, page.seo_description, page.seo_keywords, page.og_image, page.json_ld, page.robots, page.status, req.user?.email || req.user?.username || 'api-key', req.params.id);
    res.json(db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id));
    broadcast('pages');
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'Slug already exists' });
    }
    console.error('Page update error:', err);
    res.status(500).json({ error: 'Failed to update page' });
  }
});

app.delete('/api/pages/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);
    res.json({ success: true });
    broadcast('pages');
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// ============== DASHBOARD STATS ==============
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const events = db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'active'").get();
    const gallery = db.prepare('SELECT COUNT(*) as count FROM gallery_images').get();
    const menu = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE isAvailable = 1').get();
    const reservations = db.prepare("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending'").get();
    const contact = db.prepare("SELECT COUNT(*) as count FROM contact_submissions WHERE status = 'unread'").get();

    res.json({
      activeEvents: events.count,
      galleryImages: gallery.count,
      menuItems: menu.count,
      pendingReservations: reservations.count,
      unreadMessages: contact.count
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============== EVENTS ==============
app.get('/api/events', (req, res) => {
  const { all } = req.query;
  try {
    let query = 'SELECT * FROM events';
    if (all !== 'true') {
      // Only show active events that are today or in the future (recurring events always show)
      query += " WHERE status = 'active' AND (isRecurring = 1 OR date >= date('now'))";
    }
    query += ' ORDER BY date ASC, time ASC';
    const events = db.prepare(query).all();
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
    if (title && date) {
      const existing = db.prepare(
        `SELECT id FROM events
         WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))
           AND date = ?
           AND status = 'active'
         LIMIT 1`
      ).get(title, date);
      if (existing) {
        if (req.file) {
          try { fs.unlinkSync(path.join(uploadsDir, req.file.filename)); } catch (_e) {}
        }
        return res.status(409).json({
          error: 'Duplicate event',
          message: `An event titled "${title}" already exists on ${date}. Edit the existing event instead of creating a new one.`,
          existingId: existing.id
        });
      }
    }

    const result = db.prepare(`
      INSERT INTO events (title, date, time, description, category, image, ticketUrl, isRecurring, recurringPattern, recurringEndDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, date, time, description, category || 'special', image, ticketUrl, isRecurring ? 1 : 0, recurringPattern, recurringEndDate);

    const payload = { id: result.lastInsertRowid, title, date, time, description, category, image, ticketUrl };
    res.json(payload);
    broadcast('events');
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
    broadcast('events');
  } catch (err) {
    console.error('Event update error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

app.delete('/api/events/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ success: true });
    broadcast('events');
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
    broadcast('gallery');
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
    broadcast('gallery');
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
    broadcast('gallery');
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

app.delete('/api/gallery/:id', requireAuth, (req, res) => {
  try {
    const image = db.prepare('SELECT url FROM gallery_images WHERE id = ?').get(req.params.id);
    if (image) {
      const filePath = path.join(uploadsDir, path.basename(image.url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM gallery_images WHERE id = ?').run(req.params.id);
    res.json({ success: true });
    broadcast('gallery');
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ============== MENU ==============
app.get('/api/menu', (req, res) => {
  const { category, lunchOnly, all } = req.query;
  let query = 'SELECT * FROM menu_items';
  const params = [];
  const conditions = [];

  if (all !== 'true') {
    conditions.push('isAvailable = 1');
  }
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (lunchOnly === 'true') {
    conditions.push('isLunchOnly = 1');
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
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
    broadcast('menu');
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
           isAvailable !== undefined ? (isAvailable === 'true' || isAvailable === true ? 1 : 0) : undefined,
           isLunchOnly !== undefined ? (isLunchOnly === 'true' || isLunchOnly === true ? 1 : 0) : undefined, id);

    const updated = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
    res.json(updated);
    broadcast('menu');
  } catch (err) {
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

app.delete('/api/menu/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
    broadcast('menu');
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

app.post('/api/reservations', formLimiter, (req, res) => {
  const name = sanitize(req.body.name, 200);
  const email = sanitize(req.body.email, 200);
  const phone = sanitize(req.body.phone, 30);
  const date = sanitize(req.body.date, 20);
  const time = sanitize(req.body.time, 20);
  const partySize = req.body.partySize;
  const tablePreference = sanitize(req.body.tablePreference, 200);
  const specialRequests = sanitize(req.body.specialRequests, 2000);

  if (!name || !email || !phone || !date || !time || !partySize) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO reservations (name, email, phone, date, time, partySize, tablePreference, specialRequests)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email, phone, date, time, parseInt(partySize), tablePreference, specialRequests);

    res.json({ id: result.lastInsertRowid, message: 'Reservation submitted successfully' });
    broadcast('reservations');
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
    broadcast('reservations');
  } catch (err) {
    res.status(500).json({ error: 'Failed to update reservation' });
  }
});

app.delete('/api/reservations/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
    res.json({ success: true });
    broadcast('reservations');
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete reservation' });
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

app.post('/api/contact', formLimiter, (req, res) => {
  const name = sanitize(req.body.name, 200);
  const email = sanitize(req.body.email, 200);
  const phone = sanitize(req.body.phone, 30);
  const subject = sanitize(req.body.subject, 300);
  const message = sanitize(req.body.message, 5000);

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO contact_submissions (name, email, phone, subject, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email, phone || null, subject, message);

    res.json({ id: result.lastInsertRowid, message: 'Message sent successfully' });
    broadcast('contact');
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
    broadcast('contact');
  } catch (err) {
    res.status(500).json({ error: 'Failed to update submission' });
  }
});

app.delete('/api/contact/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(req.params.id);
    res.json({ success: true });
    broadcast('contact');
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
    broadcast('hours');
  } catch (err) {
    console.error('Hours update error:', err);
    res.status(500).json({ error: 'Failed to update hours' });
  }
});

const { sendEmail, buildPasswordResetEmail } = require('./email');
const crypto = require('crypto');
const argon2 = require('argon2');

// ============== AUTHENTICATION ==============
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)
    `).run(sessionToken, user.id, expiresAt);

    db.prepare(`
      UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?
    `).run(user.id);

    res.json({
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/reset-password-request', authLimiter, async (req, res) => {
  const { email } = req.body;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.json({ success: true, message: 'If an account exists, a reset link has been sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE users SET password_reset_token = ?, password_reset_expires = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(resetToken, resetExpires, user.id);

    const frontendUrl = process.env.FRONTEND_URL || 'https://blvdpark.com';
    const resetLink = `${frontendUrl}/admin/reset-password?token=${resetToken}&user_id=${user.id}`;

    await sendEmail({
      to: email,
      ...buildPasswordResetEmail({ username: user.username, resetLink, expiresIn: '1 hour' })
    });

    res.json({ success: true, message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    console.error('Password reset request error:', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { user_id, token, new_password } = req.body;

  try {
    const user = db.prepare(`
      SELECT * FROM users WHERE id = ? AND password_reset_token = ?
    `).get(user_id, token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    const passwordHash = await argon2.hash(new_password);

    db.prepare(`
      UPDATE users SET
        password_hash = ?,
        password_reset_token = NULL,
        password_reset_expires = NULL,
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, user_id);

    res.json({ success: true, message: 'Password has been reset' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers['x-auth-token'] || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.username, u.role
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > datetime('now')
    `).get(token);

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    res.json({
      authenticated: true,
      user: {
        id: session.user_id,
        email: session.email,
        username: session.username,
        role: session.role
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'] || req.headers.authorization?.replace('Bearer ', '');

  if (token) {
    try {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    } catch (err) {
      console.error('Logout error:', err);
    }
  }

  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`BLVD Park API running on port ${PORT}`);
});
