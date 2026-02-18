// Queue Management
class ProductionQueue {
    constructor(config = {}) {
        this.dbName = 'AuditQueueDB';
        this.storeName = 'pendingRequests';
        this.db = null;
        this.initialized = false;
        this.bufferLimit = config.bufferSize || 50;
        this.flushTimeout = config.flushTimeout || 5000;
        this.maxSize = config.maxSize || 5000;
        this.maxAge = (config.maxAgeDays || 7) * 24 * 60 * 60 * 1000;
        this.writeBuffer = [];
        this.flushTimer = null;
        this.useBackup = false;
        this.backupQueue = [];
        this.initPromise = this._0q1();
    }

    async _0q1() {
        try {
            await this._0q2();
            this._0q13();
            this.initialized = true;
        } catch (error) {
            this.useBackup = true;
        }
    }

    async _0q2() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => { this.db = request.result; resolve(); };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    _0q6(payload) {
        if (this.useBackup) {
            this.backupQueue.push(payload);
            return;
        }
        this.writeBuffer.push({ payload, timestamp: Date.now(), retries: 0 });
        if (this.writeBuffer.length >= this.bufferLimit) { this._0q8(); } else { this._0q7(); }
    }

    _0q7() {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => this._0q8(), this.flushTimeout);
    }

    async _0q8() {
        if (this.writeBuffer.length === 0) return;
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
        const items = [...this.writeBuffer];
        this.writeBuffer = [];
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            for (const item of items) { store.add(item); }
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) { this.writeBuffer.unshift(...items); }
    }

    async _0q10(limit = 10) {
        if (!this.initialized) await this.initPromise;
        if (this.useBackup && this.backupQueue.length > 0) {
            return this.backupQueue.splice(0, limit).map((payload, index) => ({ id: `b-${index}`, payload }));
        }
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        return new Promise((resolve, reject) => {
            const request = store.getAll(null, limit);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async remove(id) {
        if (!this.initialized) await this.initPromise;
        if (typeof id === 'string' && id.startsWith('b-')) return;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async _0q12(id) {
        if (!this.initialized) await this.initPromise;
        if (typeof id === 'string' && id.startsWith('b-')) return 0;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        return new Promise((resolve, reject) => {
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
                const record = getRequest.result;
                if (record) {
                    record.retries++;
                    const updateRequest = store.put(record);
                    updateRequest.onsuccess = () => resolve(record.retries);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else { resolve(0); }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    _0q13() {
        setInterval(() => this._0q14(), 3600000);
    }

    async _0q14() {
        if (!this.initialized) return;
        const cutoff = Date.now() - this.maxAge;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');
        return new Promise((resolve) => {
            const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) { cursor.delete(); cursor.continue(); } else { resolve(); }
            };
            request.onerror = () => resolve();
        });
    }

    async _0q15() { return { usageMB: 0, quotaMB: 0, percentUsed: 0 }; }

    async _0q18() {
        if (!this.initialized) await this.initPromise;
        if (this.useBackup) return { totalSize: this.backupQueue.length };
        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        return new Promise((resolve) => {
            const countRequest = store.count();
            countRequest.onsuccess = () => resolve({ totalSize: countRequest.result + this.writeBuffer.length });
            countRequest.onerror = () => resolve({ totalSize: this.writeBuffer.length });
        });
    }

    async _0q19() {
        if (!this.initialized) await this.initPromise;
        this.writeBuffer = [];
        this.backupQueue = [];
        if (this.useBackup) return;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        return new Promise((resolve) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
        });
    }

    static async _0q17() { return true; }
    async _0q8() { await this._0q8(); } // Placeholder for naming consistency in bg
    async _0q21() { return []; } // Legacy export
}
