export default {
  name: 'menuSection',
  title: 'Menu Section',
  type: 'object',
  fields: [
    {
      name: 'title',
      title: 'Section Title',
      type: 'string',
    },
    {
      name: 'description',
      title: 'Section Description',
      type: 'text',
    },
    {
      name: 'items',
      title: 'Menu Items',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            {
              name: 'name',
              title: 'Item Name',
              type: 'string',
            },
            {
              name: 'description',
              title: 'Item Description',
              type: 'text',
            },
            {
              name: 'price',
              title: 'Price',
              type: 'string',
            },
            {
              name: 'image',
              title: 'Item Image',
              type: 'image',
              options: {
                hotspot: true
              }
            }
          ]
        }
      ]
    }
  ]
} 