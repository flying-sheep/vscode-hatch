import { type ExtensionContext, window } from 'vscode'
import { registerLogger } from './common/logging'
import { HatchEnvManager } from './hatch-env-manager'
import { getEnvExtApi } from './python-envs-api'

export async function activate(context: ExtensionContext) {
	const log = window.createOutputChannel('Hatch', { log: true })

	context.subscriptions.push(log, registerLogger(log))

	const api = await getEnvExtApi()
	const envManager = new HatchEnvManager(api)
	context.subscriptions.push(api.registerEnvironmentManager(envManager))
}

export function deactivate() {}
