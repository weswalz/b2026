// restaurantMenu.ts
import { defineType, defineField } from 'sanity';

// Export the menuItem object type
export const menuItem = defineType({
  name: 'menuItem',
  title: 'Menu Item',
  type: 'object',
  fields: [
    defineField({
      name: 'name',
      title: 'Item Name',
      type: 'string',
      description: 'The name of the menu item',
    }),
    defineField({
      name: 'description',
      title: 'Item Description',
      type: 'text',
      description: 'Description or details about the menu item',
    }),
    defineField({
      name: 'price',
      title: 'Price',
      type: 'string',
      description:
        'The price of the item. Feel free to format this as needed (e.g. "$15", "15 USD", etc.)',
    }),
  ],
});

// Export the menuSection object type
export const menuSection = defineType({
  name: 'menuSection',
  title: 'Menu Section',
  type: 'object',
  fields: [
    defineField({
      name: 'sectionTitle',
      title: 'Section Title',
      type: 'string',
      description: 'The title of this section (e.g. Appetizers)',
    }),
    defineField({
      name: 'sectionDescription',
      title: 'Section Description',
      type: 'text',
      description: 'Optional description or note for the section',
    }),
    defineField({
      name: 'items',
      title: 'Menu Items',
      type: 'array',
      of: [{ type: 'menuItem' }],
      description: 'List of menu items within this section',
    }),
  ],
});

// Convert restaurant menu from document type to object type
export default defineType({
  name: 'restaurantMenuSection',
  title: 'Restaurant Menu',
  type: 'object', // Changed from 'document' to 'object'
  fields: [
    defineField({
      name: 'title',
      title: 'Menu Title',
      type: 'string',
      description: 'The title of your menu, e.g. Dinner Menu',
    }),
    defineField({
      name: 'intro',
      title: 'Introduction',
      type: 'text',
      description: 'Optional introductory text for the menu',
    }),
    defineField({
      name: 'rawMenuText',
      title: 'Raw Menu Text',
      type: 'array',
      of: [{ type: 'block' }],
      description:
        'Paste raw text content from your PDF here. This field supports rich text formatting so you can easily style it on the front end.',
    }),
    defineField({
      name: 'sections',
      title: 'Menu Sections',
      type: 'array',
      of: [{ type: 'menuSection' }],
      description:
        'Alternatively, create structured sections (e.g. Appetizers, Entrees, Desserts) with individual menu items.',
    }),
    defineField({
      name: 'backgroundImage',
      title: 'Background Image',
      type: 'image',
      options: { hotspot: true },
      description:
        'Optional background image for the menu page to add some extra flair.',
    }),
  ],
});
