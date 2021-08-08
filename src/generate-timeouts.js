/**
 * generateTimeouts generates timeout numbers in milliseconds for as many
 * retries as given.
 * @param {number} [retries=6]
 * @param {number} [min=10]
 * @param {number} [max=Infinity]
 * @param {number} [factor=6]
 * @returns {Array<number>}
 */
export function generateTimeouts(
	retries = 5,
	min = 10,
	max = Infinity,
	factor = 6,
) {
	let timeouts = [];
	for (let i = 0; i < retries; i++) {
		let timeout = Math.min(
			Math.round(Math.max(min, 1) * Math.pow(factor, i)),
			max,
		);
		timeouts.push(timeout);
	}
	return timeouts;
}
