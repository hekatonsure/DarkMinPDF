// Debug script - paste this in the service worker console to check DNR rules

console.log('=== PDF Viewer Debug Info ===');

// 1. Check dynamic rules
chrome.declarativeNetRequest.getDynamicRules().then(rules => {
  console.log('Dynamic DNR Rules:', rules.length);
  rules.forEach(rule => {
    console.log('Rule ID:', rule.id);
    console.log('  Priority:', rule.priority);
    console.log('  Condition:', rule.condition);
    console.log('  Action:', rule.action);
  });
});

// 2. Check static rules
chrome.declarativeNetRequest.getSessionRules().then(rules => {
  console.log('Session DNR Rules:', rules.length);
  rules.forEach(rule => console.log(rule));
});

// 3. Check permissions
chrome.permissions.getAll().then(perms => {
  console.log('Permissions:', perms.permissions);
  console.log('Host Permissions:', perms.origins);
});

// 4. Test if rule matches
const testUrl = 'https://example.com/test.pdf';
console.log('Testing URL:', testUrl);
console.log('Should match regex:', /^https?:\/\/.*\.pdf(\?.*)?$/.test(testUrl));
