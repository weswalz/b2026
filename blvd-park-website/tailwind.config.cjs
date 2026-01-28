/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'
  ],
  theme: {
    extend: {
      colors: {
        // 2026 Premium Palette
        'blvd': {
          // Primary greens - deeper, more sophisticated
          'green': '#1A5F36',           // Deep forest (primary)
          'green-bright': '#22C55E',    // Electric accent for CTAs
          'green-dark': '#0F3D22',      // Darkest green for contrast
          'green-wash': 'rgba(26, 95, 54, 0.05)', // Subtle tint
          
          // Warm neutrals
          'cream': '#F8F6F1',           // Warm off-white background
          'cream-dark': '#EDE9E0',      // Slightly darker cream
          'charcoal': '#1C1C1C',        // Rich black for text
          'charcoal-light': '#2D2D2D',  // Lighter charcoal
          
          // Accent
          'gold': '#C9A962',            // Muted gold (affluent signal)
          'gold-light': '#D4BC7D',      // Lighter gold
          'gold-dark': '#A68B4B',       // Darker gold
        },
        
        // Legacy colors (keeping for compatibility with existing components)
        'blvd-green': '#1A5F36',         // Updated to new primary
        'blvd-light-green': '#D2E5E4',
        'blvd-accent': '#C9A962',        // Updated to gold
        'blvd-white': '#F8F6F1',         // Updated to cream
        'blvd-dark-green': '#0F3D22',
        'blvd-light-accent': '#D4BC7D',
        'blvd-animation': '#22C55E',
      },
      
      fontFamily: {
        // 2026 Typography Stack
        'display': ['Clash Display', 'SF Pro Display', 'system-ui', 'sans-serif'],
        'body': ['Satoshi', 'Inter', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      
      fontSize: {
        // Fluid typography scale
        'display-xl': ['clamp(3rem, 8vw, 7rem)', { lineHeight: '0.95', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2.5rem, 6vw, 5rem)', { lineHeight: '1', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(2rem, 4vw, 3.5rem)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'display-sm': ['clamp(1.5rem, 3vw, 2.5rem)', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      
      height: {
        '75vh': '75vh',
      },
      
      animation: {
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        'scale-in': 'scaleIn 0.5s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        'slide-up': 'slideUp 0.6s cubic-bezier(0.19, 1, 0.22, 1) forwards',
        'slide-down': 'slideDown 0.4s cubic-bezier(0.19, 1, 0.22, 1) forwards',
      },
      
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
        'out-quint': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      
      backgroundImage: {
        'hero-pattern': "url('/images/blvdherobg.jpg')",
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'circle-pattern': "url(\"data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15 0C6.716 0 0 6.716 0 15c0 8.284 6.716 15 15 15 8.284 0 15-6.716 15-15 0-8.284-6.716-15-15-15zm0 5c5.514 0 10 4.486 10 10s-4.486 10-10 10S5 20.514 5 15 9.486 5 15 5z' fill='%23ffffff' fill-opacity='0.3'/%3E%3C/svg%3E\")"
      },
      
      boxShadow: {
        'elevated': '0 4px 20px -2px rgba(0, 0, 0, 0.1), 0 2px 8px -2px rgba(0, 0, 0, 0.06)',
        'elevated-lg': '0 8px 40px -4px rgba(0, 0, 0, 0.12), 0 4px 16px -4px rgba(0, 0, 0, 0.08)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1)',
      },
      
      backdropBlur: {
        'xs': '2px',
      },
    },
  },
  plugins: [],
}
