// See https://github.com/microsoft/vscode-python-environments/blob/main/examples/README.md#create-your-extension

import * as vscode from 'vscode'
import { ENVS_EXT_ID } from './common/constants.js'
import type { PythonEnvironmentApi } from './vscode-python-environments/index.js'

let _extApi: PythonEnvironmentApi | undefined
export async function getEnvExtApi(): Promise<PythonEnvironmentApi> {
	if (_extApi) {
		return _extApi
	}
	const extension =
		vscode.extensions.getExtension<PythonEnvironmentApi>(ENVS_EXT_ID)
	if (!extension) {
		throw new Error('Python Environments extension not found.')
	}
	if (!extension.isActive) {
		await extension.activate()
	}
	_extApi = extension.exports
	return _extApi
}
