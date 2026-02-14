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
        this.load();
    }

    async load() {
        const stored = await chrome.storage.local.get('stats');
        if (stored.stats) {
            this.stats = { ...this.stats, ...stored.stats };
        }
    }

    async save() {
        await chrome.storage.local.set({ stats: this.stats });
    }

    recordCapture(type, domain, technique = 'unknown') {
        this.stats.captureCount++;
        this.stats.lastCapture = new Date().toISOString();
        this.stats.capturesByType[type] = (this.stats.capturesByType[type] || 0) + 1;
        this.stats.capturesByDomain[domain] = (this.stats.capturesByDomain[domain] || 0) + 1;
        this.stats.capturesByTechnique[technique] = (this.stats.capturesByTechnique[technique] || 0) + 1;
        this.save();
    }

    recordSuccess() {
        this.stats.successCount++;
        this.save();
    }

    recordFailure(errorType) {
        this.stats.failureCount++;
        this.stats.errorsByType[errorType] = (this.stats.errorsByType[errorType] || 0) + 1;
        this.save();
    }

    recordRetry() {
        this.stats.totalRetries++;
        this.save();
    }

    getStats() {
        return { ...this.stats };
    }

    getTopDomains(limit = 10) {
        return Object.entries(this.stats.capturesByDomain)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
    }

    getSuccessRate() {
        const total = this.stats.successCount + this.stats.failureCount;
        return total > 0 ? ((this.stats.successCount / total) * 100).toFixed(2) : 0;
    }

    async reset() {
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
        await this.save();
    }
}
