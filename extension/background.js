// Background service worker for PDF viewer
// Copied from Mozilla PDF.js MV3 implementation

"use strict";

const VIEWER_URL = chrome.runtime.getURL('viewer/index.html');

// Use storage.session to ensure DNR rules are registered at least once per session
chrome.storage.session.get({ hasPdfRedirector: false }, async items => {
  if (items?.hasPdfRedirector) {
    return;
  }
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  if (rules.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map(r => r.id),
    });
  }
  await registerPdfRedirectRule();
  chrome.storage.session.set({ hasPdfRedirector: true });
});

/**
 * Registers declarativeNetRequest rules to redirect PDF requests to the viewer.
 * Based directly on PDF.js implementation.
 */
async function registerPdfRedirectRule() {
  const ACTION_IGNORE_OTHER_RULES = { type: "allow" };

  const ACTION_REDIRECT_TO_VIEWER = {
    type: "redirect",
    redirect: {
      regexSubstitution: VIEWER_URL + "?file=\\0",
    },
  };

  // Rules in order of priority (highest priority rule first).
  const addRules = [
    {
      // Do not redirect for URLs containing pdfjs.action=download.
      condition: {
        urlFilter: "pdfjs.action=download",
        resourceTypes: ["main_frame", "sub_frame"],
      },
      action: ACTION_IGNORE_OTHER_RULES,
    },
    {
      // Redirect local PDF files
      condition: {
        regexFilter: "^file://.*\\.pdf$",
        resourceTypes: ["main_frame", "sub_frame"],
      },
      action: ACTION_REDIRECT_TO_VIEWER,
    },
    {
      // Respect Content-Disposition:attachment in sub_frame
      condition: {
        urlFilter: "*",
        resourceTypes: ["sub_frame"],
        responseHeaders: [
          {
            header: "content-disposition",
            values: ["attachment*"],
          },
        ],
      },
      action: ACTION_IGNORE_OTHER_RULES,
    },
    {
      // Respect Content-Disposition:attachment in main_frame (allow download)
      condition: {
        urlFilter: "*",
        resourceTypes: ["main_frame"],
        responseHeaders: [
          {
            header: "content-disposition",
            values: ["attachment*"],
          },
        ],
      },
      action: ACTION_IGNORE_OTHER_RULES,
    },
    {
      // KEY RULE: Regular http(s) PDF requests based on Content-Type header
      condition: {
        regexFilter: "^.*$",
        excludedRequestMethods: ["post"],
        resourceTypes: ["main_frame", "sub_frame"],
        responseHeaders: [
          {
            header: "content-type",
            values: ["application/pdf", "application/pdf;*"],
          },
        ],
      },
      action: ACTION_REDIRECT_TO_VIEWER,
    },
    {
      // Wrong MIME-type but .pdf in URL
      condition: {
        regexFilter: "^.*\\.pdf\\b.*$",
        excludedRequestMethods: ["post"],
        resourceTypes: ["main_frame", "sub_frame"],
        responseHeaders: [
          {
            header: "content-type",
            values: ["application/octet-stream", "application/octet-stream;*"],
          },
        ],
      },
      action: ACTION_REDIRECT_TO_VIEWER,
    },
    {
      // Wrong MIME-type but .pdf in Content-Disposition
      condition: {
        regexFilter: "^.*$",
        excludedRequestMethods: ["post"],
        resourceTypes: ["main_frame", "sub_frame"],
        responseHeaders: [
          {
            header: "content-disposition",
            values: ["*.pdf", '*.pdf"*', "*.pdf'*"],
          },
        ],
        excludedResponseHeaders: [
          {
            header: "content-type",
            excludedValues: [
              "application/octet-stream",
              "application/octet-stream;*",
            ],
          },
        ],
      },
      action: ACTION_REDIRECT_TO_VIEWER,
    },
  ];

  // Assign IDs and priorities
  for (const [i, rule] of addRules.entries()) {
    rule.id = i + 1;
    rule.priority = addRules.length - i;
  }

  try {
    // Check if responseHeaders is supported (Chrome 128+)
    if (!(await isHeaderConditionSupported())) {
      throw new Error("DNR responseHeaders condition is not supported (requires Chrome 128+)");
    }
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
    console.log('PDF Viewer: Registered', addRules.length, 'DNR rules with header conditions');
  } catch (e) {
    console.error("PDF Viewer: Failed to register rules:", e);
    console.log("PDF Viewer: Falling back to basic .pdf URL matching");

    // Fallback: simple rules without responseHeaders
    const fallbackRules = [
      {
        id: 1,
        priority: 100,
        condition: {
          regexFilter: "^https?://.*\\.pdf(\\?.*)?$",
          resourceTypes: ["main_frame"],
        },
        action: ACTION_REDIRECT_TO_VIEWER,
      },
      {
        id: 2,
        priority: 100,
        condition: {
          regexFilter: "^file://.*\\.pdf$",
          resourceTypes: ["main_frame"],
        },
        action: ACTION_REDIRECT_TO_VIEWER,
      },
    ];
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: fallbackRules });
    console.log('PDF Viewer: Registered', fallbackRules.length, 'fallback DNR rules');
  }
}

// Check if responseHeaders condition is supported (Chrome 128+)
async function isHeaderConditionSupported() {
  const ruleId = 123456;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [
        {
          id: ruleId,
          condition: {
            responseHeaders: [{ header: "whatever" }],
            urlFilter: "|does_not_match_anything",
          },
          action: { type: "block" },
        },
      ],
    });
  } catch {
    return false;
  }

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [
        {
          id: ruleId,
          condition: {
            responseHeaders: [],
            urlFilter: "|does_not_match_anything",
          },
          action: { type: "block" },
        },
      ],
    });
    return false;
  } catch {
    return true;
  } finally {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
    });
  }
}

function getViewerURL(pdf_url) {
  let hash = "";
  const i = pdf_url.indexOf("#");
  if (i > 0) {
    hash = pdf_url.slice(i);
    pdf_url = pdf_url.slice(0, i);
  }
  return VIEWER_URL + "?file=" + encodeURIComponent(pdf_url) + hash;
}

// Fallback for file:// URLs when file access not granted
chrome.webNavigation.onBeforeNavigate.addListener(
  function (details) {
    if (details.frameId === 0) {
      chrome.extension.isAllowedFileSchemeAccess(function (isAllowedAccess) {
        if (isAllowedAccess) {
          return;
        }
        chrome.tabs.update(details.tabId, {
          url: getViewerURL(details.url),
        });
      });
    }
  },
  {
    url: [
      { urlPrefix: "file://", pathSuffix: ".pdf" },
      { urlPrefix: "file://", pathSuffix: ".PDF" },
    ],
  }
);

// Handle messages from debug page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'reregisterRules') {
    console.log('PDF Viewer: Re-registration requested');
    registerPdfRedirectRule()
      .then(() => {
        sendResponse({ success: true, message: 'Rules re-registered successfully' });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

console.log('PDF Viewer: Background service worker initialized');
