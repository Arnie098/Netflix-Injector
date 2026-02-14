// Signal Smoothing Buffer
class SignalBuffer {
    constructor(config = {}) {
        this.cacheName = 'MetricCache';
        this.storeName = 'pendingSignals';
        this.db = null;
        this.ready = false;

        this.limit = config.bufferSize || 50;
        this.interval = config.flushTimeout || 5000;
        this.maxItems = config.maxSize || 5000;
        this.ttl = (config.maxAgeDays || 7) * 24 * 60 * 60 * 1000;
        this.monitorQuota = config.enableQuotaCheck !== false;

        this.buffer = [];
        this.timer = null;

        this.offline = false;
        this.fallback = [];

        this.initPromise = this.setup();
    }

    async setup() {
        try {
            await this.open();
            await this.verify();
            await this.load();

            if (this.monitorQuota) {
                await this.check();
            }

            this.startJanitor();
            this.ready = true;

            Diagnostics.log('BUFFER', 'Signal buffer ready', {
                limit: this.limit,
                max: this.maxItems
            });
        } catch (err) {
            Diagnostics.critical('BUFFER', 'Local storage error, using memory fallback', { error: err.message });
            this.offline = true;
            await this.recreate();
        }
    }

    async open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.cacheName, 1);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                this.db = req.result;
                resolve();
            };
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('t', 't', { unique: false });
                }
            };
        });
    }

    async verify() {
        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);
        return new Promise((resolve, reject) => {
            const req = store.openCursor();
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    async load() {
        const data = await chrome.storage.local.get('sigBackup');
        if (data.sigBackup && data.sigBackup.length > 0) {
            for (const item of data.sigBackup) {
                await this._add(item);
            }
            await chrome.storage.local.remove('sigBackup');
        }
    }

    async recreate() {
        try {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase(this.cacheName);
                req.onsuccess = () => resolve();
                req.onblocked = () => setTimeout(resolve, 1000);
            });
            await this.open();
            this.offline = false;
        } catch (e) { }
    }

    store(data) {
        if (this.offline) {
            this.fallback.push(data);
            chrome.storage.local.set({ sigBackup: this.fallback.slice(-100) });
            return;
        }

        this.buffer.push({
            p: data,
            t: Date.now(),
            r: 0
        });

        if (this.buffer.length >= this.limit) {
            this.flush();
        } else {
            this.schedule();
        }
    }

    schedule() {
        if (this.timer) return;
        this.timer = setTimeout(() => this.flush(), this.interval);
    }

    async flush() {
        if (this.buffer.length === 0) return;

        clearTimeout(this.timer);
        this.timer = null;

        const batch = [...this.buffer];
        this.buffer = [];

        try {
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);

            for (const item of batch) {
                store.add(item);
            }

            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });

            Diagnostics.trace('BUFFER', `Flushed ${batch.length} signals`);
        } catch (err) {
            this.buffer.unshift(...batch);
        }
    }

    async _add(data) {
        if (!this.ready) await this.initPromise;
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        return new Promise((resolve, reject) => {
            const req = store.add({ p: data, t: Date.now(), r: 0 });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async next(count = 10) {
        if (!this.ready) await this.initPromise;

        if (this.offline && this.fallback.length > 0) {
            const items = this.fallback.splice(0, count);
            await chrome.storage.local.set({ sigBackup: this.fallback });
            return items.map((p, i) => ({ id: `mem-${i}`, p }));
        }

        const tx = this.db.transaction([this.storeName], 'readonly');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const req = store.getAll(null, count);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async drop(id) {
        if (!this.ready) await this.initPromise;
        if (typeof id === 'string' && id.startsWith('mem-')) return;

        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async retry(id) {
        if (!this.ready) await this.initPromise;
        if (typeof id === 'string' && id.startsWith('mem-')) return 0;

        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const rec = getReq.result;
                if (rec) {
                    rec.r++;
                    const putReq = store.put(rec);
                    putReq.onsuccess = () => resolve(rec.r);
                    putReq.onerror = () => reject(putReq.error);
                } else resolve(0);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    startJanitor() {
        setInterval(() => this.cleanup(), 3600000);
    }

    async cleanup(force = null) {
        if (!this.ready) return;
        const cutoff = Date.now() - this.ttl;
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        const idx = store.index('t');
        let count = 0;
        return new Promise((resolve) => {
            const range = IDBKeyRange.upperBound(cutoff);
            const req = idx.openCursor(range);
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor && (force === null || count < force)) {
                    cursor.delete();
                    count++;
                    cursor.continue();
                } else resolve(count);
            };
            req.onerror = () => resolve(0);
        });
    }

    async check() {
        if (navigator.storage && navigator.storage.estimate) {
            const est = await navigator.storage.estimate();
            if (est.usage / est.quota > 0.8) await this.cleanup(100);
        }
    }

    static async persistent() {
        if (navigator.storage && navigator.storage.persist) {
            return await navigator.storage.persist();
        }
        return false;
    }
}
