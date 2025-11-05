# DarkMinPDF

A Chrome extension PDF viewer ported from [Min Browser's PDF viewer](https://github.com/minbrowser/min) with dark mode themes. Uses Mozilla's [PDF.js](https://github.com/mozilla/pdf.js) for rendering.

## Credits

**This extension is primarily a port of existing open-source code:**

- **Viewer UI & Logic**: Ported from [Min Browser](https://github.com/minbrowser/min/tree/master/pages/pdfViewer) (Apache 2.0)
  - HTML structure, CSS themes, and buffering logic
  - Smart page rendering and memory management
  - Theme support (light/sepia/dark with color inversion)

- **PDF Rendering**: [Mozilla PDF.js](https://github.com/mozilla/pdf.js) (Apache 2.0)
  - Core PDF parsing and rendering engine
  - Chrome extension integration patterns

- **URL Interception**: Adapted from [PDF.js Chrome extension](https://github.com/mozilla/pdf.js/tree/master/extensions/chromium)
  - Manifest V3 declarativeNetRequest implementation
  - Response header checking for Content-Type detection

**What was added/modified:**
- Chrome MV3 extension packaging and manifest
- Removal of Electron-specific code (IPC, main process handlers)
- Replaced Min's download handlers with `chrome.downloads` API
- Added zoom controls (+/- buttons with keyboard shortcuts)
- Simplified theme toggle UI

## Features

- **Dark Mode Themes**: Light, Sepia, and Dark with color inversion (from Min)
- **Smart Rendering**: Lazy page loading with intelligent buffering (from Min)
- **Memory Efficient**: Only renders visible pages + buffer zone (from Min)
- **Zoom Controls**: +/- buttons and keyboard shortcuts (Ctrl/Cmd +/-)
- **Search Support**: Text layer for in-page search (Ctrl+F)
- **Download & Print**: Direct PDF download and print support
- **Persistent Settings**: Theme preferences saved across sessions

## Requirements

- **Chrome 128+** (for full functionality with Content-Type header interception)
- Older Chrome versions (103+) will work but only intercept URLs ending in `.pdf`

## Installation

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/hekatonsure/pdf-browser-chrome-extension
   cd pdf-browser-chrome-extension
   ```

2. **Install PDF.js dependencies:**
   ```bash
   npm install
   ```
   *(PDF.js files should already be in `extension/pdfjs/`)*

3. **Load in Chrome:**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `extension/` directory

4. **Grant permissions when prompted**
   - The extension needs `<all_urls>` to intercept PDF requests

## Usage

### How It Works

The extension uses Chrome's `declarativeNetRequestWithHostAccess` API to intercept requests with `Content-Type: application/pdf` headers and redirect them to the custom viewer. This works similarly to how the official PDF.js Chrome extension operates.

### Automatic PDF Interception

PDFs are automatically opened in the viewer when you:
- Click a link to a PDF file
- Navigate directly to a PDF URL
- Download a PDF (it opens instead of downloading)

**Test URLs:**
```
https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf
```

### Controls

**Hover over the right side** to reveal the control panel:

- **⚙ Settings Button** (top right)
  - Click to toggle theme selector
  - Choose Light, Sepia, or Dark theme
  - Toggle color inversion

- **Zoom Controls** (middle)
  - `+` button to zoom in
  - `-` button to zoom out
  - Display shows current zoom percentage

- **⬇ Download Button** (bottom)
  - Download the original PDF file

**Keyboard Shortcuts:**
- `Ctrl/Cmd + +` / `Ctrl/Cmd + =` → Zoom in
- `Ctrl/Cmd + -` → Zoom out
- `Ctrl/Cmd + 0` → Reset zoom to 100%
- `Ctrl/Cmd + F` → Search in PDF
- `Ctrl/Cmd + P` → Print PDF

### Local Files

To open local PDF files:
1. Go to `chrome://extensions/`
2. Find "DarkMinPDF"
3. Click "Details"
4. Enable "Allow access to file URLs"
5. Open any `file:///path/to/file.pdf` in Chrome

## Project Structure

```
extension/
├── manifest.json              # MV3 manifest with DNR permissions
├── background.js              # Service worker (from PDF.js MV3 implementation)
├── contentscript.js           # Content script for PDF detection
├── viewer/
│   ├── index.html            # UI structure (adapted from Min)
│   ├── viewer.css            # Themes & styles (from Min)
│   ├── viewer.js             # Rendering logic (Min + PDF.js)
│   └── min-viewer-original.js # Original Min code (reference)
├── pdfjs/                    # PDF.js library
│   ├── pdf.min.mjs
│   └── pdf.worker.min.mjs
├── assets/icons/             # Extension icons
└── debug.html               # Debug tools for DNR rules
```

## Technical Details

### How PDF Interception Works

**Chrome 128+:**
- Uses `declarativeNetRequest` with `responseHeaders` conditions
- Checks for `Content-Type: application/pdf` header
- Intercepts ALL PDFs regardless of URL extension
- 7 DNR rules handle various edge cases (attachments, MIME types, etc.)

**Chrome 103-127:**
- Falls back to regex matching on URLs ending in `.pdf`
- Cannot detect PDFs served with wrong MIME types

### Key Implementation Differences from Min Browser

| Feature | Min Browser (Electron) | DarkMinPDF (Chrome Extension) |
|---------|------------------------|-------------------------------|
| IPC Communication | `ipc.send/on` | Removed (not needed) |
| Find in Page | Custom Electron API | PDF.js built-in text layer |
| Downloads | Main process handler | `chrome.downloads.download()` |
| URL Interception | Protocol handler | `declarativeNetRequest` |
| File Access | Always available | Requires permission grant |

### Performance Optimizations (from Min)

- **Page Buffering**: Renders 15 pages for small PDFs, 4 for large (>25 pages)
- **Visibility Culling**: Hides pages outside viewport
- **Lazy Loading**: Off-screen pages load via `requestIdleCallback`
- **Canvas Cleanup**: Destroys canvases outside buffer range
- **Print Guard**: Downloads instead of printing if >100 pages

## Known Limitations

1. **Chrome 128+ Required**: Full functionality (MIME-type detection) needs Chrome 128+
2. **Manifest V3 Restrictions**: Cannot use blocking `webRequest` API like old extensions
3. **CORS**: Some servers may block cross-origin PDF requests
4. **POST Requests**: PDF.js viewer re-fetches PDFs with GET, losing POST data
5. **No Form Editing**: Forms display but aren't editable

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Copy PDF.js files (if not already present)
cp node_modules/pdfjs-dist/build/pdf.min.mjs extension/pdfjs/
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs extension/pdfjs/

# Package for distribution
cd extension
zip -r ../darkminpdf.zip .
```

### Debugging

Open the debug page:
```
chrome-extension://<YOUR-EXTENSION-ID>/debug.html
```

Check service worker console:
1. Go to `chrome://extensions/`
2. Click "service worker" link
3. View DNR rule registration logs

## License

- **This extension**: MIT License
- **Min Browser**: Apache 2.0 License (original viewer code)
- **PDF.js**: Apache 2.0 License (rendering engine)

## Acknowledgments

This extension is built almost entirely from existing open-source projects:

- **Min Browser team** for their excellent PDF viewer implementation
- **Mozilla** for PDF.js and the Chrome extension reference implementation
- The original plan and architecture came from Min's pragmatic approach to PDF viewing

**If you like this extension, please star the original projects:**
- https://github.com/minbrowser/min
- https://github.com/mozilla/pdf.js
