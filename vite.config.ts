/// <reference types="vitest" />

import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { bundleDts } from "vite-plugin-bundle-dts";
import packageJson from "./package.json";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		bundleDts({
			rollupTypes: true,
			logLevel: "error",
			// NOTE(joel): Exclude @types/node from declaration emit so that
			// api-extractor does not encounter the NodeJS namespace (e.g.
			// NodeJS.CallSite on Error.prepareStackTrace) and crash.
			compilerOptions: { types: [] },
		}),
	],
	build: {
		// NOTE(joel): Don't minify, because every consumer will minify themselves
		// anyway. We're only bundling for the sake of publishing to npm.
		minify: false,
		lib: {
			entry: resolve(__dirname, packageJson.source),
			formats: ["cjs", "es"],
			fileName: parse(packageJson.module).name,
		},
	},
});
