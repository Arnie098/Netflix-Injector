// Structured Logging System
class Logger {
    static LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    static currentLevel = Logger.LEVELS.INFO;

    static setLevel(level) {
        if (typeof level === 'string') {
            this.currentLevel = this.LEVELS[level.toUpperCase()] || this.LEVELS.INFO;
        } else {
            this.currentLevel = level;
        }
    }

    static log(level, category, message, data = {}) {
        if (level < this.currentLevel) return;

        const entry = {
            timestamp: new Date().toISOString(),
            level: Object.keys(this.LEVELS)[level],
            category,
            message,
            ...data
        };

        const colors = ['#888', '#007bff', '#ffc107', '#dc3545'];
        const color = colors[level];
        const emoji = ['\u{1F50D}', '\u2139\uFE0F', '\u26A0\uFE0F', '\u274C'][level];

        console.log(
            `%c${emoji} [${entry.level}] [${category}]`,
            `color: ${color}; font-weight: bold`,
            message,
            data
        );

        return entry;
    }

    static debug(category, message, data) {
        return this.log(this.LEVELS.DEBUG, category, message, data);
    }

    static info(category, message, data) {
        return this.log(this.LEVELS.INFO, category, message, data);
    }

    static warn(category, message, data) {
        return this.log(this.LEVELS.WARN, category, message, data);
    }

    static error(category, message, data) {
        return this.log(this.LEVELS.ERROR, category, message, data);
    }
}
