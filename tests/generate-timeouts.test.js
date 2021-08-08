import { generateTimeouts } from '../src/generate-timeouts';

describe(`generate-timeouts`, () => {
	it(`should generate timeouts`, async () => {
		const timeouts = generateTimeouts();
		expect(timeouts).toEqual([10, 60, 360, 2160, 12960]);
	});
});
