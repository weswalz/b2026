// Import all schema files
import menuSection from './menuSection'
import slide from './slide'
import contactForm from './contactForm'
import contentSection from './contentSection'
import event from './event'
import eventAggregator from './eventAggregator'
import footer from './footer'
import gallery from './gallery'
import header from './header'
import hero from './hero'
import page from './page'
import restaurantmenu from './restaurantmenu'
import sitesettings from './sitesettings'
import slider from './slider'

// Export schemas array for Sanity Studio
export const schemaTypes = [
  // Document types
  page,
  sitesettings,
  event,
  
  // Object types (components)
  menuSection,
  slide,
  header,
  footer,
  hero,
  contentSection,
  gallery,
  contactForm,
  eventAggregator,
  slider,
  restaurantmenu,
]
