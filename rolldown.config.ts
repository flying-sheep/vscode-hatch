import swc from '@rollup/plugin-swc'
import { defineConfig } from 'rolldown'
import { withFilter } from 'rolldown/filter'
import { esmExternalRequirePlugin } from 'rolldown/plugins'
import { EXTENSION_ID } from './src/common/constants.js'

export default defineConfig({
	input: 'src/extension.ts',
	external: ['vscode'],
	output: {
		file: `dist/${EXTENSION_ID}/extension.js`,
		sourcemap: true,
	},
	platform: 'node',
	plugins: [
		// https://github.com/oxc-project/oxc/issues/9170
		withFilter(
			swc({
				swc: {
					jsc: {
						parser: { decorators: true, syntax: 'typescript' },
						transform: { decoratorVersion: '2023-11' },
					},
				},
			}),
			// Only run this transform if the file contains a decorator.
			{ transform: { code: '@' } },
		),
		// https://github.com/npm/node-which/issues/174
		esmExternalRequirePlugin({ external: [/^node:/, 'path'] }),
	],
})
