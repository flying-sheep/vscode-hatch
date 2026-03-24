import { type ExtensionContext, window } from 'vscode'
import { registerLogger } from './common/logging.js'
import { setWorkspacePersistentState } from './common/persistent-state.js'
import { HatchEnvManager } from './hatch-env-manager.js'
import { HatchPackageManager } from './hatch-pkg-manager.js'
import { getEnvExtApi } from './python-envs-api.js'

export async function activate(context: ExtensionContext) {
	const log = window.createOutputChannel('Hatch', { log: true })

	context.subscriptions.push(log, registerLogger(log))

	const api = await getEnvExtApi()
	await setWorkspacePersistentState(context) // resolves instantly
	const envManager = new HatchEnvManager(api, log)
	const pkgManager = new HatchPackageManager(api, log)
	context.subscriptions.push(
		api.registerEnvironmentManager(envManager),
		api.registerPackageManager(pkgManager),
	)
}

export function deactivate() {}
