function initPopup() {
    const injectBtn = document.getElementById('injectBtn');
    const licenseInput = document.getElementById('licenseKey');
    const statusDiv = document.getElementById('status');

    if (!injectBtn || !licenseInput || !statusDiv) {
        console.warn("Popup UI elements missing; aborting init.");
        return;
    }

    // Load saved key if available
    chrome.storage.local.get(['licenseKey'], (result) => {
        if (result.licenseKey) {
            licenseInput.value = result.licenseKey;
        }
    });

    injectBtn.addEventListener('click', async () => {
        const key = licenseInput.value.trim();

        if (!key) {
            showStatus("Please enter a license key.", "error");
            return;
        }

        // Save key for convenience
        chrome.storage.local.set({ licenseKey: key });

        // Update UI state
        injectBtn.disabled = true;
        injectBtn.innerHTML = '<span class="spinner"></span> Injecting...';
        showStatus("");

        // Send message to background script
        try {
            const response = await chrome.runtime.sendMessage({
                action: "START_INJECTION",
                licenseKey: key
            });

            if (response && response.success) {
                showStatus("✅ Injection Successful! Reloading...", "success");
            } else {
                showStatus(`❌ Error: ${formatErrorMessage(response && response.message)}`, "error");
            }
        } catch (err) {
            showStatus(`❌ Communication Error: ${err.message}`, "error");
        } finally {
            injectBtn.disabled = false;
            injectBtn.textContent = 'Inject Cookie';
        }
    });

    function formatErrorMessage(message) {
        if (!message) return "Unknown error";
        const normalized = message.toLowerCase();
        if (normalized.includes("locked to another device") || normalized.includes("already used on another device")) {
            return "This license key is already in use on another device.";
        }
        return message;
    }

    function showStatus(msg, type) {
        statusDiv.textContent = msg;
        statusDiv.className = type || "";
    }
}

if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', initPopup);
} else {
    initPopup();
}
