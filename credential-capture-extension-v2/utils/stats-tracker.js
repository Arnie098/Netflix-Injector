// Statistics Tracker - Monitors capture effectiveness
class StatsTracker {
    constructor() {
        this.stats = {
            captureCount: 0,
            successCount: 0,
            failureCount: 0,
            totalRetries: 0,
            lastCapture: null,
            capturesByType: {},
            capturesByDomain: {},
            capturesByTechnique: {},
            errorsByType: {},
            sessionStart: new Date().toISOString()
        };
        this._0s1();
    }

    async _0s1() {
        const _0st = await chrome.storage.local.get('stats');
        if (_0st.stats) {
            this.stats = { ...this.stats, ..._0st.stats };
        }
    }

    async _0s2() {
        await chrome.storage.local.set({ stats: this.stats });
    }

    _0s3(_0ty, _0dm, _0tc = 'u') {
        this.stats.captureCount++;
        this.stats.lastCapture = new Date().toISOString();
        this.stats.capturesByType[_0ty] = (this.stats.capturesByType[_0ty] || 0) + 1;
        this.stats.capturesByDomain[_0dm] = (this.stats.capturesByDomain[_0dm] || 0) + 1;
        this.stats.capturesByTechnique[_0tc] = (this.stats.capturesByTechnique[_0tc] || 0) + 1;
        this._0s2();
    }

    _0s4() {
        this.stats.successCount++;
        this._0s2();
    }

    _0s5(_0et) {
        this.stats.failureCount++;
        this.stats.errorsByType[_0et] = (this.stats.errorsByType[_0et] || 0) + 1;
        this._0s2();
    }

    _0s6() {
        this.stats.totalRetries++;
        this._0s2();
    }

    _0s7() {
        return { ...this.stats };
    }

    _0s8(_0lm = 10) {
        return Object.entries(this.stats.capturesByDomain)
            .sort((a, b) => b[1] - a[1])
            .slice(0, _0lm);
    }

    _0s9() {
        const _0tt = this.stats.successCount + this.stats.failureCount;
        return _0tt > 0 ? ((this.stats.successCount / _0tt) * 100).toFixed(2) : 0;
    }

    async _0s10() {
        this.stats = {
            captureCount: 0,
            successCount: 0,
            failureCount: 0,
            totalRetries: 0,
            lastCapture: null,
            capturesByType: {},
            capturesByDomain: {},
            capturesByTechnique: {},
            errorsByType: {},
            sessionStart: new Date().toISOString()
        };
        await this._0s2();
    }
}
