import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'gallery',
  title: 'Gallery Section',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Gallery Title',
      type: 'string',
    }),
    defineField({
      name: 'description',
      title: 'Gallery Description',
      type: 'text',
      rows: 3,
    }),
    defineField({
      name: 'layout',
      title: 'Gallery Layout',
      type: 'string',
      options: {
        list: [
          { title: 'Grid', value: 'grid' },
          { title: 'Masonry', value: 'masonry' },
          { title: 'Carousel', value: 'carousel' },
        ],
      },
      initialValue: 'grid',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'images',
      title: 'Gallery Images',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'image',
              title: 'Image',
              type: 'image',
              options: {
                hotspot: true,
              },
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'caption',
              title: 'Caption',
              type: 'string',
            }),
            defineField({
              name: 'alt',
              title: 'Alt Text',
              type: 'string',
              description: 'Important for SEO and accessibility, but optional',
            }),
          ],
          preview: {
            select: {
              title: 'caption',
              media: 'image',
              alt: 'alt',
            },
            prepare({ title, media, alt }) {
              return {
                title: title || alt || 'Gallery Image',
                media,
              };
            },
          },
        },
      ],
      validation: (Rule) => Rule.required().min(1, 'A gallery must have at least one image'),
    }),
    defineField({
      name: 'imagesPerRow',
      title: 'Images Per Row',
      description: 'Maximum number of images to display per row',
      type: 'number',
      initialValue: 3,
      validation: (Rule) => Rule.min(1).max(6),
      hidden: ({ parent }) => parent?.layout === 'carousel',
    }),
    defineField({
      name: 'enableLightbox',
      title: 'Enable Lightbox',
      description: 'Allow users to view images in a fullscreen lightbox',
      type: 'boolean',
      initialValue: true,
    }),
    defineField({
      name: 'showCaptions',
      title: 'Show Captions',
      description: 'Display image captions',
      type: 'boolean',
      initialValue: true,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      imageCount: 'images.length',
    },
    prepare({ title, imageCount = 0 }) {
      return {
        title: title || 'Gallery Section',
        subtitle: `${imageCount} image${imageCount === 1 ? '' : 's'}`,
      };
    },
  },
}); 