// content.js - Netflix Session Monitor & Auto-Recovery
console.log("Netflix Injector: Content script loaded on", window.location.href);

(function () {
    'use strict';

    // --- Session Health Detection ---
    const SESSION_INDICATORS = {
        // Elements that indicate the session is dead/logged out
        DEAD: [
            '[data-uia="login-page"]',
            '[data-uia="login-form"]',
            '.login-form',
            '.login-page',
            '[data-uia="nmhp-card-hero+informative_cta"]', // "Sign In" hero
        ],
        // Elements that indicate household/transfer block
        HOUSEHOLD_BLOCK: [
            '[data-uia="profile-gate"]',
            '[data-uia="household-modal"]',
            '.profile-gate-container',
            '[data-uia="update-primary-location"]',
            '[data-uia="transfer-profile"]',
        ],
        // Elements that indicate the session is working
        ACTIVE: [
            '[data-uia="browse-container"]',
            '.profiles-gate-container',
            '[data-uia="profile-list"]',
            '.watch-video',
            '.mainView',
        ]
    };

    let lastStatus = null;
    let checkInterval = null;

    function detectSessionState() {
        // Check for dead session indicators
        for (const selector of SESSION_INDICATORS.DEAD) {
            if (document.querySelector(selector)) {
                return "dead";
            }
        }

        // Check for household block
        for (const selector of SESSION_INDICATORS.HOUSEHOLD_BLOCK) {
            if (document.querySelector(selector)) {
                return "household_blocked";
            }
        }

        // Check for active session
        for (const selector of SESSION_INDICATORS.ACTIVE) {
            if (document.querySelector(selector)) {
                return "active";
            }
        }

        // Check URL patterns
        const url = window.location.href.toLowerCase();
        if (url.includes("/login") || url.includes("/signin")) {
            return "dead";
        }
        if (url.includes("/browse") || url.includes("/watch") || url.includes("/title")) {
            return "active";
        }
        if (url.includes("/YourAccount") || url.includes("/profiles")) {
            return "active";
        }

        return "unknown";
    }

    function reportStatus(status) {
        if (status === lastStatus) return;
        lastStatus = status;

        console.log(`Netflix Injector: Session status changed to "${status}"`);

        chrome.runtime.sendMessage({
            action: "SESSION_STATUS_UPDATE",
            status: status,
            url: window.location.href,
            timestamp: Date.now()
        }).catch(() => { });

        // If session died, notify user via a subtle banner
        if (status === "dead") {
            showNotification("⚠️ Netflix session expired. Open the extension to inject a new cookie.", "warning");
        } else if (status === "household_blocked") {
            showNotification("🏠 Household verification detected. Attempting bypass...", "info");
            // Request household bypass from background
            chrome.runtime.sendMessage({ action: "HOUSEHOLD_BYPASS_NEEDED" }).catch(() => { });
        }
    }

    function showNotification(message, type) {
        // Remove existing notification if any
        const existing = document.getElementById("ni-notification");
        if (existing) existing.remove();

        const banner = document.createElement("div");
        banner.id = "ni-notification";
        banner.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 999999;
            background: ${type === "warning" ? "#e50914" : "#333"};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            max-width: 320px;
            animation: niSlideIn 0.3s ease;
            cursor: pointer;
        `;
        banner.textContent = message;
        banner.addEventListener("click", () => banner.remove());

        // Add animation keyframes
        if (!document.getElementById("ni-styles")) {
            const style = document.createElement("style");
            style.id = "ni-styles";
            style.textContent = `
                @keyframes niSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(banner);

        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            if (banner.parentNode) {
                banner.style.opacity = "0";
                banner.style.transition = "opacity 0.3s";
                setTimeout(() => banner.remove(), 300);
            }
        }, 8000);
    }

    // --- Periodic Session Check ---
    function startMonitoring() {
        // Initial check after page settles
        setTimeout(() => {
            const status = detectSessionState();
            reportStatus(status);
        }, 2000);

        // Periodic checks every 30 seconds
        checkInterval = setInterval(() => {
            const status = detectSessionState();
            reportStatus(status);
        }, 30000);

        // Also check on visibility change (user returns to tab)
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                setTimeout(() => {
                    const status = detectSessionState();
                    reportStatus(status);
                }, 1000);
            }
        });

        // Watch for DOM changes that might indicate session state change
        const observer = new MutationObserver(() => {
            // Debounce
            clearTimeout(observer._timeout);
            observer._timeout = setTimeout(() => {
                const status = detectSessionState();
                reportStatus(status);
            }, 500);
        });

        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // --- Message Listener ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "PING") {
            sendResponse({ alive: true, url: window.location.href });
            return false;
        }

        if (request.action === "GET_SESSION_STATE") {
            const status = detectSessionState();
            sendResponse({ status: status, url: window.location.href });
            return false;
        }

        if (request.action === "SESSION_EXPIRED") {
            showNotification("⚠️ Your Netflix session has expired. Open the extension to get a new one.", "warning");
            sendResponse({ received: true });
            return false;
        }

        if (request.action === "RELOAD_PAGE") {
            window.location.reload();
            sendResponse({ reloading: true });
            return false;
        }

        return true;
    });

    // --- Initialize ---
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", startMonitoring);
    } else {
        startMonitoring();
    }
})();
