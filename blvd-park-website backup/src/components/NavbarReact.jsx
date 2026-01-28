import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NavbarReact = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'About Us', path: '/#blvd-park' },
    { name: 'Menu', path: '/#menu' },
    { name: 'Events', path: '/#events' },
    { name: 'Hours & Location', path: '/#hours-location' },
  ];

  return (
    <>
      {/* Top Green Bar */}
      <div className={`fixed top-0 left-0 right-0 py-[3px] h-7 md:h-7 bg-blvd-green z-50 flex items-center transition-all duration-300 ${
        isScrolled ? 'opacity-0 -translate-y-full' : 'opacity-100'
      }`}>
        {/* Pattern Overlay */}
        <div className="absolute inset-0 opacity-20" style={{backgroundImage: "url('data:image/svg+xml,%3Csvg width='30' height='30' viewBox='0 0 30 30' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M15 0C6.716 0 0 6.716 0 15c0 8.284 6.716 15 15 15 8.284 0 15-6.716 15-15 0-8.284-6.716-15-15-15zm0 5c5.514 0 10 4.486 10 10s-4.486 10-10 10S5 20.514 5 15 9.486 5 15 5z' fill='%23ffffff' fill-opacity='0.3'/%3E%3C/svg%3E')", backgroundSize: "12px 12px"}}></div>
        
        <div className="container mx-auto px-2 md:px-4 flex justify-end items-center">
          <div className="flex items-center space-x-4 md:space-x-6 text-white text-xs md:text-sm">
            <a href="tel:+13266004246" className="text-white hover:text-white/80 whitespace-nowrap flex-shrink-0">
              (326) 600-4246
            </a>
            <div className="flex items-center space-x-3">
              <a href="https://instagram.com/blvdparkhtx" target="_blank" rel="noopener noreferrer" className="text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a href="https://facebook.com/blvdparkhtx" target="_blank" rel="noopener noreferrer" className="text-white">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <header 
        className={`fixed left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled ? 'top-0' : 'top-7 md:top-7'
        } ${
          isScrolled ? 'bg-white/90 backdrop-blur-md shadow-lg py-3' : 'bg-white/60 backdrop-blur-lg py-5 shadow-md'
        }`}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <a href="/" className="relative block group flex items-center my-auto">
              <img 
                src="/images/logos/blvd-park-logo.png" 
                alt="BLVD Park Logo" 
                className={`h-auto w-auto transition-all duration-500 ${
                  isScrolled ? 'max-w-[120px]' : 'max-w-[150px] md:max-w-[165px] lg:max-w-[180px]'
                }`}
              />
            </a>
            
            {/* Desktop Navigation */}
            <nav className="hidden xl:flex items-center space-x-8">
              {navLinks.map((link) => (
                <a 
                  key={link.path} 
                  href={link.path} 
                  className="font-medium text-base text-blvd-dark relative transition-all duration-500 hover:text-blvd-dark group"
                >
                  {link.name}
                  <span className="absolute bottom-[-4px] left-0 w-0 h-[2px] bg-blvd-green transition-all duration-300 group-hover:w-full"></span>
                </a>
              ))}
              <a 
                href="/book" 
                className="bg-blvd-green text-white font-medium rounded-md shadow-lg transition-all duration-500 text-sm py-2 px-4 hover:bg-blvd-dark-green hover:transform hover:-translate-y-1 hover:shadow-xl"
              >
                <span className="relative z-10">Book at BLVD</span>
              </a>
            </nav>
            
            {/* Mobile Menu Button */}
            <button 
              onClick={() => setIsOpen(!isOpen)} 
              className="xl:hidden p-2 relative z-50 group flex items-center justify-center my-auto"
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-blvd-dark group-hover:text-blvd-green transition-colors duration-300 flex-shrink-0">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-blvd-dark group-hover:text-blvd-green transition-colors duration-300 flex-shrink-0">
                  <line x1="4" x2="20" y1="12" y2="12"></line>
                  <line x1="4" x2="20" y1="6" y2="6"></line>
                  <line x1="4" x2="20" y1="18" y2="18"></line>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu with Framer Motion Animations */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 bg-white/95 backdrop-blur-md z-[45] flex items-center justify-center overflow-y-auto"
          >
            {/* Standard X close button in top-right */}
            <motion.button
              onClick={() => setIsOpen(false)}
              className="absolute top-8 right-8 text-black p-2"
              aria-label="Close menu"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </motion.button>
            
            {/* Centered content container */}
            <motion.div
              className="flex flex-col items-center max-w-md w-full px-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
            >
              {/* BLVD Logo */}
              <motion.div
                className="mb-8"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <img
                  src="/images/logos/blvd-park-logo.png"
                  alt="BLVD Park Logo"
                  className="h-auto max-w-[180px]"
                />
              </motion.div>
              
              <nav className="flex flex-col items-center justify-center space-y-4 w-full text-xl">
                {navLinks.map((link, index) => (
                  <motion.a
                    key={link.path}
                    href={link.path}
                    className="font-medium text-blvd-dark relative inline-block py-1 group"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * (index + 1) }}
                    onClick={() => setIsOpen(false)}
                  >
                    {link.name}
                    <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-0 h-[2px] bg-blvd-green transition-all duration-300 group-hover:w-4/5"></span>
                  </motion.a>
                ))}
                
                <motion.a
                  href="/book"
                  className="bg-blvd-green text-white font-medium rounded-md w-full max-w-[250px] text-center py-2 px-6 mt-4 transition-all duration-300 hover:bg-blvd-dark-green hover:shadow-lg"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * (navLinks.length + 1) }}
                  onClick={() => setIsOpen(false)}
                >
                  Book at BLVD
                </motion.a>
                
                {/* Social Media Icons */}
                <motion.div
                  className="flex items-center space-x-6 mt-4"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * (navLinks.length + 2) }}
                >
                  <a href="https://instagram.com/blvdparkhtx" target="_blank" rel="noopener noreferrer" className="text-blvd-green hover:text-blvd-accent transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect>
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line>
                    </svg>
                  </a>
                  <a href="https://facebook.com/blvdparkhtx" target="_blank" rel="noopener noreferrer" className="text-blvd-green hover:text-blvd-accent transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                    </svg>
                  </a>
                </motion.div>
                
                {/* Contact Info */}
                <motion.div
                  className="flex flex-col items-center space-y-2 mt-3 text-base text-gray-700"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * (navLinks.length + 3) }}
                >
                  <a href="tel:+13266004246" className="hover:text-blvd-green transition-colors">
                    (326) 600-4246
                  </a>
                  <p>1119 W 20th St., Houston, TX</p>
                </motion.div>
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spacer to prevent content from being hidden under fixed header and green bar */}
      <div className={`${isScrolled ? 'h-[80px]' : 'h-[127px]'} transition-all duration-300`}></div>
    </>
  );
};

export default NavbarReact;