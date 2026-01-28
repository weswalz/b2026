import {createClient} from '@sanity/client'
import imageUrlBuilder from '@sanity/image-url'

export const client = createClient({
  projectId: import.meta.env.PUBLIC_SANITY_PROJECT_ID,
  dataset: import.meta.env.PUBLIC_SANITY_DATASET,
  apiVersion: '2025-03-06',
  useCdn: true,
})

// Helper for images
const builder = imageUrlBuilder(client)
export function urlFor(source) {
  return builder.image(source)
}

// Helper for file assets
export function fileUrlFor(fileRef) {
  if (!fileRef || !fileRef.asset || !fileRef.asset._ref) {
    return null
  }
  
  // Extract parts from the asset reference
  const [_file, id, extension] = fileRef.asset._ref.split('-')
  
  // Construct the file URL
  return `https://cdn.sanity.io/files/${client.config().projectId}/${client.config().dataset}/${id}.${extension}`
}
