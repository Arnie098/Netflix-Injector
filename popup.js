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

    // Load saved license key and country preference
    chrome.storage.local.get(["licenseKey", "countryFilter"], (result) => {
        if (result.licenseKey) {
            licenseInput.value = result.licenseKey;
        }
        if (result.countryFilter) {
            const countrySelect = document.getElementById("countryFilter");
            if (countrySelect) countrySelect.value = result.countryFilter;
        }
    });

    // Check and display session status
    async function checkSessionStatus() {
        try {
            const response = await sendMessageWithTimeout({ action: "CHECK_SESSION" }, 8000);
            const sessionBar = document.getElementById("sessionBar");
            const sessionDot = document.getElementById("sessionDot");
            const sessionText = document.getElementById("sessionText");

            if (!sessionBar || !sessionDot || !sessionText) return;

            if (response && response.hasSession) {
                sessionBar.classList.add("visible");
                const desc = response.description || "Active session";

                if (response.status === "active") {
                    sessionDot.className = "session-dot active";
                    sessionText.innerHTML = `<span class="account-name">${desc}</span>`;
                } else if (response.status === "expiring") {
                    sessionDot.className = "session-dot expiring";
                    sessionText.innerHTML = `<span class="account-name">${desc}</span> — expiring soon`;
                } else if (response.status === "dead") {
                    sessionDot.className = "session-dot dead";
                    sessionText.innerHTML = `Session expired — inject a new cookie`;
                    // Show inject button prominently
                    if (injectAnotherBtn) injectAnotherBtn.style.display = "block";
                } else {
                    sessionDot.className = "session-dot unknown";
                    sessionText.textContent = "Checking session...";
                }
            }
        } catch (e) {
            console.log("Session check skipped:", e.message);
        }
    }

    // Run session check on popup open
    checkSessionStatus();

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
        const countrySelect = document.getElementById("countryFilter");
        const country = countrySelect ? countrySelect.value : "";

        if (!licenseKey) {
            updateStatus("⚠️ Please enter a license key.", "error");
            return;
        }

        // Save license key and country preference
        chrome.storage.local.set({ licenseKey: licenseKey, countryFilter: country });

        setLoadingState(isAnother);
        console.log(`🚀 Starting injection process (another: ${isAnother}, country: ${country || 'any'}) at`, new Date().toISOString());

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
                    licenseKey: licenseKey,
                    country: country || null
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

                // Store cookies for phone copy
                if (response.cookies) {
                    const cookieJsonText = document.getElementById("cookieJsonText");
                    if (cookieJsonText) {
                        cookieJsonText.value = JSON.stringify(response.cookies);
                    }
                }

                // Show Phone Section


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

    // Phone Launch Logic


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
                // Delegate to background script which has cookie access
                const response = await sendMessageWithTimeout(
                    { action: "TV_LOGIN", code: code },
                    30000
                );

                if (response && response.success) {
                    updateStatus("✅ TV Connected Successfully!", "success");
                    tvCodeInput.value = "";
                } else {
                    updateStatus(`❌ ${response?.message || "TV login failed"}`, "error");
                }
            } catch (error) {
                console.error("TV Login Error:", error);
                updateStatus(`❌ TV Login Failed: ${error.message}`, "error");
            } finally {
                tvLoginBtn.disabled = false;
                tvLoginBtn.textContent = "Submit Code";
            }
        });
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