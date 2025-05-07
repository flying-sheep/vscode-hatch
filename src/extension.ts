import { type ExtensionContext, window } from 'vscode'
import { HatchEnvManager } from './hatch-env-manager'
import { getEnvExtApi } from './python-envs-api'

export async function activate(context: ExtensionContext) {
	const log = window.createOutputChannel('Hatch', { log: true })
	context.subscriptions.push(log)

	const api = await getEnvExtApi()
	const envManager = new HatchEnvManager(api, log)
	context.subscriptions.push(api.registerEnvironmentManager(envManager))
}

export function deactivate() {}
