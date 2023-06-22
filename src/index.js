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
 * @extends {Error}
 */
class AbortError extends Error {
	constructor(message) {
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
 * decorateErrorWithCounts decorates an error with the current attemptNumber
 * and retry counts.
 * @param {T} error
 * @param {number} attemptNumber
 * @param {{ retries: number }} options
 * @returns {T}
 * @template {Error} T
 */
function decorateErrorWithCounts(error, attemptNumber, options) {
	// NOTE(joel): The first attempt does not count as retry.
	const retriesLeft = options.retries - (attemptNumber - 1);

	error.attemptNumber = attemptNumber;
	error.retriesLeft = retriesLeft;
	return error;
}

////////////////////////////////////////////////////////////////////////////////

/**
 * isNetworkError checks if a given string is a network error.
 * @param {string} errorMessage
 * @returns {Boolean}
 */
function isNetworkError(errorMessage) {
	return networkErrorMsgs.includes(errorMessage);
}

////////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {Object} RetryOptions
 * @prop {number} [retries=3]
 * @prop {number} [factor=2]
 * @prop {number} [minTimeout=1000]
 * @prop {number} [maxTimeout=Infinity]
 * @prop {(err: Error) => void | Promise<void>} [onFailedAttempt=() => {}]
 */

/**
 * retry
 * @template T
 * @param {(attemptCount: number) => PromiseLike<T> | T} input
 * @param {RetryOptions} [options]
 * @returns {Promise<T>}
 */
export function retry(input, options) {
	return new Promise((resolve, reject) => {
		options = {
			onFailedAttempt: () => {},
			retries: 3,
			factor: 2,
			minTimeout: 1000,
			maxTimeout: Infinity,
			...options,
		};

		if (options.minTimeout > options.maxTimeout) {
			throw new Error('minTimeout must be less than maxTimeout');
		}

		let timeouts = generateTimeouts(
			options.retries,
			options.minTimeout,
			options.maxTimeout,
			options.factor,
		);

		/** @type {Array<Error>} */
		let errors = [];
		/** @type {number} */
		let operationStart;
		/** @type {(attempts: number) => {}} */
		let fn;
		let attempts = 1;
		/** @type {NodeJS.Timeout} */
		let timeoutId;
		let maxRetryTime = timeouts[timeouts.length - 1];

		/**
		 * attempt persists the function that will be retrier in a local
		 * variable so we can call it again if it needs to be retried.
		 * @param {(attempts: number) => any | Promise<any>} _fn
		 */
		function attempt(_fn) {
			fn = _fn;
			operationStart = new Date().getTime();
			fn(attempts);
		}

		/**
		 * retry checks if an error occured and schedules a retry attempt.
		 * @param {Error} err
		 * @returns {Boolean}
		 */
		function retry(err) {
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
		 * @returns {Error}
		 */
		function mainError() {
			if (errors.length === 0) return null;

			/** @type {{[key: string]: number}} */
			let counts = {};
			/** @type {Error} */
			let mainError;
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
					decorateErrorWithCounts(err, attemptNumber, options);

					try {
						await options.onFailedAttempt(err);
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
