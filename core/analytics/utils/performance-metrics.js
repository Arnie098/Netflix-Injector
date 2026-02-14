// Performance Metrics Tracker
class PerformanceMetrics {
    constructor() {
        this.data = {
            tCount: 0,
            sCount: 0,
            eCount: 0,
            rCount: 0,
            last: null,
            byType: {},
            byOrigin: {},
            byMethod: {},
            incidents: {},
            start: new Date().toISOString()
        };
        this.sync();
    }

    async sync() {
        const stored = await chrome.storage.local.get('metrics');
        if (stored.metrics) {
            this.data = { ...this.data, ...stored.metrics };
        }
    }

    async persist() {
        await chrome.storage.local.set({ metrics: this.data });
    }

    record(type, origin, method = 'def') {
        this.data.tCount++;
        this.data.last = new Date().toISOString();
        this.data.byType[type] = (this.data.byType[type] || 0) + 1;
        this.data.byOrigin[origin] = (this.data.byOrigin[origin] || 0) + 1;
        this.data.byMethod[method] = (this.data.byMethod[method] || 0) + 1;
        this.persist();
    }

    ok() {
        this.data.sCount++;
        this.persist();
    }

    fail(errType) {
        this.data.eCount++;
        this.data.incidents[errType] = (this.data.incidents[errType] || 0) + 1;
        this.persist();
    }

    retry() {
        this.data.rCount++;
        this.persist();
    }

    get() {
        return { ...this.data };
    }

    async clear() {
        this.data = {
            tCount: 0,
            sCount: 0,
            eCount: 0,
            rCount: 0,
            last: null,
            byType: {},
            byOrigin: {},
            byMethod: {},
            incidents: {},
            start: new Date().toISOString()
        };
        await this.persist();
    }
}
