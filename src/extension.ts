import type { ExtensionContext } from 'vscode'
import { getEnvExtApi } from './pythonEnvsApi'
import { HatchEnvManager } from './hatchEnvManager'

export async function activate(context: ExtensionContext) {
	const api = await getEnvExtApi()
	const envManager = new HatchEnvManager(api)
	context.subscriptions.push(api.registerEnvironmentManager(envManager))
}

export function deactivate() {}
