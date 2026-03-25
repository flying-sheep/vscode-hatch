import untildify from 'untildify'
import type { ConfigurationChangeEvent } from 'vscode'
import { type Disposable, window, workspace } from 'vscode'
import which from 'which'

export default class HatchExecutableTracker {
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
