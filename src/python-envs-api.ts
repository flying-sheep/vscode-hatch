// See https://github.com/microsoft/vscode-python-environments/blob/main/examples/README.md#create-your-extension

import * as vscode from 'vscode'
import type { PythonEnvironmentApi } from './vscode-python-environments'

let _extApi: PythonEnvironmentApi | undefined
export async function getEnvExtApi(): Promise<PythonEnvironmentApi> {
	if (_extApi) {
		return _extApi
	}
	const extension = vscode.extensions.getExtension<PythonEnvironmentApi>(
		'ms-python.vscode-python-envs',
	)
	if (!extension) {
		throw new Error('Python Environments extension not found.')
	}
	if (!extension.isActive) {
		await extension.activate()
	}
	_extApi = extension.exports
	return _extApi
}
