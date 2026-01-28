// slider.ts
import { defineType, defineField } from 'sanity';

// Export the slide object type
export const slide = defineType({
  name: 'slide',
  title: 'Slide',
  type: 'object',
  fields: [
    defineField({
      name: 'backgroundImage',
      title: 'Background Image',
      type: 'image',
      options: { hotspot: true },
      description: 'Background image for the slide',
    }),
    defineField({
      name: 'logo',
      title: 'Logo (Transparent PNG)',
      type: 'image',
      options: { hotspot: true },
      description: 'Transparent PNG logo to be placed at the top of the slide',
    }),
    defineField({
      name: 'header',
      title: 'Header Line',
      type: 'string',
      description: 'Main header text for the slide',
    }),
    defineField({
      name: 'subheader',
      title: 'Subheader Line',
      type: 'string',
      description: 'Additional subheader text for the slide',
    }),
    defineField({
      name: 'cta',
      title: 'Call To Action',
      type: 'object',
      description: 'CTA button details (text and URL)',
      fields: [
        defineField({
          name: 'label',
          title: 'CTA Label',
          type: 'string',
          description: 'Text for the CTA button',
        }),
        defineField({
          name: 'url',
          title: 'CTA URL',
          type: 'url',
          description: 'Link the CTA button points to',
        }),
      ],
    }),
  ],
});

// Convert slider from document type to object type
export default defineType({
  name: 'sliderSection',
  title: 'Vanilla JS Slider',
  type: 'object', // Changed from 'document' to 'object'
  fields: [
    defineField({
      name: 'title',
      title: 'Slider Title',
      type: 'string',
      description: 'A title for the slider',
    }),
    defineField({
      name: 'slides',
      title: 'Slides',
      type: 'array',
      of: [{ type: 'slide' }],
      description: 'An array of slides for the slider',
    }),
    defineField({
      name: 'transitionEffect',
      title: 'Transition Effect',
      type: 'string',
      options: {
        list: [
          { title: 'Fade', value: 'fade' },
          { title: 'Slide', value: 'slide' },
          { title: 'Zoom', value: 'zoom' },
          { title: 'Flip', value: 'flip' },
        ],
        layout: 'radio',
      },
      description: 'Select the transition effect for the slider',
    }),
    defineField({
      name: 'autoplay',
      title: 'Autoplay',
      type: 'boolean',
      description: 'Enable or disable autoplay for the slider',
      initialValue: true,
    }),
    defineField({
      name: 'transitionDuration',
      title: 'Transition Duration (ms)',
      type: 'number',
      description: 'Duration for slide transitions in milliseconds',
      initialValue: 500,
    }),
  ],
});
