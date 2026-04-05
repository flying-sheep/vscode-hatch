import type { ExecFileException } from 'node:child_process'
import untildify from 'untildify'
import type { ConfigurationChangeEvent } from 'vscode'
import {
	type Disposable,
	type LogOutputChannel,
	window,
	workspace,
} from 'vscode'
import which from 'which'
import { traceError } from '../common/logging.js'
import execFile, { type ExecFile } from './exec-file.js'
import type { CreateEnvOptions, HatchEnvInfo } from './hatch.js'
import Hatch from './hatch.js'
import Installer, { type InstallOptions } from './installer.js'

export type { HatchEnvInfo }

const EXE_CONFIG_KEY = 'hatch.executable'
const EXE_CONFIG_SECTION = 'hatch' // dotted section name
const EXE_CONFIG_SETTING = 'executable' // last element

const VIEW_LOGS = 'View Logs'

function isExecFileError(e: unknown): e is ExecFileException {
	return typeof (e as ExecFileException).stderr === 'string'
}

/** Suggest to update the configuration if an error occurs */
function suggestExeConfig<
	This extends { readonly log: LogOutputChannel },
	Args extends unknown[],
	Return,
>(target: (this: This, ...args: Args) => Promise<Return>) {
	return async function (this: This, ...args: Args) {
		try {
			return await target.call(this, ...args)
		} catch (e) {
			const result = await window.showErrorMessage(
				`Error executing hatch: ${e}. Maybe you need to update "${EXE_CONFIG_KEY}" in your settings.`,
				VIEW_LOGS,
			)
			if (result === VIEW_LOGS) this.log.show()
			traceError(e, ...(isExecFileError(e) ? [e.stderr] : []))
			throw e
		}
	}
}

export class HatchExecutableTracker {
	#executable: string
	#configChangeListener: Disposable
	private constructor(
		executable: string,
		readonly log: LogOutputChannel,
		public exec: ExecFile = execFile,
	) {
		this.#executable = executable
		this.#configChangeListener = workspace.onDidChangeConfiguration((e) =>
			this.#handleConfigChange(e),
		)
	}

	static async create(
		log: LogOutputChannel,
		exec?: ExecFile | undefined,
	): Promise<HatchExecutableTracker> {
		const executable = await getHatch()
		return new HatchExecutableTracker(executable, log, exec)
	}

	get executable(): string {
		return this.#executable
	}

	get #hatch(): Hatch {
		return new Hatch(this.#executable, this.exec)
	}

	get #inst(): Installer {
		return new Installer(this.#executable, this.exec)
	}

	async #handleConfigChange(e: ConfigurationChangeEvent): Promise<void> {
		if (e.affectsConfiguration(EXE_CONFIG_KEY)) {
			this.#executable = await getHatch()
		}
	}

	dispose() {
		this.#configChangeListener.dispose()
	}

	@suggestExeConfig
	getEnvs(projectPath: string): Promise<HatchEnvInfo[]> {
		return this.#hatch.getEnvs(projectPath)
	}
	@suggestExeConfig
	findEnv(env: HatchEnvInfo): Promise<string> {
		return this.#hatch.findEnv(env)
	}
	@suggestExeConfig
	removeEnv(env: HatchEnvInfo): Promise<void> {
		return this.#hatch.removeEnv(env)
	}
	@suggestExeConfig
	createEnv(env: HatchEnvInfo, opts?: CreateEnvOptions): Promise<void> {
		return this.#hatch.createEnv(env, opts)
	}

	@suggestExeConfig
	listPackages(
		env: HatchEnvInfo,
	): Promise<{ name: string; version: string }[]> {
		return this.#inst.listPackages(env)
	}
	@suggestExeConfig
	installPackages(
		env: HatchEnvInfo,
		packages: string[],
		opts: InstallOptions = {},
	): Promise<void> {
		return this.#inst.installPackages(env, packages, opts)
	}
	@suggestExeConfig
	uninstallPackages(env: HatchEnvInfo, packages: string[]): Promise<void> {
		return this.#inst.uninstallPackages(env, packages)
	}
}

async function getHatch(): Promise<string> {
	const value =
		workspace
			.getConfiguration(EXE_CONFIG_SECTION)
			.get<string>(EXE_CONFIG_SETTING) ?? ''
	if (value.length > 0) return untildify(value)
	const path = await which('hatch', { nothrow: true })
	if (!path) {
		const errorMsg = `Hatch executable not found. Please install Hatch or set "${EXE_CONFIG_KEY}" in your settings.`
		window.showErrorMessage(errorMsg)
		throw new Error(errorMsg)
	}
	return path
}
