import { describe, expect, test } from 'vitest';
import { generateTimeouts } from '../src/generate-timeouts';

describe(`generate-timeouts`, () => {
	test(`should generate timeouts`, async () => {
		const timeouts = generateTimeouts();
		expect(timeouts).toEqual([10, 60, 360, 2160, 12960]);
	});
});
