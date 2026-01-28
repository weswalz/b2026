// siteSettings.ts
import { defineType, defineField } from 'sanity';

export default defineType({
  name: 'siteSettings',
  title: 'Site Settings',
  type: 'document',
  fields: [
    // Basic Site Information
    defineField({
      name: 'siteTitle',
      title: 'Site Title',
      type: 'string',
      description: 'The title of your website',
    }),
    defineField({
      name: 'siteDescription',
      title: 'Site Description',
      type: 'text',
      description: 'A brief description of your website',
    }),
    defineField({
      name: 'favicons',
      title: 'Favicon Package',
      type: 'object',
      description: 'Upload a complete favicon package for your website. Generate one at: https://realfavicongenerator.net',
      fields: [
        defineField({
          name: 'faviconIco',
          title: 'favicon.ico',
          type: 'file',
          description: 'Upload favicon.ico (main favicon file)',
        }),
        defineField({
          name: 'faviconSvg',
          title: 'favicon.svg',
          type: 'file',
          description: 'Upload favicon.svg (vector version)',
        }),
        defineField({
          name: 'favicon96',
          title: 'favicon-96x96.png',
          type: 'file',
          description: 'Upload favicon-96x96.png',
        }),
        defineField({
          name: 'appleTouchIcon',
          title: 'apple-touch-icon.png',
          type: 'file',
          description: 'Upload apple-touch-icon.png for iOS devices',
        }),
        defineField({
          name: 'webAppManifest192',
          title: 'web-app-manifest-192x192.png',
          type: 'file',
          description: 'Upload web-app-manifest-192x192.png for PWA',
        }),
        defineField({
          name: 'webAppManifest512',
          title: 'web-app-manifest-512x512.png',
          type: 'file',
          description: 'Upload web-app-manifest-512x512.png for PWA',
        }),
        defineField({
          name: 'webManifest',
          title: 'site.webmanifest',
          type: 'file',
          description: 'Upload site.webmanifest for PWA configuration',
        }),
      ],
    }),

    // Site-wide Background Settings
    defineField({
      name: 'siteBackground',
      title: 'Site-wide Background',
      type: 'object',
      fields: [
        defineField({
          name: 'backgroundType',
          title: 'Background Type',
          type: 'string',
          options: {
            list: [
              { title: 'Image', value: 'image' },
              { title: 'Color', value: 'color' },
              { title: 'Gradient', value: 'gradient' },
            ],
            layout: 'radio',
          },
          description: 'Choose the type of background for the site',
        }),
        defineField({
          name: 'backgroundImage',
          title: 'Background Image',
          type: 'image',
          options: { hotspot: true },
          description: 'Select a background image (if using image type)',
        }),
        defineField({
          name: 'backgroundColor',
          title: 'Background Color',
          type: 'string',
          description: 'Provide a hex code for the background color (if using color type)',
        }),
        defineField({
          name: 'gradientScheme',
          title: 'Gradient Scheme',
          type: 'string',
          options: {
            list: [
              { title: 'Midnight Aurora', value: 'midnightAurora' },
              { title: 'Obsidian Pulse', value: 'obsidianPulse' },
              { title: 'Cyber Matrix', value: 'cyberMatrix' },
              { title: 'Space Opera', value: 'spaceOpera' },
              { title: 'Neon Noir', value: 'neonNoir' },
              { title: 'Morning Mist', value: 'morningMist' },
              { title: 'Pearl Essence', value: 'pearlEssence' },
              { title: 'Arctic Dawn', value: 'arcticDawn' },
              { title: 'Vanilla Cloud', value: 'vanillaCloud' },
              { title: 'Crystal Clear', value: 'crystalClear' },
              { title: 'Lava Flow', value: 'lavaFlow' },
              { title: 'Electric Ocean', value: 'electricOcean' },
              { title: 'Synthwave', value: 'synthwave' },
              { title: 'Toxic Waste', value: 'toxicWaste' },
              { title: 'Pixel Glow', value: 'pixelGlow' },
              { title: 'Cyber Lime', value: 'cyberLime' },
              { title: 'Retro CRT', value: 'retroCRT' },
              { title: 'Neon Jungle', value: 'neonJungle' },
              { title: 'Cosmic Dust', value: 'cosmicDust' },
              { title: 'Hologram', value: 'hologram' },
            ],
          },
          description: 'Choose a gradient scheme (if using gradient type)',
        }),
      ],
      description:
        'Configure a site-wide background. Depending on the selected type, provide an image, a color hex, or choose a gradient scheme.',
    }),

    // SEO & Meta Data
    defineField({
      name: 'seo',
      title: 'SEO & Meta Data',
      type: 'object',
      fields: [
        defineField({
          name: 'metaTitle',
          title: 'Meta Title',
          type: 'string',
          description: 'The meta title for your site (used in search results)',
        }),
        defineField({
          name: 'metaDescription',
          title: 'Meta Description',
          type: 'text',
          description: 'A brief meta description of your site',
        }),
        defineField({
          name: 'keywords',
          title: 'Keywords',
          type: 'array',
          of: [{ type: 'string' }],
          description: 'Keywords for SEO purposes',
        }),
        defineField({
          name: 'canonicalUrl',
          title: 'Canonical URL',
          type: 'url',
          description: 'The canonical URL for your website (example: https://domain.com/)',
        }),
        defineField({
          name: 'openGraphImage',
          title: 'Open Graph Image',
          type: 'image',
          options: { hotspot: true },
          description: 'Image for social sharing (Open Graph)',
        }),
        defineField({
          name: 'openGraphTitle',
          title: 'Open Graph Title',
          type: 'string',
          description: 'Title for social sharing (Open Graph)',
        }),
        defineField({
          name: 'openGraphDescription',
          title: 'Open Graph Description',
          type: 'text',
          description: 'Description for social sharing (Open Graph)',
        }),
        defineField({
          name: 'twitterCardImage',
          title: 'Twitter Card Image',
          type: 'image',
          options: { hotspot: true },
          description: 'Image for Twitter cards',
        }),
        defineField({
          name: 'twitterTitle',
          title: 'Twitter Title',
          type: 'string',
          description: 'Title for Twitter sharing',
        }),
        defineField({
          name: 'twitterDescription',
          title: 'Twitter Description',
          type: 'text',
          description: 'Description for Twitter sharing',
        }),
      ],
      description: "Manage your site's SEO and meta data settings.",
    }),

    // Social Media Links
    defineField({
      name: 'social',
      title: 'Social Media Links',
      type: 'object',
      fields: [
        defineField({
          name: 'facebook',
          title: 'Facebook URL',
          type: 'url',
        }),
        defineField({
          name: 'instagram',
          title: 'Instagram URL',
          type: 'url',
        }),
        defineField({
          name: 'tiktok',
          title: 'TikTok URL',
          type: 'url',
        }),
        defineField({
          name: 'googleMaps',
          title: 'Google Maps URL',
          type: 'url',
        }),
      ],
      description: 'Links to your social media profiles.',
    }),

    // Analytics & Tracking
    defineField({
      name: 'analytics',
      title: 'Analytics & Tracking',
      type: 'object',
      fields: [
        defineField({
          name: 'googleAnalyticsId',
          title: 'Google Analytics ID',
          type: 'string',
          description: 'e.g., UA-XXXXXXXXX-X or G-XXXXXXXXXX',
        }),
        defineField({
          name: 'googleTagManagerId',
          title: 'Google Tag Manager ID',
          type: 'string',
          description: 'Your Google Tag Manager container ID',
        }),
      ],
      description: 'Configure analytics and tracking for your site.',
    }),

    // Code Injections
    defineField({
      name: 'codeInjections',
      title: 'Code Injections',
      type: 'object',
      fields: [
        defineField({
          name: 'headerCode',
          title: 'Header Code Injection',
          type: 'text',
          description: 'Code to be injected into the <head> of your site',
        }),
        defineField({
          name: 'footerCode',
          title: 'Footer Code Injection',
          type: 'text',
          description: 'Code to be injected before the closing </body> tag',
        }),
      ],
      description: 'Add custom code snippets for advanced integrations.',
    }),

    // Localization
    defineField({
      name: 'localization',
      title: 'Localization',
      type: 'object',
      fields: [
        defineField({
          name: 'defaultLanguage',
          title: 'Default Language',
          type: 'string',
          description: 'The default language for your site (e.g., en)',
        }),
        defineField({
          name: 'supportedLanguages',
          title: 'Supported Languages',
          type: 'array',
          of: [{ type: 'string' }],
          description: 'A list of languages your site supports (e.g., en, es, fr)',
        }),
      ],
      description: 'Localization settings for your website.',
    }),

    // Global Styles with Tailwind Color Schemes
    defineField({
      name: 'globalStyles',
      title: 'Global Styles',
      type: 'object',
      fields: [
        defineField({
          name: 'selectedColorScheme',
          title: 'Selected Color Scheme',
          type: 'string',
          options: {
            list: [
              { title: 'Midnight Aurora', value: 'midnightAurora' },
              { title: 'Obsidian Pulse', value: 'obsidianPulse' },
              { title: 'Cyber Matrix', value: 'cyberMatrix' },
              { title: 'Space Opera', value: 'spaceOpera' },
              { title: 'Neon Noir', value: 'neonNoir' },
              { title: 'Morning Mist', value: 'morningMist' },
              { title: 'Pearl Essence', value: 'pearlEssence' },
              { title: 'Arctic Dawn', value: 'arcticDawn' },
              { title: 'Vanilla Cloud', value: 'vanillaCloud' },
              { title: 'Crystal Clear', value: 'crystalClear' },
              { title: 'Lava Flow', value: 'lavaFlow' },
              { title: 'Electric Ocean', value: 'electricOcean' },
              { title: 'Synthwave', value: 'synthwave' },
              { title: 'Toxic Waste', value: 'toxicWaste' },
              { title: 'Pixel Glow', value: 'pixelGlow' },
              { title: 'Cyber Lime', value: 'cyberLime' },
              { title: 'Retro CRT', value: 'retroCRT' },
              { title: 'Neon Jungle', value: 'neonJungle' },
              { title: 'Cosmic Dust', value: 'cosmicDust' },
              { title: 'Hologram', value: 'hologram' },
            ],
          },
          description: 'Select one of 20 predefined color schemes for your site',
        }),
        // Additional global style fields (e.g., typography) can be added here
      ],
      description: 'Set your site-wide global styles.',
    }),
  ],
});
