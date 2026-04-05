import execFile from './exec-file.js'
import type { HatchEnvInfo } from './hatch.js'

export interface InstallOptions {
	upgrade?: boolean
}

export default class Installer {
	#hatch: string
	#exec: typeof execFile
	constructor(hatch: string, exec: typeof execFile = execFile) {
		this.#hatch = hatch
		this.#exec = exec
	}

	async #runPipOrUv(
		env: HatchEnvInfo,
		args: string[],
	): Promise<{ stdout: string; stderr: string }> {
		const args_ =
			env.conf.installer === 'uv'
				? ['uv', 'pip', ...args]
				: [
						'pip',
						...args,
						...(args[0] === 'uninstall' ? ['--yes'] : []),
					]

		return this.#exec(this.#hatch, ['-e', env.name, 'run', ...args_], {
			cwd: env.projectPath,
		})
	}

	async listPackages(
		env: HatchEnvInfo,
	): Promise<{ name: string; version: string }[]> {
		const { stdout } = await this.#runPipOrUv(env, [
			'list',
			'--format=json',
		])
		return JSON.parse(stdout) as { name: string; version: string }[]
	}

	async installPackages(
		env: HatchEnvInfo,
		packages: string[],
		{ upgrade = false }: InstallOptions = {},
	): Promise<void> {
		const args = [...(upgrade ? ['--upgrade'] : []), ...packages]
		await this.#runPipOrUv(env, ['install', ...args])
	}

	async uninstallPackages(
		env: HatchEnvInfo,
		packages: string[],
	): Promise<void> {
		await this.#runPipOrUv(env, ['uninstall', ...packages])
	}
}
