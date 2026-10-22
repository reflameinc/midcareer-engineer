'use strict';
// Booking happens in the embedded form (#reflame-booking); the CTAs only scroll there.
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

// The embedded booking form renders in a shadow root, so lift its 11-13px labels to 14px on phones here.
(function liftBookingFontSize(){
  const css = '@media (max-width:760px){label,.step,.fe,.wk-lbl,.wk-hint,.wk-head .wk-dow,.date,.who-bio,.who-back{font-size:14px!important}}';
  let tries = 0;
  (function wait(){
    const root = document.getElementById('reflame-booking-widget')?.shadowRoot;
    if (!root) { if (++tries < 120) setTimeout(wait, 250); return; }
    const paint = () => {
      if (root.getElementById('rf-font-14')) return;
      const style = document.createElement('style');
      style.id = 'rf-font-14';
      style.textContent = css;
      root.appendChild(style);
    };
    paint();
    new MutationObserver(paint).observe(root, {childList:true});
  })();
})();
