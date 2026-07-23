const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'database', 'blvdpark.db');
const db = new Database(dbPath);

const events = [
  {
    title: 'Steak Night',
    date: 'Every Wednesday',
    time: '6PM – 11PM',
    description: '$22 Ribeye, $20 NY Strip — both include 2 sides. Plus $7 High Noons, $25 Seltzer Buckets, $8 Casamigos, and a guest DJ spinning all night.',
    category: 'special',
    image: '/images/events/steaknight2026.webp',
    status: 'active',
  },
  {
    title: 'NFL Playoffs Watch Party',
    date: 'Sunday, Jan 18',
    time: '2:00 PM',
    description: 'Texans vs Patriots Divisional Playoff. Every screen locked in, game sounds on blast. Free pickleball & volleyball between plays.',
    category: 'watch-party',
    image: '/images/events/nflplayoffs.png',
    status: 'active',
  },
  {
    title: 'National Championship',
    date: 'Monday, Jan 19',
    time: '6:30 PM',
    description: "The big one. College Football National Championship watch party with drink specials and game sounds. This is the one you don't want to miss.",
    category: 'watch-party',
    image: '/images/events/collegefootball.png',
    status: 'active',
  },
];

const mainMenuSections = [
  {
    category: 'Shareables',
    items: [
      { name: 'Chile Con Queso', price: 14, description: 'Tomato, onion, cilantro, roasted house-made salsa, tortilla chips' },
      { name: 'Cheese Fries', price: 12, description: 'Crispy fries, chile con queso, house cheese blend, green onion, Mexican and serrano crema' },
      { name: 'Pretzel Sticks', price: 12, description: 'Fresh baked pretzel sticks, chile con queso, cinnamon butter' },
      { name: 'Southwest Eggrolls', price: 12, description: 'Chicken, black beans, corn, peppers, serrano ranch' },
      { name: 'Hummus + Vegetables', price: 10, description: 'Fresh carrots, celery, cucumber & bell pepper, house-made hummus, roasted red pepper, feta, fresh herbs' },
    ],
  },
  {
    category: 'Street Tacos',
    items: [
      { name: 'Steak', price: 18, description: 'Pressure marinated steak, avocado, pickled red onion, serrano crema, cotija' },
      { name: 'Hatch Chicken', price: 17, description: 'Hatch chile chicken, avocado, lime cured red onion, Mexican crema' },
      { name: 'Birria', price: 20, description: 'Slow roasted short rib and chuck, guijillo, ancho, cascabel peppers, cheese blend, chili infused demi glace' },
    ],
  },
  {
    category: 'Wings',
    items: [
      { name: 'Buffalo Ghost Pepper', price: 0, description: null },
      { name: 'Honey Habanero', price: 0, description: null },
      { name: 'Thai Sesame Teriyaki', price: 0, description: null },
      { name: 'Garlic Parmesan', price: 0, description: null },
      { name: 'Hatch Citrus Pepper', price: 0, description: null },
    ],
  },
  {
    category: 'Burgers & Sandwiches',
    items: [
      { name: 'Boursin Mushroom Burger', price: 20, description: 'Seasonal mushrooms, boursin cheese, marinated tomato, truffle parmesan aioli' },
      { name: 'Avocado Cheeseburger', price: 19, description: 'Crisp avocado, tillamook pepper jack, tomato, bacon jam, charred jalapeño aioli' },
      { name: 'Green Chile Cheeseburger', price: 18, description: 'Roasted poblano, chile con queso, marinated tomato, pickled red onion' },
      { name: 'BLVD Classic Burger', price: 15, description: 'Tillamook sharp cheddar, marinated tomato, pickles, red onion, lettuce, aioli' },
      { name: 'Hot Bird', price: 17, description: 'Crispy chicken breast, honey habanero, kale slaw, tomato, pickles' },
      { name: 'Smoked Turkey Avocado', price: 18, description: 'Smoked turkey, pecan bacon, boursin, peppadew peppers, dried cherries, dijon horseradish aioli' },
    ],
  },
  {
    category: 'The Skinny',
    items: [
      { name: 'Vietnamese Steak', price: 19, description: 'Seared steak, romaine, kale, cabbage, cucumber, carrots, bean sprouts, peanut lime vinaigrette' },
      { name: 'Chicken Harissa', price: 17, description: 'Harissa marinated chicken, seasonal greens, avocado, feta, hummus, harissa vinaigrette' },
      { name: 'Citrus Avocado Chop', price: 13, description: 'Mixed greens, mandarin oranges, roasted corn, pickled red onions, avocado, cotija, poblano ranch' },
      { name: 'Kale Caesar', price: 10, description: 'Kale blend, romaine, croutons, parmesan, lemon caesar dressing' },
    ],
  },
  {
    category: 'Steak Frites',
    items: [
      { name: '16oz Seared Ribeye', price: 42, description: null },
      { name: '12oz Seared NY Strip', price: 35, description: null },
    ],
  },
];

const lunchMenuSections = [
  {
    category: 'Shareables',
    items: [
      { name: 'Chile Con Queso', price: 8, description: 'Tomato, onion, cilantro, roasted house-made salsa, tortilla chips' },
      { name: 'Cheese Fries', price: 9, description: 'Crispy fries, chile con queso, house cheese blend, green onion, Mexican and serrano crema' },
      { name: 'Pretzel Sticks', price: 10, description: 'Fresh baked pretzel sticks, chile con queso, cinnamon butter' },
      { name: 'Southwest Eggrolls', price: 10, description: 'Chicken, black beans, corn, peppers, serrano ranch' },
      { name: 'Hummus + Vegetables', price: 8, description: 'Fresh carrots, celery, cucumber & bell pepper, house-made hummus, roasted red pepper, feta, fresh herbs' },
    ],
  },
  {
    category: 'Street Tacos',
    items: [
      { name: 'Steak', price: 15, description: 'Pressure marinated steak, avocado, pickled red onion, serrano crema, cotija' },
      { name: 'Hatch Chicken', price: 15, description: 'Hatch chile chicken, avocado, lime cured red onion, Mexican crema' },
      { name: 'Birria', price: 15, description: 'Slow roasted short rib and chuck, guijillo, ancho, cascabel peppers, cheese blend, chili infused demi glace' },
    ],
  },
  {
    category: 'Wings',
    items: [
      { name: 'Buffalo Ghost Pepper', price: 0, description: null },
      { name: 'Honey Habanero', price: 0, description: null },
      { name: 'Thai Sesame Teriyaki', price: 0, description: null },
      { name: 'Garlic Parmesan', price: 0, description: null },
      { name: 'Hatch Citrus Pepper', price: 0, description: null },
    ],
  },
  {
    category: 'Burgers & Sandwiches',
    items: [
      { name: 'Boursin Mushroom Burger', price: 15, description: 'Seasonal mushrooms, boursin cheese, marinated tomato, truffle parmesan aioli' },
      { name: 'Avocado Cheeseburger', price: 15, description: 'Crisp avocado, tillamook pepper jack, tomato, bacon jam, charred jalapeño aioli' },
      { name: 'Green Chile Cheeseburger', price: 15, description: 'Roasted poblano, chile con queso, marinated tomato, pickled red onion' },
      { name: 'BLVD Classic Burger', price: 14, description: 'Tillamook sharp cheddar, marinated tomato, pickles, red onion, lettuce, aioli' },
      { name: 'Hot Bird', price: 15, description: 'Crispy chicken breast, honey habanero, kale slaw, tomato, pickles' },
      { name: 'Smoked Turkey Avocado', price: 16, description: 'Smoked turkey, pecan bacon, boursin, peppadew peppers, dried cherries, dijon horseradish aioli' },
    ],
  },
  {
    category: 'The Skinny',
    items: [
      { name: 'Vietnamese Salad', price: 12, description: 'Romaine, kale, cabbage, cucumber, carrots, bean sprouts, peanut lime vinaigrette' },
      { name: 'Harissa Salad', price: 12, description: 'Harissa chicken, seasonal greens, avocado, feta, hummus, harissa vinaigrette' },
      { name: 'Citrus Avocado Chop', price: 12, description: 'Mixed greens, mandarin oranges, roasted corn, pickled red onions, avocado, cotija, poblano ranch' },
      { name: 'Kale Caesar', price: 10, description: 'Kale blend, romaine, croutons, parmesan, lemon caesar dressing' },
    ],
  },
  {
    category: 'Steak Frites',
    items: [
      { name: '16oz Seared Ribeye', price: 35, description: null },
      { name: '12oz Seared NY Strip', price: 30, description: null },
    ],
  },
];

const insertEvent = db.prepare(`
  INSERT INTO events (title, date, time, description, category, image, status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const selectEvent = db.prepare(`
  SELECT id FROM events WHERE title = ? AND date = ? AND time = ?
`);

const insertMenu = db.prepare(`
  INSERT INTO menu_items (name, description, price, category, subcategory, image, isLunchOnly)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const selectMenu = db.prepare(`
  SELECT id FROM menu_items WHERE name = ? AND category = ? AND isLunchOnly = ?
`);

const insertGallery = db.prepare(`
  INSERT INTO gallery_images (url, alt, category, position, galleryType)
  VALUES (?, ?, ?, ?, ?)
`);
const selectGallery = db.prepare(`
  SELECT id FROM gallery_images WHERE url = ?
`);

let insertedEvents = 0;
let insertedMenu = 0;
let insertedGallery = 0;

events.forEach((event) => {
  const existing = selectEvent.get(event.title, event.date, event.time);
  if (existing) return;
  insertEvent.run(
    event.title,
    event.date,
    event.time,
    event.description,
    event.category,
    event.image,
    event.status
  );
  insertedEvents += 1;
});

const flattenMenu = (sections, isLunchOnly) => sections.flatMap((section) =>
  section.items.map((item) => ({
    name: item.name,
    description: item.description ?? null,
    price: typeof item.price === 'number' ? item.price : 0,
    category: section.category,
    subcategory: null,
    isLunchOnly,
  }))
);

const allMenuItems = [
  ...flattenMenu(mainMenuSections, 0),
  ...flattenMenu(lunchMenuSections, 1),
];

allMenuItems.forEach((item) => {
  const existing = selectMenu.get(item.name, item.category, item.isLunchOnly);
  if (existing) return;
  insertMenu.run(
    item.name,
    item.description,
    item.price,
    item.category,
    item.subcategory,
    null,
    item.isLunchOnly
  );
  insertedMenu += 1;
});

const galleryDir = path.join(__dirname, '..', 'public', 'images', '2026GALLERY');
if (fs.existsSync(galleryDir)) {
  const files = fs.readdirSync(galleryDir)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .sort();

  const maxPosition = db.prepare('SELECT MAX(position) as max FROM gallery_images').get();
  let position = maxPosition?.max || 0;

  files.forEach((file, index) => {
    const url = `/images/2026GALLERY/${file}`;
    if (selectGallery.get(url)) return;
    position += 1;
    insertGallery.run(url, `BLVD Park Gallery ${index + 1}`, 'venue', position, 'main');
    insertedGallery += 1;
  });
} else {
  console.warn('Gallery directory not found:', galleryDir);
}

console.log(`Seed complete: ${insertedEvents} events, ${insertedMenu} menu items, ${insertedGallery} gallery images.`);
db.close();
