import { assert, describe, expect, test } from 'vitest';
import { retry } from '../src/index';

const delay = ms => new Promise(r => setTimeout(r, ms));

describe(`retry`, () => {
	const fixture = Symbol('fixture');
	const fixtureError = new Error('fixture');

	test(`should handle retries`, async () => {
		let counter = 0;

		const ret = await retry(async attemptNumber => {
			await delay(40);
			counter++;
			return attemptNumber === 3 ? fixture : Promise.reject(fixtureError);
		});

		expect(ret).toBe(fixture);
		expect(counter).toBe(3);
	});

	test(`should handle errors`, async () => {
		expect.assertions(2);

		let counter = 0;

		try {
			await retry(async attemptNumber => {
				await delay(40);
				counter++;
				return attemptNumber === 3
					? Promise.reject(new retry.AbortError(fixtureError))
					: Promise.reject(fixtureError);
			});
		} catch (err) {
			expect(err).toBe(fixtureError);
		}

		expect(counter).toBe(3);
	});

	test(`should not retry on TypeError`, async () => {
		expect.assertions(2);

		const typeErrorFixture = new TypeError('type-error-fixture');
		let counter = 0;

		try {
			await retry(async attemptNumber => {
				await delay(40);
				counter++;
				return attemptNumber === 3 ? fixture : Promise.reject(typeErrorFixture);
			});
		} catch (err) {
			expect(err).toBe(typeErrorFixture);
		}

		expect(counter).toBe(1);
	});

	test(`should retry on TypeError "Failed to fetch" (Chrome network error)`, async () => {
		const typeErrorFixture = new TypeError('Failed to fetch');
		let counter = 0;

		const ret = await retry(async attemptNumber => {
			await delay(40);
			counter++;
			return attemptNumber === 3 ? fixture : Promise.reject(typeErrorFixture);
		});

		expect(ret).toBe(fixture);
		expect(counter).toBe(3);
	});

	test(`should call 'onFailedAttempt' the expected number of times`, async () => {
		expect.assertions(10);

		const retries = 5;
		let counter = 0;
		let attempts = 0;

		await retry(
			async attemptNumber => {
				await delay(40);
				counter++;
				return attemptNumber === 3 ? fixture : Promise.reject(fixtureError);
			},
			{
				onFailedAttempt: err => {
					expect(err.name).toBe('AttemptError');
					expect(err.message).toBe(fixtureError.message);
					expect(err.attemptNumber).toBe(++attempts);

					switch (counter) {
						case 1:
							expect(err.retriesLeft).toBe(retries);
							break;
						case 2:
							expect(err.retriesLeft).toBe(4);
							break;
						case 3:
							expect(err.retriesLeft).toBe(3);
							break;
						case 4:
							expect(err.retriesLeft).toBe(2);
							break;
						default:
							assert.fail('onFailedAttempt was called more than 4 times');
							break;
					}
				},
				retries,
			},
		);

		expect(counter).toBe(3);
		expect(attempts).toBe(2);
	});

	test(`should call 'onFailedAttempt' before last rejection`, async () => {
		expect.assertions(19);

		const retries = 3;
		let counter = 0;
		let attempts = 0;

		try {
			await retry(
				async () => {
					await delay(40);
					counter++;
					return Promise.reject(fixtureError);
				},
				{
					onFailedAttempt: err => {
						expect(err.name).toBe('AttemptError');
						expect(err.message).toBe(fixtureError.message);
						expect(err.attemptNumber).toBe(++attempts);

						switch (counter) {
							case 1:
								expect(err.retriesLeft).toBe(retries);
								break;
							case 2:
								expect(err.retriesLeft).toBe(2);
								break;
							case 3:
								expect(err.retriesLeft).toBe(1);
								break;
							case 4:
								expect(err.retriesLeft).toBe(0);
								break;
							default:
								assert.fail('onFailedAttempt was called more than 4 times');
								break;
						}
					},
					retries,
				},
			);
		} catch (err) {
			expect(err).toBe(fixtureError);
		}

		expect(counter).toBe(4);
		expect(attempts).toBe(4);
	}, 10000);

	test(`should allow 'onFailedAttempt' to return a Promise to add delay`, async () => {
		const waitFor = 1000;
		const start = Date.now();
		let isCalled: boolean;

		await retry(
			async () => {
				if (isCalled) {
					return fixture;
				}

				isCalled = true;

				throw fixtureError;
			},
			{
				onFailedAttempt: async () => {
					await delay(waitFor);
				},
			},
		);

		expect(Date.now() > start + waitFor).toBe(true);
	});

	test(`should allow 'onFailedAttempt' to throw, causing all retries to be aborted`, async () => {
		expect.assertions(1);
		const error = new Error('thrown from onFailedAttempt');

		try {
			await retry(
				async () => {
					throw fixtureError;
				},
				{
					onFailedAttempt: () => {
						throw error;
					},
				},
			);
		} catch (err) {
			expect(err).toBe(error);
		}
	});

	test(`should throw a useful error message`, async () => {
		try {
			await retry(() => {
				throw 'unuseful';
			});
		} catch (err) {
			expect(err.message).toBe(
				'Non-error was thrown: "unuseful". You should only throw errors.',
			);
		}
	});
});
