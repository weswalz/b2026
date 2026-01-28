import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'contentSection',
  title: 'Content Section',
  type: 'object',
  groups: [
    {
      name: 'layout',
      title: 'Layout',
    },
    {
      name: 'background',
      title: 'Background',
    },
    {
      name: 'content',
      title: 'Content',
    },
  ],
  fields: [
    // Layout settings
    defineField({
      name: 'sectionHeading',
      title: 'Section Heading',
      type: 'string',
      group: 'layout',
    }),
    defineField({
      name: 'layout',
      title: 'Layout Type',
      type: 'string',
      options: {
        list: [
          { title: 'Single Column', value: 'single' },
          { title: 'Two Columns', value: 'twoColumn' },
          { title: 'Three Columns', value: 'threeColumn' },
        ],
      },
      initialValue: 'single',
      validation: (Rule) => Rule.required(),
      group: 'layout',
    }),
    defineField({
      name: 'columnRatio',
      title: 'Column Ratio',
      description: 'Choose the width ratio between columns',
      type: 'string',
      options: {
        list: [
          { title: 'Equal (50/50)', value: 'equal' },
          { title: 'Wide Left (70/30)', value: 'wideLeft' },
          { title: 'Wide Right (30/70)', value: 'wideRight' },
        ],
      },
      initialValue: 'equal',
      hidden: ({ parent }) => parent?.layout !== 'twoColumn',
      group: 'layout',
    }),

    // Background settings
    defineField({
      name: 'backgroundColor',
      title: 'Background Color',
      type: 'string',
      options: {
        list: [
          { title: 'None/Transparent', value: 'none' },
          { title: 'Dark (Default)', value: 'dark' },
          { title: 'Darker', value: 'darker' },
          { title: 'Gold', value: 'gold' },
        ],
      },
      initialValue: 'none',
      group: 'background',
    }),
    defineField({
      name: 'backgroundImage',
      title: 'Background Image',
      type: 'image',
      options: {
        hotspot: true,
      },
      group: 'background',
    }),
    defineField({
      name: 'applyOverlay',
      title: 'Apply Overlay',
      description: 'Add a color overlay to the background image for better text readability',
      type: 'boolean',
      initialValue: true,
      hidden: ({ parent }) => !parent?.backgroundImage,
      group: 'background',
    }),
    defineField({
      name: 'overlayOpacity',
      title: 'Overlay Opacity',
      description: 'Set the opacity of the overlay',
      type: 'number',
      initialValue: 0.7,
      validation: (Rule) => Rule.min(0).max(1),
      hidden: ({ parent }) => !parent?.backgroundImage || !parent?.applyOverlay,
      group: 'background',
    }),

    // Content fields
    defineField({
      name: 'contentBlocks',
      title: 'Content Blocks',
      description: 'Add content blocks to this section',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'columnContent',
          title: 'Column Content',
          fields: [
            {
              name: 'columnPosition',
              title: 'Column Position',
              type: 'string',
              options: {
                list: [
                  { title: 'First Column', value: 'first' },
                  { title: 'Second Column', value: 'second' },
                  { title: 'Third Column', value: 'third' },
                ],
              },
              initialValue: 'first',
              hidden: ({ parent, document }) => {
                const parentLayout = document?.content?.find(item => item._key === parent._key)?.layout || 'single';
                return parentLayout === 'single';
              },
              validation: (Rule) => Rule.required(),
            },
            {
              name: 'content',
              title: 'Content',
              type: 'array',
              of: [
                { type: 'block' }, // Rich text editor
                {
                  type: 'image',
                  options: { hotspot: true },
                },
                {
                  type: 'object',
                  name: 'ctaButton',
                  title: 'Call-to-action Button',
                  fields: [
                    {
                      name: 'text',
                      title: 'Button Text',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    },
                    {
                      name: 'link',
                      title: 'Button Link',
                      type: 'string',
                      validation: (Rule) => Rule.required(),
                    },
                    {
                      name: 'style',
                      title: 'Button Style',
                      type: 'string',
                      options: {
                        list: [
                          { title: 'Primary', value: 'primary' },
                          { title: 'Secondary', value: 'secondary' },
                          { title: 'Text Link', value: 'text' },
                        ],
                      },
                      initialValue: 'primary',
                    },
                  ],
                  preview: {
                    select: {
                      title: 'text',
                    },
                    prepare({ title }) {
                      return {
                        title: `Button: ${title}`,
                      };
                    },
                  },
                },
              ],
              validation: (Rule) => Rule.required(),
            },
          ],
          preview: {
            select: {
              position: 'columnPosition',
              blocks: 'content',
            },
            prepare({ position, blocks }) {
              const block = (blocks || []).find(block => block._type === 'block');
              const firstLine = block?.children[0]?.text || 'No content';
              
              return {
                title: position ? `${position} Column` : 'Column Content',
                subtitle: firstLine,
              };
            },
          },
        },
      ],
      group: 'content',
    }),
    defineField({
      name: 'spacing',
      title: 'Section Spacing',
      type: 'string',
      options: {
        list: [
          { title: 'Small', value: 'small' },
          { title: 'Medium', value: 'medium' },
          { title: 'Large', value: 'large' },
        ],
      },
      initialValue: 'medium',
      group: 'layout',
    }),
  ],
  preview: {
    select: {
      title: 'sectionHeading',
      layout: 'layout',
    },
    prepare({ title, layout }) {
      const layoutMap = {
        single: 'Single Column',
        twoColumn: 'Two Columns',
        threeColumn: 'Three Columns',
      };
      
      return {
        title: title || 'Content Section',
        subtitle: layoutMap[layout] || 'Content Section',
      };
    },
  },
}); 