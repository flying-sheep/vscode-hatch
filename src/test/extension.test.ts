import * as assert from 'node:assert'
import * as fs from 'node:fs/promises'
import { suiteSetup } from 'mocha'
import * as vscode from 'vscode'
import { ENVS_EXT_ID, EXTENSION_ID } from '../common/constants'
import type * as extension from '../extension'
import type {
	EnvironmentManager,
	PythonEnvironmentApi,
} from '../vscode-python-environments'
import { waitForCondition } from './test-utils'

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

	let api: PythonEnvironmentApi
	let envManager: EnvironmentManager
	suiteSetup(async function () {
		this.timeout(50_000)
		api = await getExtApi(ENVS_EXT_ID, 20_000)
		assert.ok(api, 'Evironments extension API not available')
		envManager = (await getExtApi(EXTENSION_ID, 20_000)).envManager
		assert.ok(envManager, 'Hatch extension API not available')
	})

	it('should return environments', async () => {
		const uri = vscode.Uri.file(await fs.mkdtemp('hatch-'))
		api.addPythonProject({ name: 'test', uri })
		await envManager.refresh(uri)
		const envs = await envManager.getEnvironments(uri)
		assert.ok(envs.length > 0, 'No environments found')
	})
})
