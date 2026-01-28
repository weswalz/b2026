import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'header',
  title: 'Header',
  type: 'object',
  fields: [
    defineField({
      name: 'logo',
      title: 'Logo',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'navigationStyle',
      title: 'Navigation Style',
      type: 'string',
      options: {
        list: [
          { title: 'Desktop Navigation', value: 'desktop' },
          { title: 'Hamburger Menu Only', value: 'hamburger' },
          { title: 'Both Desktop & Hamburger', value: 'both' },
        ],
      },
      initialValue: 'both',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'navigationItems',
      title: 'Navigation Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'text',
              title: 'Text',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'link',
              title: 'Link',
              type: 'string',
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'isButton',
              title: 'Show as Button',
              type: 'boolean',
              initialValue: false,
            },
          ],
          preview: {
            select: {
              title: 'text',
              subtitle: 'link',
            },
          },
        },
      ],
    }),
    defineField({
      name: 'sticky',
      title: 'Sticky Header',
      description: 'Should the header stick to the top of the screen when scrolling?',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'transparent',
      title: 'Transparent Background',
      description: 'Should the header have a transparent background?',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      navStyle: 'navigationStyle',
    },
    prepare({ navStyle }) {
      return {
        title: 'Header',
        subtitle: `Navigation Style: ${navStyle}`,
      };
    },
  },
}); 