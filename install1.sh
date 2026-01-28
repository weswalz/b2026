#!/bin/bash

# Ensure we're in the project directory
cd blvd-park-website

# Create Main JavaScript file
cat > src/scripts/main.js << 'EOF'
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
EOF

# Create Index Page
cat > src/pages/index.astro << 'EOF'
---
// src/pages/index.astro
import Layout from '@layouts/Layout.astro';
import Hero from '@components/Hero.astro';
import AboutSection from '@components/AboutSection.astro';
import BLVDGallerySection from '@components/BLVDGallerySection.astro';
import MenuSection from '@components/MenuSection.astro';
import PickleballSection from '@components/PickleballSection.astro';
import EventsSection from '@components/EventsSection.astro';
import LocationSection from '@components/LocationSection.astro';
import SocialEmbed from '@components/SocialEmbed.astro';
---

<Layout title="Home">
  <Hero />
  <AboutSection />
  <BLVDGallerySection />
  <MenuSection />
  <PickleballSection />
  <EventsSection />
  <LocationSection />
  <SocialEmbed />
</Layout>
EOF

# Create Book Page
cat > src/pages/book.astro << 'EOF'
---
// src/pages/book.astro
import Layout from '@layouts/Layout.astro';
import CTAButton from '@components/CTAButton.astro';
---

<Layout title="Book at BLVD">
  <div class="pt-28 pb-16 px-4 bg-blvd-light-green">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-4xl md:text-5xl font-bold mb-8 text-center text-blvd-green">Book at BLVD Park</h1>
      
      <div class="bg-blvd-white rounded-lg shadow-lg p-8 mb-12">
<h2 class="text-2xl font-bold mb-6 text-blvd-green">Booking Options</h2>
        
        <div class="space-y-8">
          <!-- VIP Tables -->
          <div class="border-b border-blvd-light-green pb-6">
            <h3 class="text-xl font-semibold mb-3">VIP Tables</h3>
            <p class="mb-4">Reserve your VIP table at BLVD Park for a premium experience with dedicated service and the best views of our venue.</p>
            <CTAButton href="#booking-form" color="green">Book a VIP Table</CTAButton>
          </div>
          
          <!-- Corporate Events -->
          <div class="border-b border-blvd-light-green pb-6">
            <h3 class="text-xl font-semibold mb-3">Corporate Events</h3>
            <p class="mb-4">Host your next team building, corporate happy hour, or business event at BLVD Park. We offer customizable packages for groups of all sizes.</p>
            <CTAButton href="#booking-form" color="green">Inquire About Corporate Events</CTAButton>
          </div>
          
          <!-- Private Events -->
          <div class="border-b border-blvd-light-green pb-6">
            <h3 class="text-xl font-semibold mb-3">Private Events</h3>
            <p class="mb-4">From birthday parties to anniversaries and celebrations, our venue can accommodate your private event needs with customized food and drink options.</p>
            <CTAButton href="#booking-form" color="green">Plan Your Private Event</CTAButton>
          </div>
          
          <!-- Corporate Happy Hours -->
          <div>
            <h3 class="text-xl font-semibold mb-3">Corporate Happy Hours</h3>
            <p class="mb-4">Treat your team to a fun after-work experience with our corporate happy hour packages featuring special drink pricing and appetizer platters.</p>
            <CTAButton href="#booking-form" color="green">Book a Corporate Happy Hour</CTAButton>
          </div>
        </div>
      </div>
      
      <!-- Booking Form -->
      <div id="booking-form" class="bg-blvd-white rounded-lg shadow-lg p-8">
        <h2 class="text-2xl font-bold mb-6 text-blvd-green">Booking Request Form</h2>
        
        <form class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="first-name" class="block mb-2 text-sm font-medium text-blvd-green">First Name</label>
              <input type="text" id="first-name" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
            </div>
            
            <div>
              <label for="last-name" class="block mb-2 text-sm font-medium text-blvd-green">Last Name</label>
              <input type="text" id="last-name" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="email" class="block mb-2 text-sm font-medium text-blvd-green">Email</label>
              <input type="email" id="email" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
            </div>
            
            <div>
              <label for="phone" class="block mb-2 text-sm font-medium text-blvd-green">Phone Number</label>
              <input type="tel" id="phone" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
            </div>
          </div>
          
          <div>
            <label for="booking-type" class="block mb-2 text-sm font-medium text-blvd-green">Booking Type</label>
            <select id="booking-type" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
              <option value="" disabled selected>Select a booking type</option>
              <option value="vip-table">VIP Table</option>
              <option value="corporate-event">Corporate Event</option>
              <option value="private-event">Private Event</option>
              <option value="corporate-happy-hour">Corporate Happy Hour</option>
            </select>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="date" class="block mb-2 text-sm font-medium text-blvd-green">Preferred Date</label>
              <input type="date" id="date" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
            </div>
            
            <div>
              <label for="time" class="block mb-2 text-sm font-medium text-blvd-green">Preferred Time</label>
              <input type="time" id="time" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
            </div>
          </div>
          
          <div>
            <label for="guests" class="block mb-2 text-sm font-medium text-blvd-green">Number of Guests</label>
            <input type="number" id="guests" min="1" max="500" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5" required>
          </div>
          
          <div>
            <label for="message" class="block mb-2 text-sm font-medium text-blvd-green">Special Requests</label>
            <textarea id="message" rows="4" class="bg-blvd-white border border-blvd-light-green text-blvd-green text-sm rounded-lg focus:ring-blvd-green focus:border-blvd-green block w-full p-2.5"></textarea>
          </div>
          
          <button type="submit" class="text-blvd-white bg-blvd-green hover:bg-blvd-accent hover:text-blvd-green focus:ring-4 focus:ring-blvd-light-green font-medium rounded-lg text-sm px-5 py-2.5 text-center">Submit Booking Request</button>
        </form>
      </div>
    </div>
  </div>
</Layout>

<script>
  // Simple form validation for demo purposes
  document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');
    
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Thank you for your booking request! Our team will contact you shortly to confirm your reservation.');
        form.reset();
        window.scrollTo(0, 0);
      });
    }
  });
</script>
EOF

# Create a README file
cat > README.md << 'EOF'
# BLVD Park Website

A modern website for BLVD Park built with Astro, Tailwind CSS, and Flowbite components.

## Features

- Responsive design for mobile, tablet, and desktop
- Interactive components like sticky header, image gallery, and event accordions
- Contact and booking forms with basic validation
- Integration with maps and social media
- Custom brand color scheme
## Getting Started

1. Install dependencies:
   npm install

2. Start the development server:
   npm run dev

3. Build for production:
   npm run build

## Technology Stack

- **Astro**: Fast, content-focused web framework
- **Tailwind CSS**: Utility-first CSS framework
- **Flowbite**: UI component library built on Tailwind CSS
- **JavaScript**: For interactive elements

## Customization

- Edit tailwind.config.cjs to modify color scheme
- Replace images in the public/images/ directory
- Update content in component files

## License

© 2025 BLVD Park. All rights reserved.
EOF

# Create image placeholders
mkdir -p public/images/{logos,venue,crowd,food,drinks,events}
touch public/favicon.ico
touch public/images/logos/blvd-park-logo.png
touch public/images/logos/applemaps.png
touch public/images/logos/googlemaps.png
touch public/images/logos/uberlogo.svg
touch public/images/logos/lyftlogo.png
touch public/images/blvdherobg.jpg
touch public/images/pickleballhome.jpg
touch public/images/events/{chicken.jpg,olympics.jpg,blvdsteaknew.jpg,crawfish1.jpg}

echo "Pages and JavaScript created successfully!"
echo "All scripts completed. Your BLVD Park website structure is now ready!"
echo "Next steps:"
echo "1. Replace the placeholder image files with your actual images"
echo "2. Run 'npm install' to install dependencies"
echo "3. Run 'npm run dev' to start the development server"

