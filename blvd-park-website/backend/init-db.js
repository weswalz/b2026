const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'database', 'blvdpark.db');
const db = new Database(dbPath);

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

console.log('Database initialized at:', dbPath);
db.close();
