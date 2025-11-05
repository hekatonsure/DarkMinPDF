# Testing Guide

## Quick Start Testing

### 1. Load the Extension

```bash
# Navigate to Chrome extensions
chrome://extensions/

# Enable Developer Mode (toggle top right)
# Click "Load unpacked"
# Select the `extension/` directory
```

### 2. Test with Sample PDFs

**Test URLs** (copy-paste into Chrome address bar):

```
# Small PDF (good for initial test)
https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf

# Mozilla PDF.js test files
https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf

# W3C spec (larger PDF)
https://www.w3.org/TR/WCAG20/WCAG20.pdf

# Research paper (multi-column layout)
https://arxiv.org/pdf/1706.03762.pdf
```

### 3. Feature Testing Checklist

#### Basic Functionality
- [ ] PDF loads and displays correctly
- [ ] Pages render with correct aspect ratio
- [ ] Scrolling is smooth
- [ ] Page counter shows correct page number
- [ ] Download button works

#### Theme Testing
- [ ] Light theme displays correctly (default)
- [ ] Dark theme inverts colors properly
- [ ] Sepia theme applies correctly
- [ ] "Invert colors" checkbox works in each theme
- [ ] Theme persists after closing/reopening
- [ ] Settings dropdown opens/closes

#### UI Interactions
- [ ] Hover over left gutter shows page counter
- [ ] Hover over right gutter shows controls
- [ ] UI auto-hides after 4 seconds on first load
- [ ] UI auto-hides after moving mouse away
- [ ] Settings button toggles dropdown

#### Navigation
- [ ] Page counter input allows jumping to specific page
- [ ] Scrolling updates page counter
- [ ] Browser back button works (returns to previous page)

#### Search (Ctrl+F / Cmd+F)
- [ ] Search box appears
- [ ] Can find text across pages
- [ ] Highlights appear on found text
- [ ] Next/previous works

#### Print (Ctrl+P / Cmd+P)
- [ ] Small PDFs (<100 pages) trigger print dialog
- [ ] Print preview shows all pages
- [ ] Large PDFs (>100 pages) trigger download instead
- [ ] Print output is high quality

#### Performance
- [ ] Small PDFs (<25 pages) load quickly
- [ ] Large PDFs (>200 pages) don't freeze browser
- [ ] Memory usage stays reasonable
- [ ] Scrolling remains smooth with large PDFs
- [ ] Only visible pages + buffer are rendered

#### Error Handling
- [ ] Invalid URL shows error message
- [ ] CORS-blocked PDFs show helpful error
- [ ] Network errors show error + download option

## Advanced Testing

### Local File Testing

1. Enable file URL access:
   ```
   chrome://extensions/ → PDF Viewer → Details → Allow access to file URLs
   ```

2. Test with local PDF:
   ```
   file:///path/to/your/local/file.pdf
   ```

### Cross-Origin Testing

Test PDFs from different domains to verify `<all_urls>` permission works.

### Edge Cases

1. **Very small PDF (1 page)**
   - Test buffering behaves correctly

2. **Very large PDF (500+ pages)**
   - Test memory doesn't explode
   - Test page counter works
   - Test jump-to-page works

3. **PDF with forms**
   - Forms should display but won't be editable

4. **PDF with annotations**
   - Annotations should be visible

5. **Landscape vs Portrait**
   - Test both orientations

6. **Different zoom levels**
   - Browser zoom (Ctrl +/-) should work
   - UI should scale proportionally

### Browser Testing

Test in different Chrome-based browsers:
- [ ] Google Chrome
- [ ] Microsoft Edge (Chromium)
- [ ] Brave
- [ ] Opera

## Performance Profiling

### Memory Test

1. Open Chrome Task Manager (`Shift+Esc`)
2. Load a large PDF (100+ pages)
3. Monitor memory usage as you scroll
4. Verify memory doesn't continuously increase

### Render Performance

1. Open DevTools (`F12`)
2. Go to Performance tab
3. Start recording
4. Scroll through PDF
5. Stop recording
6. Verify:
   - FPS stays above 30
   - No long tasks (>50ms)
   - Throttled functions work as expected

## Debugging

### View Extension Logs

1. Right-click on viewer page
2. Click "Inspect"
3. Check Console for errors

### View Background Logs

1. Go to `chrome://extensions/`
2. Find "PDF Viewer with Dark Mode"
3. Click "service worker" link
4. Check Console

### Common Issues

**PDF doesn't load:**
- Check Console for errors
- Verify URL ends in `.pdf`
- Check if CORS is blocking (red error in Console)

**UI doesn't show:**
- Hover over left/right edges
- Check if CSS loaded (Inspect → Elements)

**Theme doesn't persist:**
- Check `chrome://storage-internals`
- Look for extension ID
- Verify `pdfTheme` key exists

**Performance issues:**
- Check if too many canvases rendered
- Verify page buffer is working
- Check memory in Task Manager

## Automated Testing (Future)

Potential test automation:

```javascript
// Example Puppeteer test
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      `--disable-extensions-except=./extension`,
      `--load-extension=./extension`
    ]
  });

  const page = await browser.newPage();
  await page.goto('https://example.com/test.pdf');

  // Wait for viewer to load
  await page.waitForSelector('.page');

  // Test page count
  const pageCount = await page.$eval('#total', el => el.textContent);
  console.log('Page count:', pageCount);

  // Test theme change
  await page.click('#settings-button');
  await page.click('[data-theme="dark"]');

  // Verify theme applied
  const theme = await page.$eval('body', el => el.getAttribute('theme'));
  console.assert(theme === 'dark', 'Theme should be dark');

  await browser.close();
})();
```

## Regression Testing

Before each release, run through:
1. All items in Feature Testing Checklist
2. Test 5+ different PDFs
3. Test all themes
4. Test on 2+ browsers
5. Test local file support
6. Check for console errors

## Reporting Issues

When reporting issues, include:
- Browser version (`chrome://version/`)
- Extension version
- PDF URL (if public)
- Steps to reproduce
- Console errors (if any)
- Screenshot/video
