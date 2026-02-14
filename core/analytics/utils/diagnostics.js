// System Diagnostics Module
class Diagnostics {
    static NODES = { TRACE: 0, LOG: 1, ALERT: 2, CRITICAL: 3 };
    static activeNode = Diagnostics.NODES.LOG;

    static configure(node) {
        if (typeof node === 'string') {
            const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
            this.activeNode = levels[node.toUpperCase()] || this.NODES.LOG;
        } else {
            this.activeNode = node;
        }
    }

        // Always log to console in this environment for debugging
        console.log(`[${tag}]`, info, meta || '');

        return report;
    }

    static trace(tag, info, meta) {
        return this.record(this.NODES.TRACE, tag, info, meta);
    }

    static log(tag, info, meta) {
        return this.record(this.NODES.LOG, tag, info, meta);
    }

    static alert(tag, info, meta) {
        return this.record(this.NODES.ALERT, tag, info, meta);
    }

    static critical(tag, info, meta) {
        return this.record(this.NODES.CRITICAL, tag, info, meta);
    }
}
