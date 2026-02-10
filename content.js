// content.js - Keep Netflix tabs alive
console.log("Netflix Injector content script loaded");

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PING") {
        sendResponse({ alive: true });
    }
    return true;
});