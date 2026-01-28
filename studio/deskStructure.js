// A simpler approach to filtering document types in the sidebar
import {structureTool} from 'sanity/structure'

// We've completely removed service and location schemas,
// so we don't need to filter them out anymore
export default (S) =>
  S.list()
    .title('Content')
    .items([
      // Simply show all document types
      ...S.documentTypeListItems()
    ]) 