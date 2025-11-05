// PDF Viewer for Chrome Extension - Adapted from Min Browser
// Uses PDF.js with Min's buffering and rendering logic

import * as pdfjsLib from '../pdfjs/pdf.min.mjs';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdfjs/pdf.worker.min.mjs');

// Get PDF URL from hash (set by DNR redirect)
const urlHash = window.location.hash.slice(1);
const pdfUrl = urlHash ? decodeURIComponent(urlHash) : null;

if (!pdfUrl) {
  document.body.innerHTML = '<div style="padding: 2em; text-align: center;">No PDF URL provided</div>';
  throw new Error('No PDF URL in hash');
}

// Clean up URL bar
history.replaceState(null, '', window.location.pathname + '?file=' + encodeURIComponent(pdfUrl));

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

settingsButton.addEventListener('click', () => {
  settingsDropdown.hidden = !settingsDropdown.hidden;
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

// UI visibility controls
document.querySelectorAll('.side-gutter').forEach(el => {
  el.addEventListener('mouseenter', showViewerUI);
  el.addEventListener('mouseleave', hideViewerUI);
});

function showViewerUI() {
  document.querySelectorAll('.viewer-ui').forEach(el => el.classList.remove('hidden'));
  pageCounter.update();
}

const hideViewerUI = debounce(function() {
  if (!document.querySelector('.side-gutter:hover') && settingsDropdown.hidden) {
    document.querySelectorAll('.viewer-ui').forEach(el => el.classList.add('hidden'));
  }
}, 600);

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

function createContainer() {
  const el = document.createElement('div');
  el.classList.add('page-container');
  document.body.appendChild(el);
  return el;
}

// PDF rendering variables
let pdf = null;
let pageViews = [];
let pageCount = 0;
let currentPage = null;
let pageBuffer = 15;

// Simple page rendering (without full PDFPageView - we'll use canvas directly)
async function renderPage(page, pageNumber) {
  const container = createContainer();

  // Calculate scale
  let scale = 1.15;
  const minimumPageWidth = 625;

  let viewport = page.getViewport({ scale });

  if (viewport.width * 1.5 > window.innerWidth) {
    scale = (window.innerWidth / viewport.width) * 0.75;
    viewport = page.getViewport({ scale });
  }

  if (viewport.width * 1.33 < minimumPageWidth) {
    scale = (minimumPageWidth / viewport.width) * scale * 0.75;
    viewport = page.getViewport({ scale });
  }

  if (pageCount > 200) {
    scale = Math.min(scale, 1.1);
    viewport = page.getViewport({ scale });
  }

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
    pageNumber
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

  // Simple text layer rendering
  textContent.items.forEach(item => {
    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = item.transform[4] + 'px';
    span.style.top = item.transform[5] + 'px';
    span.style.fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]) + 'px';
    textLayer.appendChild(span);
  });
}

const updateCachedPages = throttle(function() {
  if (currentPage == null) return;

  if (!pageViews[currentPage].canvas) {
    drawPageCanvas(pageViews[currentPage]);
  }

  for (let i = 0; i < pageViews.length; i++) {
    if (i === currentPage) continue;

    if (Math.abs(i - currentPage) > pageBuffer && pageViews[i].canvas) {
      pageViews[i].canvas.remove();
      pageViews[i].canvas = null;
    }

    if (Math.abs(i - currentPage) < pageBuffer && !pageViews[i].canvas) {
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

    // Render all pages
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
    document.body.innerHTML = `
      <div style="padding: 2em; text-align: center;">
        <h2>Error loading PDF</h2>
        <p>${err.message}</p>
        <button onclick="chrome.downloads.download({url: '${pdfUrl}', saveAs: true})">Download PDF</button>
      </div>
    `;
  });
