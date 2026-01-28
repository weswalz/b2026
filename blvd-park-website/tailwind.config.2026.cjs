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
        
        // Legacy colors (keeping for compatibility)
        'blvd-green': '#1A5F36',
        'blvd-light-green': '#D2E5E4',
        'blvd-accent': '#C9A962',
        'blvd-white': '#F8F6F1',
        'blvd-dark-green': '#0F3D22',
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
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
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
