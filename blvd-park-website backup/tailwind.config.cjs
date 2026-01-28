/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './node_modules/flowbite/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand colors
        'blvd-green': '#208245',    // primary green (updated)
        'blvd-light-green': '#D2E5E4', // secondary light green
        'blvd-accent': '#E7CA76',    // accent light gold
        'blvd-white': '#F7F9F9',     // light background
        
        // Color variants for hover states, etc.
        'blvd-dark-green': '#0A4A25', // darker variant of primary
        'blvd-light-accent': '#F0DCAA', // lighter variant of accent
        'blvd-animation': '#329155',  // animation color for green bar
      },
      height: {
        '75vh': '75vh',
      },
      backgroundImage: {
        'hero-pattern': "url('/images/blvdherobg.jpg')",
        'circle-pattern': "url(\"data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15 0C6.716 0 0 6.716 0 15c0 8.284 6.716 15 15 15 8.284 0 15-6.716 15-15 0-8.284-6.716-15-15-15zm0 5c5.514 0 10 4.486 10 10s-4.486 10-10 10S5 20.514 5 15 9.486 5 15 5z' fill='%23ffffff' fill-opacity='0.3'/%3E%3C/svg%3E\")"
      }
    },
  },
  plugins: [
    require('flowbite/plugin')
  ],
}
