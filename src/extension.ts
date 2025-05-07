import { type ExtensionContext, window } from 'vscode'
import { HatchEnvManager } from './hatchEnvManager'
import { getEnvExtApi } from './pythonEnvsApi'

export async function activate(context: ExtensionContext) {
	const log = window.createOutputChannel('Hatch', { log: true })
	context.subscriptions.push(log)

	const api = await getEnvExtApi()
	const envManager = new HatchEnvManager(api, log)
	context.subscriptions.push(api.registerEnvironmentManager(envManager))
}

export function deactivate() {}
