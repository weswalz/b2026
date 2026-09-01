// Page-builder editor definitions — mirrors backend/lib/pages-validate.js
// PAGES_COMPONENT_DEFS (the server-side contract). Keep both in sync.
import type { BuilderSection, ContentSectionModule, ComponentSectionModule } from '../../../lib/api';

export type PropType = 'text' | 'number' | 'select' | 'checkbox';

export interface ComponentPropDef {
  key: string;
  label: string;
  type: PropType;
  options?: string[];
}

export interface ComponentDef {
  name: string;
  label: string;
  description: string;
  props: ComponentPropDef[];
}

export const COMPONENT_DEFS: ComponentDef[] = [
  {
    name: 'CallToAction',
    label: 'Call to Action',
    description: 'Dark green band with a headline and up to two buttons.',
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'primaryLabel', label: 'Primary Button Label', type: 'text' },
      { key: 'primaryHref', label: 'Primary Button Link', type: 'text' },
      { key: 'secondaryLabel', label: 'Secondary Button Label', type: 'text' },
      { key: 'secondaryHref', label: 'Secondary Button Link', type: 'text' },
    ],
  },
  {
    name: 'GalleryGrid',
    label: 'Gallery Grid',
    description: 'Live photo grid from the site gallery.',
    props: [
      { key: 'title', label: 'Section Title', type: 'text' },
      { key: 'category', label: 'Category Filter', type: 'select', options: ['', 'venue', 'food', 'crowd', 'events'] },
      { key: 'limit', label: 'Image Limit', type: 'number' },
      { key: 'ctaLabel', label: 'Button Label (optional)', type: 'text' },
      { key: 'ctaHref', label: 'Button Link (optional)', type: 'text' },
    ],
  },
  {
    name: 'UpcomingEventsSection',
    label: 'Upcoming Events',
    description: 'Live event cards from the events calendar.',
    props: [
      { key: 'title', label: 'Section Title', type: 'text' },
      { key: 'limit', label: 'Event Limit', type: 'number' },
      { key: 'ctaLabel', label: 'Button Label (optional)', type: 'text' },
      { key: 'ctaHref', label: 'Button Link (optional)', type: 'text' },
    ],
  },
  {
    name: 'ReserveCta',
    label: 'Reservation CTA',
    description: 'VIP table reservation band linking to the booking page.',
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'buttonLabel', label: 'Button Label', type: 'text' },
      { key: 'buttonHref', label: 'Button Link', type: 'text' },
    ],
  },
  {
    name: 'ContactStrip',
    label: 'Contact Strip',
    description: 'Simple contact prompt linking to the contact form.',
    props: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'subtitle', label: 'Subtitle', type: 'text' },
      { key: 'buttonLabel', label: 'Button Label', type: 'text' },
    ],
  },
];

export const emptyContentSection = (): ContentSectionModule => ({
  type: 'content-section',
  title: '', subtitle: '', contentHtml: '',
  imageSrc: '', imageAlt: '', imagePosition: 'left',
  headingLevel: 'h2', id: '',
});

export const emptyComponentSection = (name: string): ComponentSectionModule => ({
  type: 'component',
  name,
  props: {},
});

export const newSection = (kind: 'text' | 'html'): BuilderSection =>
  kind === 'text' ? { type: 'text', body: '' } : { type: 'html', body: '' };

export const SECTION_TYPE_LABELS: Record<BuilderSection['type'], string> = {
  text: 'Text',
  html: 'HTML Block',
  'content-section': 'Content Section',
  component: 'Component',
};
