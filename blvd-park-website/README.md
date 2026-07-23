# BLVD Park Website

This is the official website for BLVD Park Houston, a premier pickleball destination and sports bar located in The Heights neighborhood of Houston, Texas.

## About

BLVD Park offers premium pickleball courts, delicious food, craft drinks, and a vibrant sports bar atmosphere. This website serves as the digital home for BLVD Park, providing information about our facilities, events, and services.

## Technology Stack

This website is built with:

- [Astro](https://astro.build/) - The web framework for content-driven websites
- [Tailwind CSS](https://tailwindcss.com/) - A utility-first CSS framework
- [React](https://reactjs.org/) - For interactive components

## Development

### Prerequisites

- Node.js (v16 or later)
- npm or yarn

### Getting Started

1. Clone the repository
```bash
git clone https://github.com/yourusername/blvd-park-website.git
cd blvd-park-website
```

1. Install dependencies:
   npm install

2. Start the development server:
   npm run dev

3. Start the backend API (separate terminal):
   npm run backend

3. Build for production:
   npm run build

## Technology Stack

- **Astro**: Fast, content-focused web framework
- **Tailwind CSS**: Utility-first CSS framework
- **Flowbite**: UI component library built on Tailwind CSS
- **JavaScript**: For interactive elements

## Customization

- Edit tailwind.config.cjs to modify color scheme
- Replace images in the public/images/ directory
- Update content in component files

## CMS + Realtime Content

- Admin content editor: `/admin/content`
- Content API: `GET /api/content`, `PUT /api/content`, `GET /api/content/schema`
- Realtime updates via SSE at `GET /api/stream`

Optional env:
- `PUBLIC_API_URL` (frontend) and `FRONTEND_URLS` (backend CORS)
- `PUBLIC_TINYMCE_API_KEY` for TinyMCE cloud

## Testing

End-to-end tests use Playwright:

```bash
npm run test:e2e
```

## License

© 2025 BLVD Park. All rights reserved.
