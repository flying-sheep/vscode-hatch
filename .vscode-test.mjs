import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
	files: 'src/test/**/*.test.ts',
	mocha: {
		require: '@swc-node/register',
	},
})
