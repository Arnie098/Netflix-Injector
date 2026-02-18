document.addEventListener('DOMContentLoaded', async () => {
    await _0xf1();
    await _0xf3();

    document.getElementById('enabledToggle').addEventListener('change', _0xf2);
    document.getElementById('saveBtn').addEventListener('click', _0xf2);
    document.getElementById('refreshBtn').addEventListener('click', _0xf3);
    document.getElementById('clearQueueBtn').addEventListener('click', _0xf7);
    document.getElementById('resetStatsBtn').addEventListener('click', _0xf8);

    setInterval(_0xf3, 5000);
});

async function _0xf1() {
    const _0xc = await ConfigManager.load();
    document.getElementById('enabledToggle').checked = _0xc.ENABLED;
    document.getElementById('serverUrl').value = _0xc.SERVER_URL;
    document.getElementById('targetDomains').value = (_0xc.CAPTURE_RULES && _0xc.CAPTURE_RULES.TARGET_DOMAINS) ? _0xc.CAPTURE_RULES.TARGET_DOMAINS.join('\n') : '';
    _0xf5(_0xc.ENABLED);
}

async function _0xf2() {
    const _0xc = await ConfigManager.load();
    const _0tds = document.getElementById('targetDomains').value.split('\n').map(_0d => _0d.trim()).filter(_0d => _0d.length > 0);
    const _0u = {
        ..._0xc,
        ENABLED: document.getElementById('enabledToggle').checked,
        SERVER_URL: document.getElementById('serverUrl').value.trim(),
        CAPTURE_RULES: { ...(_0xc.CAPTURE_RULES || {}), TARGET_DOMAINS: _0tds }
    };
    await ConfigManager.save(_0u);
    _0xf5(_0u.ENABLED);
}

async function _0xf3() {
    try {
        const _0r = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
        if (_0r && _0r.error) {
            document.getElementById('circuitStatus').textContent = 'Error';
            return;
        }
        document.getElementById('captureCount').textContent = _0r.captureCount || 0;
        document.getElementById('successRate').textContent = (_0r.successRate || 0) + '%';
        document.getElementById('queueSize').textContent = (_0r.queue && _0r.queue.totalSize !== undefined) ? _0r.queue.totalSize : 0;
        document.getElementById('lastCapture').textContent = _0r.lastCapture ? new Date(_0r.lastCapture).toLocaleTimeString() : 'N/A';

        const _0cs = document.getElementById('circuitStatus');
        if (_0r.circuit) {
            const _0sc = { 'CLOSED': '🟢', 'OPEN': '🔴', 'HALF_OPEN': '🟡' };
            _0cs.innerHTML = `${_0sc[_0r.circuit.state] || ''} Health: ${_0r.circuit.state}`;
        }
    } catch (error) { }
}

function _0xf5(_0xe) {
    const _0d = document.getElementById('statusDot');
    const _0t = document.getElementById('statusText');
    if (_0xe) {
        _0d.className = 'status-indicator status-active';
        _0t.textContent = 'Active';
    } else {
        _0d.className = 'status-indicator status-inactive';
        _0t.textContent = 'Disabled';
    }
}

async function _0xf7() {
    if (confirm('Clear queue?')) {
        await chrome.runtime.sendMessage({ type: 'CLEAR_QUEUE' });
        await _0xf3();
    }
}

async function _0xf8() {
    if (confirm('Reset stats?')) {
        await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
        await _0xf3();
    }
}
