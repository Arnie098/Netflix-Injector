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

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error(`Circuit breaker is OPEN. Retry after ${new Date(this.nextAttempt).toLocaleTimeString()}`);
            }
            this.state = 'HALF_OPEN';
            Logger.info('CIRCUIT_BREAKER', 'Entering HALF_OPEN state - testing recovery');
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            Logger.debug('CIRCUIT_BREAKER', `HALF_OPEN success ${this.successCount}/${this.halfOpenAttempts}`);

            if (this.successCount >= this.halfOpenAttempts) {
                this.state = 'CLOSED';
                this.failureCount = 0;
                this.successCount = 0;
                Logger.info('CIRCUIT_BREAKER', 'Circuit CLOSED - server recovered');
            }
        } else {
            this.failureCount = 0;
        }
    }

    onFailure() {
        this.successCount = 0;
        this.failureCount++;

        if (this.failureCount >= this.threshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            Logger.error('CIRCUIT_BREAKER', `Circuit OPEN after ${this.failureCount} failures`, {
                nextAttempt: new Date(this.nextAttempt).toISOString(),
                waitSeconds: Math.round(this.timeout / 1000)
            });
        }
    }

    getState() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt) : null,
            isHealthy: this.state === 'CLOSED'
        };
    }

    reset() {
        this.failureCount = 0;
        this.successCount = 0;
        this.state = 'CLOSED';
        Logger.info('CIRCUIT_BREAKER', 'Circuit manually reset');
    }
}
