const Database = require('better-sqlite3');
const path = require('path');
const { ensureColumns } = require('./lib/schema-guard');
const { applySeoSchema } = require('./lib/seo-schema');

const defaultDbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'blvdpark.db');

const initDatabase = (dbPath = defaultDbPath) => {
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
    slug TEXT UNIQUE,
    seoTitle TEXT DEFAULT '',
    seoDescription TEXT DEFAULT '',
    seoKeywords TEXT DEFAULT '',
    ogTitle TEXT DEFAULT '',
    ogDescription TEXT DEFAULT '',
    ogImage TEXT DEFAULT '',
    deleted_at TEXT DEFAULT NULL,
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
    phone TEXT,
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

  -- Site Content (CMS)
  CREATE TABLE IF NOT EXISTS site_content (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    type TEXT DEFAULT 'text',
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Admin Users
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    role TEXT DEFAULT 'editor',
    password_hash TEXT,
    password_reset_token TEXT,
    password_reset_expires DATETIME,
    last_login DATETIME,
    isActive INTEGER DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sessions for admin auth
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- CMS Pages (shared CLE contract: per-page SEO, JSON-LD, robots, draft/publish)
  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    content_sections TEXT NOT NULL DEFAULT '[]',
    seo_title TEXT DEFAULT '',
    seo_description TEXT DEFAULT '',
    seo_keywords TEXT DEFAULT '',
    og_image TEXT DEFAULT '',
    json_ld TEXT DEFAULT '',
    robots TEXT NOT NULL DEFAULT 'noindex, nofollow',
    status TEXT NOT NULL DEFAULT 'draft',
    faq_items TEXT DEFAULT '[]',
    hero_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT DEFAULT ''
  );

  -- Activity log: records every mutating admin action
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    resourceType TEXT,
    resourceId TEXT,
    userId TEXT,
    username TEXT,
    details TEXT,
    ipAddress TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Access log: records auth events (login success/fail, SSO login)
  CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT,
    resourceType TEXT,
    resourceId TEXT,
    userId TEXT,
    username TEXT,
    details TEXT,
    ipAddress TEXT,
    route TEXT,
    method TEXT,
    statusCode INTEGER,
    userAgent TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Redirects manager
  CREATE TABLE IF NOT EXISTS redirects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fromPath TEXT UNIQUE,
    toPath TEXT,
    statusCode INTEGER DEFAULT 301,
    isActive INTEGER DEFAULT 1,
    matchType TEXT DEFAULT 'exact',
    notes TEXT,
    hitCount INTEGER DEFAULT 0,
    lastHitAt TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  `);

  // On a pre-existing production DB the CREATE TABLE IF NOT EXISTS above no-ops,
  // so columns added since that DB was created must be guarded in BEFORE the
  // index block below references them (idx_events_slug/idx_events_deleted_at
  // crash init on a legacy DB otherwise).
  ensureColumns(db, 'events', [
    { name: 'slug', ddl: 'slug TEXT' },
    { name: 'seoTitle', ddl: "seoTitle TEXT DEFAULT ''" },
    { name: 'seoDescription', ddl: "seoDescription TEXT DEFAULT ''" },
    { name: 'seoKeywords', ddl: "seoKeywords TEXT DEFAULT ''" },
    { name: 'ogTitle', ddl: "ogTitle TEXT DEFAULT ''" },
    { name: 'ogDescription', ddl: "ogDescription TEXT DEFAULT ''" },
    { name: 'ogImage', ddl: "ogImage TEXT DEFAULT ''" },
    { name: 'deleted_at', ddl: 'deleted_at TEXT DEFAULT NULL' },
  ]);
  ensureColumns(db, 'users', [
    { name: 'isActive', ddl: 'isActive INTEGER DEFAULT 1' },
  ]);
  ensureColumns(db, 'pages', [
    { name: 'faq_items', ddl: "faq_items TEXT DEFAULT '[]'" },
    { name: 'hero_json', ddl: "hero_json TEXT DEFAULT '{}'" },
  ]);

  // SEO-ops platform (Wave-2 port from HEIGHTSASTRO) — 20 tables, camelCase
  // matching this file's own existing column convention. Idempotent, same
  // as every CREATE TABLE IF NOT EXISTS block above.
  applySeoSchema(db);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
    CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
    CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
    CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_activity_log_createdAt ON activity_log(createdAt);
    CREATE INDEX IF NOT EXISTS idx_access_log_createdAt ON access_log(createdAt);
    CREATE INDEX IF NOT EXISTS idx_redirects_matchType ON redirects(matchType);
    CREATE INDEX IF NOT EXISTS idx_redirects_isActive ON redirects(isActive);
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

  defaultHours.forEach((h) => insertHours.run(...h));

  // Create default super admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    
    db.prepare(`
      INSERT INTO users (email, username, role, password_reset_token, password_reset_expires)
      VALUES (?, ?, ?, ?, ?)
    `).run('admin@blvdpark.com', 'Admin', 'super_admin', resetToken, resetExpires);
    
    console.log('Default admin user created: admin@blvdpark.com');
    console.log('Reset token:', resetToken);
  }

  db.close();
  return dbPath;
};

if (require.main === module) {
  const pathUsed = initDatabase();
  console.log('Database initialized at:', pathUsed);
}

module.exports = { initDatabase };
