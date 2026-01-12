// PDF Viewer for Chrome Extension - Adapted from Min Browser
// Uses PDF.js with Min's buffering and rendering logic

import * as pdfjsLib from '../pdfjs/pdf.min.mjs';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.min.mjs');

// Get PDF URL from query param (set by DNR redirect)
const urlParams = new URLSearchParams(window.location.search);
let pdfUrl = urlParams.get('file');

// Fallback: check hash if no query param (for backwards compatibility)
if (!pdfUrl) {
  const urlHash = window.location.hash.slice(1);
  pdfUrl = urlHash ? decodeURIComponent(urlHash) : null;
}

if (!pdfUrl) {
  document.body.innerHTML = '<div style="padding: 2em; text-align: center;">No PDF URL provided. Usage: viewer/index.html?file=<PDF_URL></div>';
  throw new Error('No PDF URL provided');
}

console.log('PDF Viewer: Loading PDF from', pdfUrl);

// PDF rendering variables - declare early to avoid hoisting issues
let pdf = null;
let pageViews = [];
let pageCount = 0;
let currentPage = null;
let pageBuffer = 15;
let desiredZoom = 1.0; // What the user wants (1.0 = 100%)
let baseRenderScale = 1.15; // Base scale used for initial rendering
let currentRenderScale = baseRenderScale; // Current render resolution
let lastZoomOriginY = 0; // Track zoom origin for consistent anchor across rerender

// Utility functions (from Min's viewer.js)
function debounce(fn, delay) {
  let timer = null;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(context, args), delay);
  };
}

function throttle(fn, threshold, scope) {
  threshold || (threshold = 250);
  let last, deferTimer;
  return function() {
    const context = scope || this;
    const now = +new Date();
    const args = arguments;
    if (last && now < last + threshold) {
      clearTimeout(deferTimer);
      deferTimer = setTimeout(() => {
        last = now;
        fn.apply(context, args);
      }, threshold);
    } else {
      last = now;
      fn.apply(context, args);
    }
  };
}

// Page counter UI
const pageCounter = {
  container: document.getElementById('page-counter'),
  input: document.querySelector('#page-counter input'),
  totalEl: document.getElementById('total'),

  init() {
    this.container.addEventListener('click', () => {
      this.input.focus();
      this.input.select();
    });

    this.input.addEventListener('change', (e) => {
      const pageIndex = parseInt(this.value) - 1;
      if (pageViews[pageIndex] && pageViews[pageIndex].div) {
        pageViews[pageIndex].div.scrollIntoView();
      }
      updateVisiblePages();
      this.update();
      this.input.blur();
    });
  },

  update() {
    if (currentPage !== null) {
      this.input.value = currentPage + 1;
      this.totalEl.textContent = pageCount;
    }
  }
};

pageCounter.init();

// Progress bar UI
const progressBar = {
  element: document.getElementById('progress-bar'),
  enabled: false,
  progress: 0,

  incrementProgress(amount) {
    this.progress += amount;

    if (!this.enabled) return;

    if (this.progress >= 1) {
      this.enabled = false;
      this.element.style.transform = 'translateX(0%)';
      setTimeout(() => {
        this.element.hidden = true;
      }, 200);
      return;
    }

    this.element.hidden = false;
    const width = this.progress * 90;
    this.element.style.transform = 'translateX(-' + (100 - width) + '%)';
  },

  init() {
    setTimeout(() => {
      if (!pdf) {
        this.enabled = true;
        this.incrementProgress(0.05);

        const loadingInterval = setInterval(() => {
          if (this.progress < 0.125) {
            this.incrementProgress(0.002);
          } else {
            clearInterval(loadingInterval);
          }
        }, 250);
      }
    }, 3000);
  }
};

progressBar.init();

// Download button
document.getElementById('download-button').addEventListener('click', () => {
  chrome.downloads.download({
    url: pdfUrl,
    saveAs: true
  });
});

// Settings button and dropdown
const settingsButton = document.getElementById('settings-button');
const settingsDropdown = document.getElementById('settings-dropdown');

settingsButton.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent document click handler from immediately closing
  settingsDropdown.hidden = !settingsDropdown.hidden;
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!settingsDropdown.hidden &&
      !settingsDropdown.contains(e.target) &&
      !settingsButton.contains(e.target)) {
    settingsDropdown.hidden = true;
  }
});

// Theme selector
const themeButtons = document.querySelectorAll('.theme-circle');
const invertCheckbox = document.getElementById('invert-pdf-checkbox');

// Load saved theme
chrome.storage.local.get(['pdfTheme', 'pdfInvert'], (result) => {
  const theme = result.pdfTheme || 'light';
  const invert = result.pdfInvert || false;
  applyTheme(theme, invert);
});

themeButtons.forEach(button => {
  button.addEventListener('click', () => {
    const theme = button.getAttribute('data-theme');
    themeButtons.forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');
    chrome.storage.local.set({ pdfTheme: theme });
    applyTheme(theme, invertCheckbox.checked);
  });
});

invertCheckbox.addEventListener('change', () => {
  chrome.storage.local.set({ pdfInvert: invertCheckbox.checked });
  applyTheme(document.body.getAttribute('theme'), invertCheckbox.checked);
});

function applyTheme(theme, invert) {
  document.body.setAttribute('theme', theme);
  document.body.setAttribute('data-invert', invert);
  invertCheckbox.checked = invert;

  // Update selected theme button
  themeButtons.forEach(btn => {
    if (btn.getAttribute('data-theme') === theme) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });

  // Add theme-loaded class for transitions
  setTimeout(() => {
    document.body.classList.add('theme-loaded');
  }, 100);
}

// Zoom controls
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelDisplay = document.getElementById('zoom-level');

function updateZoomDisplay() {
  zoomLevelDisplay.textContent = Math.round(desiredZoom * 100) + '%';
}

// Apply CSS zoom with compensation for render scale changes
function applyZoom() {
  // CSS zoom = desiredZoom / (currentRenderScale / baseRenderScale)
  // This compensates for render scale changes to maintain visual size
  const cssZoom = desiredZoom / (currentRenderScale / baseRenderScale);

  const pdfContainer = document.getElementById('pdf-container');
  if (pdfContainer) {
    // Set transform-origin to current viewport center so zoom feels natural
    // The Y origin is the scroll position + half viewport height (center of view)
    const originY = window.scrollY + window.innerHeight / 2;
    lastZoomOriginY = originY;  // Save for use in debouncedRerender
    pdfContainer.style.transformOrigin = `center ${originY}px`;
    pdfContainer.style.transform = `scale(${cssZoom})`;
  }
}

// Calculate what render scale we need for crisp display at a given zoom level
function getTargetRenderScale(zoom) {
  // The effective visual scale is renderScale * cssZoom
  // We want to render at higher resolution when zoomed in significantly
  // Thresholds determine when to bump up render quality
  if (zoom <= 0.75) return baseRenderScale * 0.5;
  if (zoom <= 1.25) return baseRenderScale;
  if (zoom <= 2.0) return baseRenderScale * 1.5;
  if (zoom <= 3.0) return baseRenderScale * 2.0;
  return baseRenderScale * 2.5; // Max render scale for 300%+ zoom
}

// Debounced function to re-render pages at a new scale
const debouncedRerender = debounce(async function(targetScale) {
  if (pageViews.length === 0) return;

  // Save old scale BEFORE changing it - needed to adjust coordinates
  const oldScale = currentRenderScale;
  currentRenderScale = targetScale;

  // Update ALL pages unconditionally (no threshold check)
  // This ensures all pages have the same renderScale
  for (const pageView of pageViews) {
    const newViewport = pageView.page.getViewport({ scale: targetScale });
    pageView.viewport = newViewport;
    pageView.renderScale = targetScale;
    pageView.width = newViewport.width;
    pageView.div.style.width = newViewport.width + 'px';
    pageView.div.style.height = newViewport.height + 'px';
    pageView.canvasWrapper.style.width = newViewport.width + 'px';
    pageView.canvasWrapper.style.height = newViewport.height + 'px';

    // Remove old text layer
    const oldTextLayer = pageView.div.querySelector('.textLayer');
    if (oldTextLayer) oldTextLayer.remove();
  }

  // Coordinate system changed! Must scale viewport CENTER position, not just scrollY
  const scaleRatio = targetScale / oldScale;

  // Disable transition for instant change (no animation stutter)
  const pdfContainer = document.getElementById('pdf-container');
  if (pdfContainer) {
    pdfContainer.style.transition = 'none';
  }

  // The content at viewport center scales, but viewport height doesn't
  const viewportCenterY = window.scrollY + window.innerHeight / 2;
  const newScrollY = viewportCenterY * scaleRatio - window.innerHeight / 2;
  window.scrollTo(0, Math.max(0, newScrollY));

  // Now use fresh viewport center as origin (same content is now centered)
  const newOriginY = window.scrollY + window.innerHeight / 2;
  lastZoomOriginY = newOriginY;  // Update for consistency

  // Apply CSS zoom with correct origin
  const cssZoom = desiredZoom / (currentRenderScale / baseRenderScale);
  if (pdfContainer) {
    pdfContainer.style.transformOrigin = `center ${newOriginY}px`;
    pdfContainer.style.transform = `scale(${cssZoom})`;

    // Force reflow then re-enable transition
    pdfContainer.offsetHeight;
    pdfContainer.style.transition = '';
  }
  updateGutterWidths();

  // Find all currently visible pages and ensure they have canvas
  const ih = window.innerHeight;
  const visiblePages = [];
  for (const pageView of pageViews) {
    const rect = pageView.div.getBoundingClientRect();
    // Page is visible if it overlaps with viewport
    if (rect.bottom > 0 && rect.top < ih) {
      visiblePages.push(pageView);
    }
  }

  // Redraw all visible pages (whether they had canvas or not)
  for (const pageView of visiblePages) {
    await drawPageCanvas(pageView);
  }

  // Also redraw other pages that had canvas (within buffer)
  for (const pageView of pageViews) {
    if (pageView.canvas && !visiblePages.includes(pageView)) {
      await drawPageCanvas(pageView);
    }
  }

  updateVisiblePages();
}, 300);

function setZoom(newZoom) {
  // Clamp zoom between 25% and 400%
  desiredZoom = Math.max(0.25, Math.min(4.0, newZoom));
  updateZoomDisplay();
  applyZoom();

  // Check if we need higher resolution rendering
  const targetScale = getTargetRenderScale(desiredZoom);
  if (pageViews.length > 0 && Math.abs(currentRenderScale - targetScale) > 0.1) {
    debouncedRerender(targetScale);
  }
}

zoomInBtn.addEventListener('click', () => {
  setZoom(desiredZoom + 0.1);
});

zoomOutBtn.addEventListener('click', () => {
  setZoom(desiredZoom - 0.1);
});

// Keyboard shortcuts for zoom - use capture phase to intercept Chrome's default zoom
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      e.stopPropagation();
      setZoom(desiredZoom + 0.1);
      return false;
    } else if (e.key === '-') {
      e.preventDefault();
      e.stopPropagation();
      setZoom(desiredZoom - 0.1);
      return false;
    } else if (e.key === '0') {
      e.preventDefault();
      e.stopPropagation();
      setZoom(1.0);
      return false;
    }
  }
}, { capture: true });

updateZoomDisplay();

// UI visibility controls
function showViewerUI() {
  document.querySelectorAll('.viewer-ui').forEach(el => el.classList.remove('hidden'));
  pageCounter.update();
}

const hideViewerUI = debounce(function() {
  if (!document.querySelector('.side-gutter:hover') && settingsDropdown.hidden) {
    document.querySelectorAll('.viewer-ui').forEach(el => el.classList.add('hidden'));
  }
}, 600);

document.querySelectorAll('.side-gutter').forEach(el => {
  el.addEventListener('mouseenter', showViewerUI);
  el.addEventListener('mouseleave', hideViewerUI);
});

function updateGutterWidths() {
  let gutterWidth;
  if (!pageViews[0]) {
    gutterWidth = 64;
  } else {
    gutterWidth = Math.round(Math.max(64, (window.innerWidth - pageViews[0].width) / 2)) - 2;
  }

  document.querySelectorAll('.side-gutter').forEach(el => {
    el.style.width = gutterWidth + 'px';
  });
}

// Create PDF container on page load
let pdfContainer = document.getElementById('pdf-container');
if (!pdfContainer) {
  pdfContainer = document.createElement('div');
  pdfContainer.id = 'pdf-container';
  document.body.appendChild(pdfContainer);
}

function createContainer() {
  const el = document.createElement('div');
  el.classList.add('page-container');
  pdfContainer.appendChild(el);  // Append to pdf-container instead of body
  return el;
}

// Simple page rendering (without full PDFPageView - we'll use canvas directly)
async function renderPage(page, pageNumber) {
  const container = createContainer();

  // Use document-wide currentRenderScale for all pages
  // This ensures uniform scale across the entire document
  const scale = currentRenderScale;
  const viewport = page.getViewport({ scale });

  // Create page div
  const pageDiv = document.createElement('div');
  pageDiv.className = 'page';
  pageDiv.style.width = viewport.width + 'px';
  pageDiv.style.height = viewport.height + 'px';

  // Create canvas wrapper
  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'canvasWrapper';
  canvasWrapper.style.width = viewport.width + 'px';
  canvasWrapper.style.height = viewport.height + 'px';

  pageDiv.appendChild(canvasWrapper);
  container.appendChild(pageDiv);

  // Store page info
  const pageView = {
    div: pageDiv,
    container,
    canvasWrapper,
    canvas: null,
    page,
    viewport,
    width: viewport.width,
    pageNumber,
    renderScale: scale  // Track what scale this page was rendered at
  };

  pageViews.push(pageView);

  return pageView;
}

async function drawPageCanvas(pageView) {
  if (pageView.canvas) {
    pageView.canvas.remove();
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = pageView.viewport.width * window.devicePixelRatio;
  canvas.height = pageView.viewport.height * window.devicePixelRatio;
  canvas.style.width = pageView.viewport.width + 'px';
  canvas.style.height = pageView.viewport.height + 'px';

  pageView.canvasWrapper.appendChild(canvas);
  pageView.canvas = canvas;

  const renderContext = {
    canvasContext: context,
    viewport: pageView.viewport,
    transform: [window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0]
  };

  await pageView.page.render(renderContext).promise;

  // Get text content for searchability
  const textContent = await pageView.page.getTextContent();
  const textLayer = document.createElement('div');
  textLayer.className = 'textLayer';
  textLayer.style.width = pageView.viewport.width + 'px';
  textLayer.style.height = pageView.viewport.height + 'px';
  pageView.div.appendChild(textLayer);

  // Render text layer with proper transforms
  const textLayerFrag = document.createDocumentFragment();
  const textDivs = [];

  for (const item of textContent.items) {
    if (item.str === undefined) {
      continue;
    }

    const tx = pdfjsLib.Util.transform(pageView.viewport.transform, item.transform);
    const angle = Math.atan2(tx[1], tx[0]);
    const fontSize = Math.hypot(tx[2], tx[3]);
    const style = {
      fontSize: `${fontSize}px`,
      fontFamily: item.fontName || 'sans-serif',
      left: `${tx[4]}px`,
      top: `${tx[5] - fontSize}px`
    };

    if (angle !== 0) {
      style.transform = `rotate(${angle}rad)`;
    }

    if (item.str.length > 1) {
      style.width = `${Math.hypot(tx[0], tx[1]) * item.width}px`;
    }

    const span = document.createElement('span');
    span.textContent = item.str;
    Object.assign(span.style, style);
    textLayerFrag.appendChild(span);
    textDivs.push(span);
  }

  textLayer.appendChild(textLayerFrag);
}

// Re-render a page at a new scale for better quality at high zoom
async function rerenderPageAtScale(pageView, newScale) {
  // Get new viewport at the new scale
  const newViewport = pageView.page.getViewport({ scale: newScale });

  // Update pageView properties
  pageView.viewport = newViewport;
  pageView.renderScale = newScale;
  pageView.width = newViewport.width;

  // Update div/canvas sizes
  pageView.div.style.width = newViewport.width + 'px';
  pageView.div.style.height = newViewport.height + 'px';
  pageView.canvasWrapper.style.width = newViewport.width + 'px';
  pageView.canvasWrapper.style.height = newViewport.height + 'px';

  // Remove old text layer if exists
  const oldTextLayer = pageView.div.querySelector('.textLayer');
  if (oldTextLayer) oldTextLayer.remove();

  // Re-draw canvas (which also rebuilds text layer)
  if (pageView.canvas) {
    await drawPageCanvas(pageView);
  }
}

const updateCachedPages = throttle(function() {
  if (currentPage == null) return;

  // Helper to ensure page scale is synced before drawing
  function syncPageScale(pageView) {
    if (pageView.renderScale !== currentRenderScale) {
      const newViewport = pageView.page.getViewport({ scale: currentRenderScale });
      pageView.viewport = newViewport;
      pageView.renderScale = currentRenderScale;
      pageView.width = newViewport.width;
      pageView.div.style.width = newViewport.width + 'px';
      pageView.div.style.height = newViewport.height + 'px';
      pageView.canvasWrapper.style.width = newViewport.width + 'px';
      pageView.canvasWrapper.style.height = newViewport.height + 'px';

      // Remove old text layer if scale changed
      const oldTextLayer = pageView.div.querySelector('.textLayer');
      if (oldTextLayer) oldTextLayer.remove();
    }
  }

  if (!pageViews[currentPage].canvas) {
    syncPageScale(pageViews[currentPage]);
    drawPageCanvas(pageViews[currentPage]);
  }

  for (let i = 0; i < pageViews.length; i++) {
    if (i === currentPage) continue;

    if (Math.abs(i - currentPage) > pageBuffer && pageViews[i].canvas) {
      pageViews[i].canvas.remove();
      pageViews[i].canvas = null;
    }

    if (Math.abs(i - currentPage) < pageBuffer && !pageViews[i].canvas) {
      // Ensure scale is synced before drawing
      syncPageScale(pageViews[i]);
      drawPageCanvas(pageViews[i]);
    }
  }
}, 500);

function updateVisiblePages() {
  const pageRects = pageViews.map(pv => pv.div.getBoundingClientRect());
  const ih = window.innerHeight + 80;
  const innerHeight = window.innerHeight;

  for (let i = 0; i < pageViews.length; i++) {
    const rect = pageRects[i];

    if (rect.bottom < -80 || rect.top > ih) {
      pageViews[i].div.style.visibility = 'hidden';
    } else {
      pageViews[i].div.style.visibility = 'visible';

      if ((rect.top >= 0 && (innerHeight - rect.top) > innerHeight / 2) ||
          (rect.bottom <= innerHeight && rect.bottom > innerHeight / 2) ||
          (rect.top <= 0 && rect.bottom >= innerHeight)) {
        currentPage = i;
      }
    }
  }

  if (currentPage !== null) {
    updateCachedPages();
  }
}

window.addEventListener('scroll', throttle(() => {
  pageCounter.update();
  updateVisiblePages();
}, 50));

window.addEventListener('resize', debounce(() => {
  updateVisiblePages();
  updateGutterWidths();
}, 750));

// Load the PDF
pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false })
  .promise
  .then(async (_pdf) => {
    pdf = _pdf;
    pageCount = pdf.numPages;

    if (pageCount < 25) {
      pageBuffer = 25;
    } else {
      pageBuffer = 4;
    }

    // Get metadata
    const metadata = await pdf.getMetadata();
    document.title = metadata.info.Title || pdfUrl.split('/').pop() || 'PDF Viewer';

    // Calculate initial scale BEFORE rendering any pages
    // This ensures all pages use the same renderScale from the start
    const firstPage = await pdf.getPage(1);
    const tempViewport = firstPage.getViewport({ scale: baseRenderScale });
    const targetWidth = window.innerWidth * 0.7;
    const initialZoom = Math.max(0.25, Math.min(4.0, targetWidth / tempViewport.width));
    desiredZoom = initialZoom;
    currentRenderScale = getTargetRenderScale(desiredZoom);
    updateZoomDisplay();
    applyZoom();

    // Render all pages with uniform scale
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      progressBar.incrementProgress(1 / pageCount);

      const pageView = await renderPage(page, i);

      if (i === 1) {
        updateGutterWidths();
      }

      // Draw canvas for pages in initial buffer
      if (i <= pageBuffer) {
        await drawPageCanvas(pageView);

        if (i === 1) {
          showViewerUI();
          setTimeout(hideViewerUI, 4000);
        }
      }
    }

    // Initial visibility update
    updateVisiblePages();
  })
  .catch(err => {
    console.error('Error loading PDF:', err);

    // Auth errors (401/403) - fallback to Chrome's native PDF viewer
    const isAuthError = err.status === 401 || err.status === 403;
    if (isAuthError) {
      const separator = pdfUrl.includes('?') ? '&' : '?';
      window.location.href = pdfUrl + separator + 'pdfjs.action=download';
      return;
    }

    // Other errors - show error UI
    document.body.innerHTML = `
      <div style="padding: 2em; text-align: center;">
        <h2>Error loading PDF</h2>
        <p>${err.message}</p>
        <button onclick="chrome.downloads.download({url: '${pdfUrl}', saveAs: true})">Download PDF</button>
      </div>
    `;
  });
