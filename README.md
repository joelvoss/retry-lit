# retry-lit

Helper method to retry a promise-returning or async function.
It does exponential backoff and supports custom retry strategies for
failed operations.

## Requirements

- [Node v12+](node+npm)
- [npm v6+](node+npm)

## Installation

```bash
$ npm i retry-lit
# or
$ yarn add retry-lit
```

## Example

```js
const { retry } = require('retry-lit');
const fetch = require('node-fetch');

(async () => {
	// 1️⃣ Wrap your async function with `retry`.
	await retry(
		async () => {
			const response = await fetch('https://example.com');
			// 2️⃣ Abort retrying if the resource doesn't exist.
			if (response.status === 404) {
				throw new retry.AbortError(response.statusText);
			}
			return response.blob();
		},
		// ℹ️ Retry 5 times.
		{ retries: 5 },
	);
})();
```

## API

### `retry(input, options?)`

#### `input`

Type: `Function`

The target URL of the request.

#### `options?`

Type: `Object`

The optional retry configuration.

```js
{
  // The maximum amount of times to retry the operation. Default is 3.
  // Setting this to 1 means do it once, then retry it once.
  retries: 3,

  // The exponential factor to use. Default is 2.
  factor: 2,

  // The number of milliseconds before starting the first retry.
  // Default is 1000.
  minTimeout: 1000,

  // The maximum number of milliseconds between two retries.
  // Default is Infinity.
  maxTimeout: Infinity,

  // Callback invoked on each retry. Receives the error thrown by input as
  // the first argument with properties attemptNumber and retriesLeft which
  // indicate the current attempt number and the number of attempts left,
  // respectively.
  onFailedAttempt: (error) => {}
}
```

> Note: The `onFailedAttempt` function can return a promise. For example to
> call a remote logging service.
> If the `onFailedAttempt` function throws, all retries will be aborted and the
> original promise will reject with the thrown error.

### `retry.AbortError(message)`

### `retry.AbortError(error)`

Abort retrying and reject the promise.

#### `message`

Type: `string`

Error message.

#### `error`

Type: `Error`

Custom error.

## Development

(1) Install dependencies

```bash
$ npm i
# or
$ yarn
```

(2) Run initial validation

```bash
$ ./Taskfile.sh validate
```

(3) Start developing. See [`./Taskfile.sh`](./Taskfile.sh) for more tasks to
help you develop.

---

_This project was set up by @jvdx/core_
