import { generateTimeouts } from './generate-timeouts';

const networkErrorMsgs = [
	'Failed to fetch', // Chrome
	'NetworkError when attempting to fetch resource.', // Firefox
	'The Internet connection appears to be offline.', // Safari
	'Network request failed', // cross-fetch
];

////////////////////////////////////////////////////////////////////////////////

/**
 * AbortError is a special error instance that can be used to abort the
 * retry process.
 */
class AbortError extends Error {
	originalError: Error;

	constructor(message: string | Error) {
		super();

		if (message instanceof Error) {
			this.originalError = message;
			({ message } = message);
		} else {
			this.originalError = new Error(message);
			this.originalError.stack = this.stack;
		}

		this.name = 'AbortError';
		this.message = message;
	}
}

////////////////////////////////////////////////////////////////////////////////

/**
 * AttemptError is a special error instance that is thrown when a retry
 * attempt fails.
 */
class AttemptError extends Error {
	attemptNumber: number = 0;
	retriesLeft: number = 0;

	constructor(message: string) {
		super();
		this.name = 'AttemptError';
		this.message = message;
	}
}

////////////////////////////////////////////////////////////////////////////////

/**
 * isNetworkError checks if a given string is a network error.
 */
function isNetworkError(errorMessage: string) {
	return networkErrorMsgs.includes(errorMessage);
}

////////////////////////////////////////////////////////////////////////////////

type RetryInput<T> = (attemptCount: number) => PromiseLike<T> | T;

type RetryOptions = {
	retries?: number;
	factor?: number;
	minTimeout?: number;
	maxTimeout?: number;
	onFailedAttempt?: (err: AttemptError) => void | Promise<void>;
};

type AttemptFn = (attempts: number) => void;

/**
 * retry retries a function that returns a promise, leveraging the `retry`
 */
export function retry<T>(
	input: RetryInput<T>,
	options: RetryOptions = {},
): Promise<T> {
	return new Promise((resolve, reject) => {
		const opts = {
			onFailedAttempt: () => {},
			retries: 3,
			factor: 2,
			minTimeout: 1000,
			maxTimeout: Infinity,
			...options,
		};

		if (opts.minTimeout > opts.maxTimeout) {
			throw new Error('minTimeout must be less than maxTimeout');
		}

		let timeouts = generateTimeouts(
			opts.retries,
			opts.minTimeout,
			opts.maxTimeout,
			opts.factor,
		);

		let errors: Array<Error> = [];
		let operationStart: number;
		let fn: AttemptFn;
		let attempts = 1;
		let timeoutId: NodeJS.Timeout;
		let maxRetryTime = timeouts[timeouts.length - 1];

		/**
		 * attempt persists the function that will be retrier in a local
		 * variable so we can call it again if it needs to be retried.
		 */
		function attempt(_fn: AttemptFn) {
			fn = _fn;
			operationStart = new Date().getTime();
			fn(attempts);
		}

		/**
		 * retry checks if an error occured and schedules a retry attempt.
		 */
		function retry(err: Error) {
			// NOTE(joel): Abort early, if there was no error.
			if (!err) return false;

			let currentTime = new Date().getTime();

			if (err && currentTime - operationStart >= maxRetryTime) {
				errors.push(err);
				errors.unshift(new Error('Maximum retry timeout reached'));
				return false;
			}

			errors.push(err);

			let timeout = timeouts.shift();
			if (timeout === undefined) return false;

			timeoutId = setTimeout(() => {
				attempts++;
				fn(attempts);
			}, timeout);

			// Allow the node process to exit before the timer ends. This is only
			// relevant server side.
			// @see https://nodejs.org/api/timers.html#timers_immediate_unref
			if (typeof timeoutId.unref === 'function') {
				timeoutId.unref();
			}

			return true;
		}

		/**
		 * stop stops the currently scheduled retry attempt. No retries will be
		 * scheduled after this.
		 */
		function stop() {
			if (timeoutId) clearTimeout(timeoutId);
			timeouts = [];
		}

		/**
		 * mainError parses all errors which lead to a retry attempt and returns
		 * the last one.
		 */
		function mainError() {
			if (errors.length === 0) return null;

			let counts: Record<string, number> = {};
			let mainError: Error | null = null;
			let mainErrorCount = 0;

			for (let i = 0; i < errors.length; i++) {
				let error = errors[i];
				let message = error.message;
				let count = (counts[message] || 0) + 1;

				counts[message] = count;

				if (count >= mainErrorCount) {
					mainError = error;
					mainErrorCount = count;
				}
			}

			return mainError;
		}

		attempt(async attemptNumber => {
			try {
				resolve(await input(attemptNumber));
			} catch (err) {
				if (!(err instanceof Error)) {
					reject(
						new TypeError(
							`Non-error was thrown: "${err}". You should only throw errors.`,
						),
					);
					return;
				}

				if (err instanceof AbortError) {
					stop();
					reject(err.originalError);
				} else if (err instanceof TypeError && !isNetworkError(err.message)) {
					stop();
					reject(err);
				} else {
					// NOTE(joel): The first attempt does not count as retry.
					const retriesLeft = opts.retries - (attemptNumber - 1);

					const attemptErr = new AttemptError(err.message);
					attemptErr.attemptNumber = attemptNumber;
					attemptErr.retriesLeft = retriesLeft;

					try {
						await opts.onFailedAttempt(attemptErr);
					} catch (error) {
						reject(error);
						return;
					}

					if (!retry(err)) {
						reject(mainError());
					}
				}
			}
		});
	});
}

retry.AbortError = AbortError;
