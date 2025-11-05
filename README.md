# PDF Viewer Chrome Extension with Dark Mode

A Chrome extension that intercepts PDF files and displays them in a custom viewer with dark mode support. Built using PDF.js and adapted from Min Browser's viewer implementation.

## Features

- **Dark Mode**: Three theme options (Light, Sepia, Dark) with invert colors option
- **Smart Rendering**: Lazy page loading with intelligent buffering (from Min Browser)
- **Memory Efficient**: Only renders visible pages and nearby buffer
- **Search Support**: Text layer for in-page search (Ctrl+F)
- **Download**: Easy download of original PDF
- **Print Support**: Print PDFs directly from viewer
- **Persistent Settings**: Theme preferences saved across sessions

## Project Structure

```
extension/
├── manifest.json              # MV3 manifest
├── rules/
│   └── pdf-redirect.json     # DNR rules for .pdf URL interception
├── viewer/
│   ├── index.html            # Viewer UI (adapted from Min)
│   ├── viewer.css            # Styles with theme support (from Min)
│   └── viewer.js             # Main viewer logic (Min's buffering + PDF.js)
├── pdfjs/                    # PDF.js library files
│   ├── pdf.min.mjs
│   └── pdf.worker.min.mjs
└── assets/
    └── icons/                # Extension icons
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

## Installation

### Development Installation

1. Clone this repository:
   ```bash
   git clone <your-repo-url>
   cd pdf-browser-chrome-extension
   ```

2. Install dependencies (only needed for PDF.js):
   ```bash
   npm install
   ```

3. The `extension/pdfjs/` directory should already have the PDF.js files. If not:
   ```bash
   cp node_modules/pdfjs-dist/build/pdf.min.mjs extension/pdfjs/
   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs extension/pdfjs/
   ```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension/` directory

5. Enable file URL access (optional, for local PDF files):
   - Go to `chrome://extensions/`
   - Find "PDF Viewer with Dark Mode"
   - Click "Details"
   - Enable "Allow access to file URLs"

## Usage

### Automatic Interception

The extension automatically intercepts URLs ending in `.pdf` and displays them in the custom viewer.

**Example URLs to test:**
- https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
- Any PDF link on the web

### Local Files

1. Enable "Allow access to file URLs" (see installation step 5)
2. Navigate to `file:///path/to/your/file.pdf` in Chrome
3. The extension will open it in the viewer

### Theme Controls

- **Access Settings**: Hover over the right side of the viewer to reveal controls
- **Change Theme**: Click the settings (⚙) button and select a theme circle:
  - White circle = Light theme
  - Tan circle = Sepia theme
  - Dark circle = Dark theme
- **Invert Colors**: Check "Invert colors" for additional color inversion (useful in dark theme)
- **Download**: Click the download (⬇) button to save the PDF

### Keyboard Shortcuts

- `Ctrl+F` / `Cmd+F`: Search within PDF
- `Ctrl+P` / `Cmd+P`: Print PDF
- `Page Up` / `Page Down`: Navigate pages

## Technical Details

### How It Works

1. **URL Interception**: The `declarativeNetRequest` API redirects `.pdf` URLs to the viewer
2. **URL Format**: `chrome-extension://<ID>/viewer/index.html#<original-url>`
3. **PDF Loading**: Viewer extracts URL from hash and loads via PDF.js
4. **Rendering**: Uses Min Browser's buffering strategy:
   - Buffer 15 pages for small PDFs (<25 pages)
   - Buffer 4 pages for large PDFs (≥25 pages)
   - Only render visible pages + buffer
   - Destroy canvases outside buffer range

### MV3 Limitations

**What works:**
- ✅ URLs ending in `.pdf` (e.g., `example.com/file.pdf`)
- ✅ Cross-origin PDFs (with `<all_urls>` permission)
- ✅ Local files (with "file URLs" permission)

**What doesn't work:**
- ❌ URLs without `.pdf` extension but with `Content-Type: application/pdf`
  - **Why**: MV3's DNR can't intercept based on response headers
  - **Workaround**: Right-click → "Save link as..." → Open local file

### Performance Optimizations (from Min)

- **Throttled scroll** (50ms): Updates visible pages efficiently
- **Debounced resize** (750ms): Only redraws on devicePixelRatio change
- **Lazy text layers**: Uses `requestIdleCallback` for off-screen pages
- **Visibility culling**: Hides pages outside viewport
- **Smart print**: Prevents rendering >100 pages (offers download instead)

## Development

### Code Attribution

This extension adapts code from:
- **Min Browser** ([minbrowser/min](https://github.com/minbrowser/min)): Viewer UI, CSS themes, buffering logic
- **PDF.js** ([mozilla/pdf.js](https://github.com/mozilla/pdf.js)): PDF rendering engine

### Key Files

| File | Purpose | Adapted From |
|------|---------|--------------|
| `viewer/index.html` | UI structure | Min's `pages/pdfViewer/index.html` |
| `viewer/viewer.css` | Themes & styles | Min's `pages/pdfViewer/viewer.css` |
| `viewer/viewer.js` | Main logic | Min's buffering + PDF.js API |
| `rules/pdf-redirect.json` | URL interception | Custom (MV3-specific) |

### Building for Production

1. Update `manifest.json`:
   - Change version number
   - Add proper `name` and `description`
   - Review permissions

2. Replace placeholder icons:
   - Create proper 16x16, 48x48, 128x128 PNG icons
   - Place in `extension/assets/icons/`

3. Test thoroughly:
   - Test various PDF sizes (small, large, 100+ pages)
   - Test cross-origin PDFs
   - Test all themes
   - Test print functionality
   - Test on different screen sizes

4. Package extension:
   ```bash
   cd extension
   zip -r ../pdf-viewer-extension.zip .
   ```

5. Submit to Chrome Web Store (optional)

## Known Issues

1. **MIME-type limitation**: URLs without `.pdf` won't be intercepted
2. **CORS errors**: Some servers may block cross-origin requests from extensions
3. **Very large PDFs**: May cause memory issues on low-end devices
4. **Text layer positioning**: Simplified implementation may have minor alignment issues

## License

- Original Min Browser code: Apache 2.0 License
- PDF.js: Apache 2.0 License
- This extension: MIT License (see LICENSE file)

## Credits

- **Min Browser** team for the excellent viewer implementation
- **Mozilla** for PDF.js
- Inspired by the need for a simple, privacy-focused PDF viewer with dark mode

## Support

For issues or questions:
1. Check the [Known Issues](#known-issues) section
2. Review Chrome extension docs: https://developer.chrome.com/docs/extensions/
3. Check PDF.js docs: https://mozilla.github.io/pdf.js/

## Future Enhancements

Potential improvements:
- [ ] Context menu "Open with PDF Viewer" for non-.pdf URLs
- [ ] Annotation support
- [ ] Bookmarks sidebar
- [ ] Page thumbnails
- [ ] Zoom controls UI
- [ ] Rotation controls
- [ ] Custom keyboard shortcuts
- [ ] Export to different formats
