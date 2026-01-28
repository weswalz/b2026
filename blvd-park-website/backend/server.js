const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const app = express();
const dbPath = path.join(__dirname, 'database', 'blvdpark.db');
const db = new Database(dbPath);
const PORT = process.env.PORT || 3001;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

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

// ============== DASHBOARD STATS ==============
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const events = db.prepare("SELECT COUNT(*) as count FROM events WHERE status = 'active'").get();
    const gallery = db.prepare('SELECT COUNT(*) as count FROM gallery_images').get();
    const menu = db.prepare('SELECT COUNT(*) as count FROM menu_items WHERE isAvailable = 1').get();
    const reservations = db.prepare("SELECT COUNT(*) as count FROM reservations WHERE status = 'pending'").get();
    const privateEvents = db.prepare("SELECT COUNT(*) as count FROM private_events WHERE status = 'new'").get();
    const contact = db.prepare("SELECT COUNT(*) as count FROM contact_submissions WHERE status = 'unread'").get();

    res.json({
      activeEvents: events.count,
      galleryImages: gallery.count,
      menuItems: menu.count,
      pendingReservations: reservations.count,
      newPrivateEvents: privateEvents.count,
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
      query += " WHERE status = 'active'";
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
    const image = db.prepare('SELECT url FROM gallery_images WHERE id = ?').get(req.params.id);
    if (image) {
      const filePath = path.join(uploadsDir, path.basename(image.url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    db.prepare('DELETE FROM gallery_images WHERE id = ?').run(req.params.id);
    res.json({ success: true });
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
