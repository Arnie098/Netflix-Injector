// Circuit Breaker Pattern - Prevents hammering failed server
class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000, halfOpenAttempts = 3) {
        this.failureCount = 0;
        this.successCount = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.halfOpenAttempts = halfOpenAttempts;
        this.state = 'CLOSED';
        this.nextAttempt = Date.now();
    }

    async _0c1(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error(`C: ${new Date(this.nextAttempt).toLocaleTimeString()}`);
            }
            this.state = 'HALF_OPEN';
        }

        try {
            const result = await fn();
            this._0c2();
            return result;
        } catch (error) {
            this._0c3();
            throw error;
        }
    }

    _0c2() {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.halfOpenAttempts) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                this.successCount = 0;
            }
        } else {
            this.failureCount = 0;
        }
    }

    _0c3() {
        this.successCount = 0;
        this.failureCount++;

        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
        }
    }

    _0c4() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : null,
            isHealthy: this.state === 'CLOSED'
        };
    }

    _0c5() {
        this.failureCount = 0;
        this.successCount = 0;
        this.state = 'CLOSED';
    }
}
