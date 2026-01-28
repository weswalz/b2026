// src/scripts/main.js

// Sticky Header Functionality
document.addEventListener('DOMContentLoaded', function() {
    const header = document.getElementById('header');
    if (header) {
      const sticky = header.offsetTop;
  
      window.onscroll = function() {
        if (window.pageYOffset > 100) {
          header.classList.add('sticky-header');
        } else {
          header.classList.remove('sticky-header');
        }
      };
    }
  });
  
  // Event Accordion Functionality
  document.addEventListener('DOMContentLoaded', function() {
    const accordionButtons = document.querySelectorAll('[data-accordion-target]');
  
    accordionButtons.forEach(button => {
      button.addEventListener('click', () => {
        const target = button.getAttribute('data-accordion-target');
        const content = document.querySelector(target);
  
        // Toggle aria-expanded attribute
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', !isExpanded);
  
        // Toggle content visibility
        if (content) {
          content.classList.toggle('hidden');
        }
  
        // Rotate the arrow icon
        const arrow = button.querySelector('svg');
        if (arrow) {
          arrow.classList.toggle('rotate-180');
        }
      });
    });
  });
  
  // Smooth scrolling for anchor links
  document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
  
        // Skip if href is just "#" or the element doesn't exist
        if (targetId === '#' || !document.querySelector(targetId)) {
          return;
        }
  
        e.preventDefault();
  
        const targetElement = document.querySelector(targetId);
        const headerHeight = document.getElementById('header').offsetHeight;
        const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = targetPosition - headerHeight;
  
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      });
    });
  });
  
  // Mobile menu toggle
  document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.querySelector('[data-collapse-toggle="navbar-default"]');
    const mobileMenu = document.getElementById('navbar-default');
  
    if (menuToggle && mobileMenu) {
      menuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        const expanded = menuToggle.getAttribute('aria-expanded') === 'true' || false;
        menuToggle.setAttribute('aria-expanded', !expanded);
      });
  
      // Close mobile menu when a link is clicked
      const mobileMenuLinks = mobileMenu.querySelectorAll('a');
      mobileMenuLinks.forEach(link => {
        link.addEventListener('click', () => {
          mobileMenu.classList.add('hidden');
          menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }
});
      
// Form validation
document.addEventListener('DOMContentLoaded', function() {
  const contactForm = document.querySelector('#location form');   
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const captchaInput = document.getElementById('captcha');
      if (captchaInput && captchaInput.value === '3') {
        alert('Thank you for your message! We will get back to you soon.');
        contactForm.reset();
      } else {
        alert('Please answer the captcha question correctly.');
      }
    });
  }
         
  const bookingForm = document.querySelector('#booking-form form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', function(e) {
      e.preventDefault();
      alert('Thank you for your booking request! Our team will contact you shortly to confirm your reservation.');
      bookingForm.reset();
      window.scrollTo(0, 0);
    });
  }
});
