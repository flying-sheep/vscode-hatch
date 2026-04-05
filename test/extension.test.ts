import * as assert from 'node:assert'
import { before, beforeEach } from 'mocha'
import * as vscode from 'vscode'
import { ENVS_EXT_ID, EXTENSION_ID } from '../src/common/constants'
import type * as extension from '../src/extension'
import type {
	EnvironmentManager,
	PythonEnvironmentApi,
} from '../src/vscode-python-environments'
import MockExec from './mock-exec'
import { tmpdir, waitForCondition } from './test-utils'

const getExtApi = (() => {
	const apis: {
		[EXTENSION_ID]?: extension.Api
		[ENVS_EXT_ID]?: PythonEnvironmentApi
	} = {}

	async function getApi(
		id: typeof EXTENSION_ID,
		timeoutMs?: number,
	): Promise<extension.Api>
	async function getApi(
		id: typeof ENVS_EXT_ID,
		timeoutMs?: number,
	): Promise<PythonEnvironmentApi>
	async function getApi(
		id: keyof typeof apis,
		timeoutMs?: number,
	): Promise<extension.Api | PythonEnvironmentApi> {
		if (apis[id]) {
			return apis[id]
		}

		const extension = vscode.extensions.getExtension(id)
		assert.ok(extension, `Extension ${id} not found`)

		if (!extension.isActive) {
			await extension.activate()
			await waitForCondition(
				() => extension.isActive,
				timeoutMs,
				'Extension did not activate',
			)
		}

		apis[id] = extension.exports
		return extension.exports
	}

	return getApi
})()

describe('Env Manager', () => {
	vscode.window.showInformationMessage('Start all tests.')

	const exec = new MockExec('IDoNotExistButWeReplaceExecFile')
	beforeEach(() => exec.reset())

	let api: PythonEnvironmentApi
	let envManager: EnvironmentManager
	before(async function () {
		this.timeout(50_000)
		api = await getExtApi(ENVS_EXT_ID, 20_000)
		assert.ok(api, 'Evironments extension API not available')
		const ext = await getExtApi(EXTENSION_ID, 20_000)
		assert.ok(ext.envManager, 'Hatch extension API not available')
		ext.exe.exec = exec
		envManager = ext.envManager
	})

	it('should return environments', async () => {
		await using dir = await tmpdir('hatch-')
		api.addPythonProject({ name: 'test', uri: dir.uri })

		exec.reset(
			[['env', 'show', '--json'], { mockenv: { type: 'virtual' } }],
			[['env', 'find', 'mockenv'], 'mockpath\n'],
		)
		//This gets called automatically: await envManager.refresh(dir.uri)
		const envs = await envManager.getEnvironments(dir.uri)

		assert.ok(envs.length > 0, 'No environments found')
		assert.equal(envs[0].name, 'mockenv')
		assert.equal(envs[0].sysPrefix, 'mockpath')
	})
})
