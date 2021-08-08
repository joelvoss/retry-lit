import { AbortError } from '../src/abort-error';

describe(`AbortError`, () => {
	it(`should handle error message string as parameter`, async () => {
		const error = new AbortError('My custom error');

		expect(error.message).toBe('My custom error');
		expect(error.name).toBe('AbortError');
		expect(error.originalError).toEqual(new Error('My custom error'));
	});

	it(`should handle an Error instance as parameter`, async () => {
		const customError = new Error('My custom error');
		const error = new AbortError(customError);

		expect(error.message).toBe('My custom error');
		expect(error.name).toBe('AbortError');
		expect(error.originalError).toEqual(customError);
	});
});
