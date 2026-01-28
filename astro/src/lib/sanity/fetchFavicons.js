import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { client, fileUrlFor } from './client.js';

// Get the directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../../../public');

// Fetch favicon data from Sanity
export async function fetchAndSaveFavicons() {
  try {
    console.log('Fetching favicon package from Sanity...');
    
    // Query for site settings data that contains favicon information
    const siteSettings = await client.fetch(`*[_type == "siteSettings"][0]{
      favicons {
        faviconIco,
        faviconSvg,
        favicon96,
        appleTouchIcon,
        webAppManifest192,
        webAppManifest512,
        webManifest
      }
    }`);
    
    if (!siteSettings?.favicons) {
      console.log('No favicon data found in Sanity.');
      return;
    }
    
    // Define the mapping of Sanity field names to output file names
    const faviconMapping = {
      faviconIco: 'favicon.ico',
      faviconSvg: 'favicon.svg',
      favicon96: 'favicon-96x96.png',
      appleTouchIcon: 'apple-touch-icon.png',
      webAppManifest192: 'web-app-manifest-192x192.png',
      webAppManifest512: 'web-app-manifest-512x512.png',
      webManifest: 'site.webmanifest'
    };
    
    // Download each favicon file
    for (const [fieldName, fileName] of Object.entries(faviconMapping)) {
      const fileRef = siteSettings.favicons[fieldName];
      if (!fileRef) continue;
      
      const fileUrl = fileUrlFor(fileRef);
      if (!fileUrl) continue;
      
      const outputPath = path.join(publicDir, fileName);
      
      console.log(`Downloading ${fileName} from Sanity...`);
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        console.error(`Failed to download ${fileName}: ${response.statusText}`);
        continue;
      }
      
      const fileBuffer = await response.buffer();
      fs.writeFileSync(outputPath, fileBuffer);
      console.log(`Saved ${fileName} to public directory`);
    }
    
    console.log('Favicon package successfully downloaded and saved.');
  } catch (error) {
    console.error('Error fetching and saving favicons:', error);
  }
} 