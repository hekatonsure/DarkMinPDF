// Content script to detect PDF navigations
// Runs on all pages to help intercept PDF loads

(function() {
  'use strict';

  // Detect if current page is trying to load a PDF
  if (document.contentType === 'application/pdf') {
    console.log('PDF Viewer: Content script detected PDF content type');
  }

  // Check if URL looks like a PDF
  if (window.location.href.match(/\.pdf(\?.*)?$/i)) {
    console.log('PDF Viewer: Content script detected PDF URL pattern');
  }

})();
