import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import untildify from 'untildify'
import type { ConfigurationChangeEvent } from 'vscode'
import { type Disposable, window, workspace } from 'vscode'
import which from 'which'
import type { HatchEnvInfo } from './hatch.js'
import * as hatch from './hatch.js'
import * as installer from './installer.js'

export const execFile = promisify(execFileCb)

export type { HatchEnvInfo }

export class HatchExecutableTracker {
	private constructor(executable: string) {
		this.#executable = executable
		this.#configChangeListener = workspace.onDidChangeConfiguration((e) =>
			this.#handleConfigChange(e),
		)
	}

	static async create(): Promise<HatchExecutableTracker> {
		const executable = await getHatch()
		return new HatchExecutableTracker(executable)
	}

	#executable: string
	#configChangeListener: Disposable

	get executable(): string {
		return this.#executable
	}

	async #handleConfigChange(e: ConfigurationChangeEvent): Promise<void> {
		if (e.affectsConfiguration('hatch.executable')) {
			this.#executable = await getHatch()
		}
	}

	dispose() {
		this.#configChangeListener.dispose()
	}

	getEnvs(projectPath: string): Promise<HatchEnvInfo[]> {
		return hatch.getEnvs(this.#executable, projectPath)
	}
	findEnv(env: HatchEnvInfo): Promise<string> {
		return hatch.findEnv(this.#executable, env)
	}
	removeEnv(env: HatchEnvInfo): Promise<void> {
		return hatch.removeEnv(this.#executable, env)
	}
	createEnv(env: HatchEnvInfo, opts?: hatch.CreateEnvOptions): Promise<void> {
		return hatch.createEnv(this.#executable, env, opts)
	}

	listPackages(
		env: HatchEnvInfo,
	): Promise<{ name: string; version: string }[]> {
		return installer.listPackages(this.#executable, env)
	}
	async installPackages(
		env: HatchEnvInfo,
		packages: string[],
		opts: installer.InstallOptions = {},
	): Promise<void> {
		return installer.installPackages(this.#executable, env, packages, opts)
	}
	async uninstallPackages(
		env: HatchEnvInfo,
		packages: string[],
	): Promise<void> {
		return installer.uninstallPackages(this.#executable, env, packages)
	}
}

async function getHatch(): Promise<string> {
	const value =
		workspace.getConfiguration('hatch').get<string>('executable') ?? ''
	if (value.length > 0) return untildify(value)
	const path = await which('hatch', { nothrow: true })
	if (!path) {
		const errorMsg =
			'Hatch executable not found. Please install Hatch or set "hatch.executable" in your settings.'
		window.showErrorMessage(errorMsg)
		throw new Error(errorMsg)
	}
	return path
}

export default HatchExecutableTracker
