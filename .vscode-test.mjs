import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
	workspaceFolder: 'test/workspace',
	files: 'test/**/*.test.ts',
	mocha: {
		ui: 'bdd',
		// TODO: replace with @oxc-node/core/register when its supports decorators
		require: '@swc-node/register',
		failZero: true,
		timeout: 10_000, // longer default timeout
	},
})
