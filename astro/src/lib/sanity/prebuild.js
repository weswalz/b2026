import { fetchAndSaveFavicons } from './fetchFavicons.js';

// This file runs before the Astro build process
console.log('🚀 Running pre-build tasks...');

// Run all pre-build tasks concurrently
Promise.all([
  fetchAndSaveFavicons(),
  // Add any other pre-build tasks here
])
  .then(() => {
    console.log('✅ Pre-build tasks completed successfully');
  })
  .catch((error) => {
    console.error('❌ Pre-build tasks failed:', error);
    process.exit(1);
  }); 