import { type ExtensionContext, window } from 'vscode'
import { HatchExecutableTracker } from './cli/index.js'
import { registerLogger } from './common/logging.js'
import { setWorkspacePersistentState } from './common/persistent-state.js'
import { HatchEnvManager } from './hatch-env-manager.js'
import { HatchPackageManager } from './hatch-pkg-manager.js'
import { getEnvExtApi } from './python-envs-api.js'

export interface Api {
	envManager: HatchEnvManager
	pkgManager: HatchPackageManager
}

export async function activate(context: ExtensionContext): Promise<Api> {
	const log = window.createOutputChannel('Hatch', { log: true })
	context.subscriptions.push(log, registerLogger(log))

	const [hatchExe, api] = await Promise.all([
		HatchExecutableTracker.create(log),
		getEnvExtApi(),
	])
	await setWorkspacePersistentState(context) // resolves instantly
	const envManager = new HatchEnvManager(api, hatchExe, log)
	const pkgManager = new HatchPackageManager(api, hatchExe, log)
	context.subscriptions.push(
		hatchExe,
		api.registerEnvironmentManager(envManager),
		api.registerPackageManager(pkgManager),
	)

	return {
		envManager,
		pkgManager,
	}
}

export function deactivate() {}
