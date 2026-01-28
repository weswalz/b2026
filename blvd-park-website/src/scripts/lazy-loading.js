// Enhanced lazy loading with Intersection Observer
// Provides better performance than native loading="lazy" for complex scenarios

document.addEventListener('DOMContentLoaded', function() {
  // Check if browser supports Intersection Observer
  if ('IntersectionObserver' in window) {
    
    // Create intersection observer for lazy loading images
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          
          // Handle regular images
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          
          // Handle srcset for responsive images
          if (img.dataset.srcset) {
            img.srcset = img.dataset.srcset;
            img.removeAttribute('data-srcset');
          }
          
          // Remove loading placeholder if it exists
          img.classList.remove('lazy-loading');
          img.classList.add('lazy-loaded');
          
          // Stop observing this image
          observer.unobserve(img);
        }
      });
    }, {
      // Load images when they are 50px away from viewport
      rootMargin: '50px 0px',
      threshold: 0.01
    });
    
    // Find all images that should be lazy loaded
    const lazyImages = document.querySelectorAll('img[data-src], img[data-srcset]');
    lazyImages.forEach(img => {
      // Add loading class for styling
      img.classList.add('lazy-loading');
      imageObserver.observe(img);
    });
    
    // Progressive loading for gallery images
    const galleryObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const section = entry.target;
          
          // Load gallery images with slight delay for smoother experience
          const galleryImages = section.querySelectorAll('img[loading="lazy"]');
          galleryImages.forEach((img, index) => {
            setTimeout(() => {
              // Preload the image to ensure it's cached
              const preloadImg = new Image();
              preloadImg.src = img.src;
              if (img.srcset) {
                preloadImg.srcset = img.srcset;
              }
            }, index * 50); // Stagger loading by 50ms
          });
          
          observer.unobserve(section);
        }
      });
    }, {
      rootMargin: '200px 0px',
      threshold: 0.1
    });
    
    // Observe gallery sections
    const gallerySections = document.querySelectorAll('[data-gallery]');
    gallerySections.forEach(section => {
      galleryObserver.observe(section);
    });
    
  } else {
    // Fallback for browsers without Intersection Observer
    // Load all images immediately
    const lazyImages = document.querySelectorAll('img[data-src], img[data-srcset]');
    lazyImages.forEach(img => {
      if (img.dataset.src) {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      }
      if (img.dataset.srcset) {
        img.srcset = img.dataset.srcset;
        img.removeAttribute('data-srcset');
      }
    });
  }
});