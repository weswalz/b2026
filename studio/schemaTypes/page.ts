import { defineField, defineType } from 'sanity';

export default defineType({
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      description: 'This text is used for SEO purposes',
    }),
    defineField({
      name: 'mainImage',
      title: 'Main image',
      type: 'image',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'content',
      title: 'Page Content',
      description: 'Add, edit, and reorder page sections',
      type: 'array',
      of: [
        { type: 'header' },
        { type: 'footer' },
        { type: 'hero' },
        { type: 'contentSection' },
        { type: 'gallery' },
        { type: 'contactForm' },
        { type: 'eventAggregator' },
        { type: 'sliderSection' },
        { type: 'restaurantMenuSection' },
      ],
    }),
    defineField({
      name: 'seo',
      title: 'SEO & Metadata',
      type: 'object',
      fields: [
        {
          name: 'metaTitle',
          title: 'Meta Title',
          type: 'string',
          description: 'Displayed as the page title in search results (defaults to page title)',
        },
        {
          name: 'metaDescription',
          title: 'Meta Description',
          type: 'text',
          description: 'Description for search engines',
        },
        {
          name: 'shareImage',
          title: 'Share Image',
          type: 'image',
          description: 'Image displayed when shared on social media',
          options: {
            hotspot: true,
          },
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'mainImage',
    },
  },
}); 