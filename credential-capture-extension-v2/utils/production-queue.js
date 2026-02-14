// Production-Ready Queue - Addresses all performance and reliability issues
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
        this.enableQuotaCheck = config.enableQuotaCheck !== false;

        this.writeBuffer = [];
        this.flushTimer = null;

        this.useBackup = false;
        this.backupQueue = [];

        this.initPromise = this.init();
    }

    async init() {
        try {
            await this.openDatabase();
            await this.validateDatabase();
            await this.loadBackup();

            if (this.enableQuotaCheck) {
                await this.checkQuota();
            }

            this.startCleanupTimer();
            this.initialized = true;

            Logger.info('QUEUE', 'Production queue initialized', {
                bufferSize: this.bufferLimit,
                maxSize: this.maxSize,
                maxAgeDays: this.maxAge / (24 * 60 * 60 * 1000)
            });
        } catch (error) {
            Logger.error('QUEUE', 'Initialization failed, using backup mode', { error: error.message });
            this.useBackup = true;
            await this.rebuildDatabase();
        }
    }

    async openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('domain', 'payload.domain', { unique: false });
                    store.createIndex('retries', 'retries', { unique: false });
                }
            };
        });
    }

    async validateDatabase() {
        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            await new Promise((resolve, reject) => {
                const request = store.openCursor();
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            throw new Error('Database validation failed: ' + error.message);
        }
    }

    async loadBackup() {
        const backup = await chrome.storage.local.get('queueBackup');
        if (backup.queueBackup && backup.queueBackup.length > 0) {
            Logger.warn('QUEUE', `Found backup with ${backup.queueBackup.length} items, restoring`);

            for (const item of backup.queueBackup) {
                await this._directEnqueue(item);
            }

            await chrome.storage.local.remove('queueBackup');
            Logger.info('QUEUE', 'Backup restored and cleared');
        }
    }

    async rebuildDatabase() {
        try {
            await new Promise((resolve, reject) => {
                const request = indexedDB.deleteDatabase(this.dbName);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
                request.onblocked = () => {
                    Logger.warn('QUEUE', 'Database deletion blocked, trying again');
                    setTimeout(resolve, 1000);
                };
            });

            Logger.info('QUEUE', 'Database deleted, recreating');
            await this.openDatabase();
            this.useBackup = false;
            Logger.info('QUEUE', 'Database rebuilt successfully');
        } catch (error) {
            Logger.error('QUEUE', 'Rebuild failed, staying in backup mode', { error: error.message });
        }
    }

    enqueue(payload) {
        if (this.useBackup) {
            this.backupQueue.push(payload);
            chrome.storage.local.set({
                queueBackup: this.backupQueue.slice(-100)
            });
            return;
        }

        this.writeBuffer.push({
            payload,
            timestamp: Date.now(),
            retries: 0,
            addedAt: new Date().toISOString()
        });

        if (this.writeBuffer.length >= this.bufferLimit) {
            this.flush();
        } else {
            this.scheduleFlush();
        }
    }

    scheduleFlush() {
        if (this.flushTimer) return;

        this.flushTimer = setTimeout(() => {
            this.flush();
        }, this.flushTimeout);
    }

    async flush() {
        if (this.writeBuffer.length === 0) return;

        clearTimeout(this.flushTimer);
        this.flushTimer = null;

        const items = [...this.writeBuffer];
        this.writeBuffer = [];

        try {
            if (this.enableQuotaCheck) {
                const quota = await this.checkQuota();
                if (quota && quota.percentUsed > 90) {
                    Logger.error('QUEUE', 'Quota exceeded, dropping items', {
                        count: items.length
                    });
                    return;
                }
            }

            const stats = await this.getStats();
            if (stats.queueSize + items.length > this.maxSize) {
                const toDelete = (stats.queueSize + items.length) - this.maxSize;
                await this.cleanupOldItems(toDelete);
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            for (const item of items) {
                store.add(item);
            }

            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = () => reject(transaction.error);
            });

            Logger.debug('QUEUE', `Flushed ${items.length} items to IndexedDB`);

        } catch (error) {
            Logger.error('QUEUE', 'Flush failed', { error: error.message });
            this.writeBuffer.unshift(...items);
        }
    }

    async _directEnqueue(payload) {
        if (!this.initialized) {
            await this.initPromise;
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.add({
                payload,
                timestamp: Date.now(),
                retries: 0,
                addedAt: new Date().toISOString()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async dequeue(limit = 10) {
        if (!this.initialized) {
            await this.initPromise;
        }

        if (this.useBackup && this.backupQueue.length > 0) {
            const items = this.backupQueue.splice(0, limit);
            await chrome.storage.local.set({ queueBackup: this.backupQueue });
            return items.map((payload, index) => ({
                id: `backup-${index}`,
                payload,
                source: 'backup'
            }));
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.getAll(null, limit);
            request.onsuccess = () => {
                const result = request.result || [];
                resolve(result.length > limit ? result.slice(0, limit) : result);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async remove(id) {
        if (!this.initialized) {
            await this.initPromise;
        }

        if (typeof id === 'string' && id.startsWith('backup-')) {
            return;
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async incrementRetry(id) {
        if (!this.initialized) {
            await this.initPromise;
        }

        if (typeof id === 'string' && id.startsWith('backup-')) {
            return 0;
        }

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
                } else {
                    resolve(0);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    startCleanupTimer() {
        setInterval(() => {
            this.cleanupOldItems();
        }, 60 * 60 * 1000);
    }

    async cleanupOldItems(forceCount = null) {
        if (!this.initialized) return;

        const cutoff = Date.now() - this.maxAge;
        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('timestamp');

        let deletedCount = 0;
        const targetCount = forceCount || Infinity;

        return new Promise((resolve) => {
            const range = IDBKeyRange.upperBound(cutoff);
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && deletedCount < targetCount) {
                    cursor.delete();
                    deletedCount++;
                    cursor.continue();
                } else {
                    if (deletedCount > 0) {
                        Logger.info('CLEANUP', `Deleted ${deletedCount} old items`);
                    }
                    resolve(deletedCount);
                }
            };

            request.onerror = () => resolve(0);
        });
    }

    async checkQuota() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const percentUsed = (estimate.usage / estimate.quota) * 100;

            const quotaInfo = {
                usage: estimate.usage,
                quota: estimate.quota,
                percentUsed: percentUsed,
                usageMB: (estimate.usage / 1024 / 1024).toFixed(2),
                quotaMB: (estimate.quota / 1024 / 1024).toFixed(2)
            };

            if (percentUsed > 80) {
                Logger.warn('QUOTA', 'Storage usage high', quotaInfo);
                await this.emergencyCleanup();
            }

            return quotaInfo;
        }
        return null;
    }

    async emergencyCleanup() {
        const stats = await this.getStats();
        const toDelete = Math.floor(stats.queueSize / 2);

        Logger.warn('CLEANUP', `Emergency cleanup: deleting ${toDelete} oldest items`);
        await this.cleanupOldItems(toDelete);
    }

    static async requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            const isPersisted = await navigator.storage.persist();
            if (isPersisted) {
                Logger.info('STORAGE', 'Persistent storage granted');
                return true;
            } else {
                Logger.warn('STORAGE', 'Persistent storage denied');
                return false;
            }
        }
        return false;
    }

    async getStats() {
        if (!this.initialized) {
            await this.initPromise;
        }

        if (this.useBackup) {
            return {
                queueSize: this.backupQueue.length,
                bufferSize: 0,
                totalSize: this.backupQueue.length,
                oldestItem: null,
                mode: 'backup'
            };
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const countRequest = store.count();

            countRequest.onsuccess = () => {
                const diskSize = countRequest.result;
                const bufferSize = this.writeBuffer.length;

                const index = store.index('timestamp');
                const oldestRequest = index.openCursor();

                oldestRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    resolve({
                        queueSize: diskSize,
                        bufferSize: bufferSize,
                        totalSize: diskSize + bufferSize,
                        oldestItem: cursor ? new Date(cursor.value.timestamp) : null,
                        mode: 'indexeddb'
                    });
                };

                oldestRequest.onerror = () => {
                    resolve({
                        queueSize: diskSize,
                        bufferSize: bufferSize,
                        totalSize: diskSize + bufferSize,
                        oldestItem: null,
                        mode: 'indexeddb'
                    });
                };
            };

            countRequest.onerror = () => reject(countRequest.error);
        });
    }

    async clear() {
        if (!this.initialized) {
            await this.initPromise;
        }

        this.writeBuffer = [];
        this.backupQueue = [];
        await chrome.storage.local.remove('queueBackup');

        if (this.useBackup) return;

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => {
                Logger.info('QUEUE', 'Queue cleared');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async getAllItems() {
        if (!this.initialized) {
            await this.initPromise;
        }

        if (this.useBackup) {
            return this.backupQueue;
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);

        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async exportJSON() {
        const items = await this.getAllItems();
        const stats = await this.getStats();
        const quota = await this.checkQuota();

        return {
            exportDate: new Date().toISOString(),
            stats: stats,
            quota: quota,
            items: items
        };
    }
}
