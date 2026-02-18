import { loadConfig } from "./config.js";

async function initPopup() {
    const injectBtn = document.getElementById("injectBtn");
    const injectAnotherBtn = document.getElementById("injectAnotherBtn");
    const licenseInput = document.getElementById("licenseKey");
    const statusDiv = document.getElementById("status");

    function updateStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = type || "";
    }

    function resetButton() {
        injectBtn.disabled = false;
        injectBtn.textContent = "Inject Cookie";
        if (injectAnotherBtn) {
            injectAnotherBtn.disabled = false;
            injectAnotherBtn.textContent = "Inject another account";
        }
    }

    function setLoadingState(isAnother = false) {
        if (isAnother) {
            injectAnotherBtn.disabled = true;
            injectAnotherBtn.innerHTML = '<span class="spinner"></span> Rotating...';
        } else {
            injectBtn.disabled = true;
            injectBtn.innerHTML = '<span class="spinner"></span> Injecting...';
        }
        updateStatus("Starting injection process...", "loading");
    }

    if (!injectBtn || !licenseInput || !statusDiv) {
        console.warn("Popup UI elements missing; aborting init.");
        return;
    }

    // Load saved license key
    chrome.storage.local.get(["licenseKey"], (result) => {
        if (result.licenseKey) {
            licenseInput.value = result.licenseKey;
        }
    });

    // Allow Enter key to trigger injection
    licenseInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !injectBtn.disabled) {
            injectBtn.click();
        }
    });

    // Health check button (for debugging)
    const healthCheckBtn = document.createElement("button");
    healthCheckBtn.textContent = "Test Connection";
    healthCheckBtn.style.cssText = "margin-top: 10px; padding: 5px 10px; font-size: 12px;";
    healthCheckBtn.addEventListener("click", async () => {
        console.log("🔍 Running health check...");
        try {
            const response = await sendMessageWithTimeout({ action: "PING" }, 5000);
            console.log("✅ Health check passed:", response);
            updateStatus("✅ Background script is alive and responding", "success");
        } catch (e) {
            console.error("❌ Health check failed:", e);
            updateStatus(`❌ Health check failed: ${e.message}`, "error");
        }
    });

    // Add health check button after inject button (optional, for debugging)
    // injectBtn.parentElement.appendChild(healthCheckBtn);

    async function handleInjection(isAnother = false) {
        const licenseKey = licenseInput.value.trim();

        if (!licenseKey) {
            updateStatus("⚠️ Please enter a license key.", "error");
            return;
        }

        // Save license key
        chrome.storage.local.set({ licenseKey: licenseKey });

        setLoadingState(isAnother);
        console.log(`🚀 Starting injection process (another: ${isAnother}) at`, new Date().toISOString());

        try {
            // First, do a quick health check
            console.log("🔍 Checking if background script is alive...");
            try {
                await sendMessageWithTimeout({ action: "PING" }, 3000);
                console.log("✅ Background script is responsive");
            } catch (e) {
                console.error("❌ Background script not responding to health check:", e);
                updateStatus("❌ Extension background script not responding. Try reloading the extension.", "error");
                resetButton();
                return;
            }

            // Now send the actual injection request with longer timeout
            console.log("📤 Sending injection request...");
            updateStatus("Connecting to server...", "loading");

            const response = await sendMessageWithTimeout(
                {
                    action: "START_INJECTION",
                    licenseKey: licenseKey
                },
                45000 // 45 second timeout (increased from 30s)
            );

            console.log("📥 Received response:", response);

            if (response && response.success) {
                updateStatus("✅ Injection Successful! Reloading Netflix...", "success");
                console.log("✅ Injection completed successfully");

                // Show TV Login Section and Inject Another Button
                if (injectAnotherBtn) {
                    injectAnotherBtn.style.display = "block";
                }

                const tvLoginSection = document.getElementById("tvLoginSection");
                if (tvLoginSection) {
                    tvLoginSection.style.display = "block";
                }

                // Show Phone Section
                const phoneSection = document.getElementById("phoneSection");
                if (phoneSection) {
                    phoneSection.style.display = "block";
                }

                // Keep button disabled for 2 seconds to prevent double-clicks
                setTimeout(() => {
                    resetButton();
                }, 2000);
            } else {
                const errorMsg = getErrorMessage(response?.message);
                updateStatus(`❌ Error: ${errorMsg}`, "error");
                console.error("❌ Injection failed:", response);
                resetButton();
            }
        } catch (e) {
            handleError(e);
            resetButton();
        }
    }

    injectBtn.addEventListener("click", () => handleInjection(false));

    if (injectAnotherBtn) {
        injectAnotherBtn.addEventListener("click", () => handleInjection(true));
    }

    // TV Login Logic
    const tvLoginSection = document.getElementById("tvLoginSection");
    const showTvInputBtn = document.getElementById("showTvInputBtn");
    const tvInputContainer = document.getElementById("tvInputContainer");
    const tvLoginBtn = document.getElementById("tvLoginBtn");
    const tvCodeInput = document.getElementById("tvCode");

    if (showTvInputBtn && tvInputContainer) {
        showTvInputBtn.addEventListener("click", () => {
            showTvInputBtn.style.display = "none";
            tvInputContainer.style.display = "block";
        });
    }

    // Phone Launch Logic (Kiwi Browser on Android)
    const openPhoneBtn = document.getElementById("openPhoneBtn");
    const phoneStatus = document.getElementById("phoneStatus");

    if (openPhoneBtn && phoneStatus) {
        openPhoneBtn.addEventListener("click", async () => {
            openPhoneBtn.disabled = true;
            phoneStatus.textContent = "⏳ Opening Netflix...";
            phoneStatus.className = "loading";
            try {
                const result = await sendMessageWithTimeout({ action: "OPEN_PHONE_NETFLIX" }, 10000);
                if (result && result.success) {
                    phoneStatus.textContent = "✅ Tab opened! Tap 'Open App' on your phone.";
                    phoneStatus.className = "success";
                } else {
                    phoneStatus.textContent = `❌ ${result?.message || "Failed to open tab"}`;
                    phoneStatus.className = "error";
                }
            } catch (e) {
                phoneStatus.textContent = `❌ ${e.message}`;
                phoneStatus.className = "error";
            } finally {
                openPhoneBtn.disabled = false;
            }
        });
    }

    if (tvLoginBtn && tvCodeInput) {
        tvLoginBtn.addEventListener("click", async () => {
            const code = tvCodeInput.value.trim();
            if (!code || code.length !== 8 || !/^\d+$/.test(code)) {
                updateStatus("⚠️ Please enter a valid 8-digit TV code.", "error");
                return;
            }

            tvLoginBtn.disabled = true;
            tvLoginBtn.textContent = "Linking...";
            updateStatus("Connecting to Netflix TV Auth...", "loading");

            try {
                await handleTvLogin(code);
            } catch (error) {
                console.error("TV Login Error:", error);
                updateStatus(`❌ TV Login Failed: ${error.message}`, "error");
            } finally {
                tvLoginBtn.disabled = false;
                tvLoginBtn.textContent = "Submit Code";
            }
        });
    }

    async function handleTvLogin(code) {
        const authUrl = `https://www.netflix.com/hook/tvAuthorize?pin=${code}`;
        console.log("Fetching auth page:", authUrl);

        // 1. Fetch initial page to get form tokens
        const initialResp = await fetch(authUrl, {
            credentials: 'include' // Important: Use browser cookies
        });

        if (!initialResp.ok) {
            throw new Error(`Failed to load auth page (Status: ${initialResp.status})`);
        }

        const initialText = await initialResp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(initialText, "text/html");

        const form = doc.querySelector("form");
        if (!form) {
            // Check if already successful or a different state
            if (doc.body.textContent.includes("Success")) {
                updateStatus("✅ TV Connected Successfully!", "success");
                return;
            }
            throw new Error("Authorization form not found on Netflix page. Ensure you are logged in.");
        }

        // 2. Prepare Form Data
        const formData = new URLSearchParams();
        const inputs = form.querySelectorAll("input");
        inputs.forEach(input => {
            formData.append(input.name, input.value);
        });

        // Add submit button value if present
        const submitBtn = form.querySelector("button[type='submit']");
        if (submitBtn && submitBtn.name) {
            formData.append(submitBtn.name, submitBtn.value || "");
        }

        // Verify we captured the pin or inject it if missing and required
        if (!formData.has('pin')) {
            formData.append('pin', code);
        }

        // 3. Submit Post Request
        // The action is usually relative, so resolve it against the origin
        const actionUrl = new URL(form.getAttribute("action") || "/hook/tvAuthorize", "https://www.netflix.com").href;

        console.log("Submitting TV Auth to:", actionUrl);

        const postResp = await fetch(actionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData,
            credentials: "include"
        });

        const postText = await postResp.text();

        // 4. Validate Response
        // Check for success indicators
        if (postText.includes("Success") || postText.includes("device_connected") || (!postText.includes("error") && postResp.ok)) {
            // Sometimes Netflix redirects or shows a success message
            // We can check for specific error classes to be sure it DIDN'T fail
            if (postText.includes("ui-message-error") || postText.includes("incorrect_code")) {
                throw new Error("Incorrect code or session expired.");
            }
            updateStatus("✅ TV Connected Successfully!", "success");
            tvCodeInput.value = ""; // Clear input on success
        } else {
            throw new Error("Unknown response from Netflix. Check console.");
        }
    }

    function handleError(error) {
        console.error("❌ Injection error:", error);

        if (error.message.includes("timeout") || error.message.includes("took too long")) {
            updateStatus("❌ Request timed out. The server may be slow or the extension may need reloading.", "error");
            console.log("💡 Suggestion: Check the Service Worker console for detailed logs");
        } else if (error.message.includes("Extension context invalidated")) {
            updateStatus("❌ Extension reloaded. Please close and reopen this popup.", "error");
        } else if (error.message.includes("Could not establish connection")) {
            updateStatus("❌ Cannot connect to background script. Try reloading the extension.", "error");
        } else if (error.message.includes("not responding")) {
            updateStatus("❌ Background script not responding. Try reloading the extension.", "error");
        } else {
            updateStatus(`❌ Error: ${error.message}`, "error");
        }
    }

    function getErrorMessage(msg) {
        if (!msg) return "Unknown error occurred";

        const lowerMsg = msg.toLowerCase();

        // Map common error messages to user-friendly versions
        if (lowerMsg.includes("locked to another device") ||
            lowerMsg.includes("already used on another device")) {
            return "This license key is already in use on another device.";
        }
        if (lowerMsg.includes("invalid") || lowerMsg.includes("not found")) {
            return "Invalid license key. Please check and try again.";
        }
        if (lowerMsg.includes("expired")) {
            return "This license key has expired.";
        }
        if (lowerMsg.includes("network") || lowerMsg.includes("connection")) {
            return "Network error. Please check your internet connection.";
        }
        if (lowerMsg.includes("timeout") || lowerMsg.includes("took too long")) {
            return "Request timed out. Server may be slow - please try again.";
        }
        if (lowerMsg.includes("cookie")) {
            return "Cookie injection failed. Please try again.";
        }
        if (lowerMsg.includes("no account data")) {
            return "Server returned invalid data. Please contact support.";
        }

        return msg;
    }

    /**
     * Send message to background script with timeout
     * @param {Object} message - Message to send
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} Response from background script
     */
    async function sendMessageWithTimeout(message, timeout = 45000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const timeoutId = setTimeout(() => {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                console.error(`❌ Timeout after ${elapsed}s`);
                reject(new Error(`Request timeout - background script took too long to respond (${elapsed}s)`));
            }, timeout);

            try {
                console.log(`📤 Sending message: ${message.action} (timeout: ${timeout}ms)`);

                chrome.runtime.sendMessage(message, (response) => {
                    clearTimeout(timeoutId);
                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

                    console.log(`📥 Response received after ${elapsed}s`);

                    // Check for Chrome extension errors
                    if (chrome.runtime.lastError) {
                        console.error("❌ Chrome runtime error:", chrome.runtime.lastError);
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    // Check if response exists
                    if (response === undefined) {
                        console.error("❌ Response is undefined");
                        reject(new Error("No response from background script"));
                        return;
                    }

                    console.log("✅ Valid response received:", response);
                    resolve(response);
                });
            } catch (e) {
                clearTimeout(timeoutId);
                console.error("❌ Exception in sendMessage:", e);
                reject(e);
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopup);
} else {
    initPopup();
}