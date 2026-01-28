# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT
- **Rules**: Live by the rules.md file

## Build Commands
- `npm run dev` - Start development server on port 3000
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `./deploy.sh` - Build and deploy to production (requires SSH key)

## Project Architecture

### Technology Stack
- **Framework**: Astro 5.x with React integration
- **Styling**: Tailwind CSS v3.4.0 with custom 2026 premium palette
- **Interactive Components**: React 19.x (only when interactivity required)
- **UI Library**: Flowbite (loaded asynchronously on interaction)

### Path Aliases
- `@components/*` → `./src/components/*`
- `@layouts/*` → `./src/layouts/*`
- `@scripts/*` → `./src/scripts/*`

### Two Layout Systems
- `Layout.astro` - Current production layout (Navbar + Footer)
- `Layout2026.astro` - Redesigned 2026 layout with updated components
- Corresponding `*2026.astro` components exist for the redesign

### Theme Colors (tailwind.config.cjs)
Primary palette uses `blvd-*` prefix:
- **Greens**: `blvd-green` (#1A5F36), `blvd-green-bright` (#22C55E), `blvd-green-dark` (#0F3D22)
- **Neutrals**: `blvd-cream` (#F8F6F1), `blvd-charcoal` (#1C1C1C)
- **Accent**: `blvd-gold` (#C9A962), `blvd-gold-light`, `blvd-gold-dark`

Custom typography: `font-display` (Clash Display), `font-body` (Satoshi)
Custom animations: `animate-fade-up`, `animate-fade-in`, `animate-scale-in`, `animate-slide-up`

### Performance Patterns
- Analytics (GA, FB Pixel) load on user interaction or after 10s
- Flowbite JS loads on click/touch or after 5s
- Images use `data-src`/`data-srcset` for lazy loading via IntersectionObserver
- Hero images preloaded with responsive breakpoints

### Deployment
- Production: https://blvdpark.com
- Server: root@104.219.54.169:/var/www/blvdpark.com
- `./deploy.sh` runs build then rsync with --delete
