'use strict';
// Booking happens in the step form (assets/stepform.js inside #reflame-booking); the CTAs only scroll there.
// The form reads utm/fbclid from this page's URL and sends the booking event itself,
// so never push a booking event here (it would be counted twice).

// Keep the sticky action clear of both visible reservation actions.
const stickyAction = document.querySelector('.sticky-cta');
const mainBookingAction = document.querySelector('[data-position="hero"]');
const finalBookingSection = document.getElementById('reservation');
if ('IntersectionObserver' in window) {
  const visibleBookingAreas = new Set();
  const bookingVisibility = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleBookingAreas.add(entry.target);
      else visibleBookingAreas.delete(entry.target);
    }
    stickyAction.hidden = visibleBookingAreas.size > 0;
  }, {threshold:0});
  bookingVisibility.observe(mainBookingAction);
  bookingVisibility.observe(finalBookingSection);
} else { stickyAction.hidden = false; }

