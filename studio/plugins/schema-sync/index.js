import React from 'react'
import SchemaSync from './SchemaSync'

export default {
  name: 'schema-sync',
  document: {
    types: ['siteSettings'],
    actions: (prev, { schemaType }) => {
      if (schemaType === 'siteSettings') {
        return [...prev]
      }
      return prev
    },
    components: {
      footer: SchemaSync
    }
  }
} 