import execFile from './exec-file.js'

export interface HatchEnvInfo {
	name: string
	path: string
	conf: HatchEnvConf
	projectPath: string
}

export interface HatchEnvConf {
	installer: 'uv' | 'pip'
	type: 'virtual'
	dependencies?: string[]
	'extra-dependencies'?: string[]
	scripts?: { [name: string]: string[] }
	'env-vars'?: { [name: string]: string }
	'default-args'?: string[]
	features?: string[]
	python?: string
	'skip-install'?: boolean
	'pre-install-commands'?: string[]
	'post-install-commands'?: string[]
	platforms?: ('windows' | 'linux' | 'macos')[]
	description?: string
}

export interface CreateEnvOptions {
	mode?: 'create' | 'sync' | 'ensure'
}

export default class Hatch {
	#hatch: string
	#exec: typeof execFile
	constructor(hatch: string, exec: typeof execFile = execFile) {
		this.#hatch = hatch
		this.#exec = exec
	}

	async getEnvs(projectPath: string): Promise<HatchEnvInfo[]> {
		const { stdout } = await this.#exec(
			this.#hatch,
			['env', 'show', '--json'],
			{
				cwd: projectPath,
			},
		)
		const envs = JSON.parse(stdout) as { [name: string]: HatchEnvConf }
		return await Promise.all(
			Object.entries(envs).map(async ([name, conf]) => ({
				name,
				conf,
				path: await this.findEnv({ name, projectPath }),
				projectPath,
			})),
		)
	}

	async findEnv({
		name,
		projectPath,
	}: Pick<HatchEnvInfo, 'name' | 'projectPath'>): Promise<string> {
		const { stdout } = await this.#exec(
			this.#hatch,
			['env', 'find', name],
			{
				cwd: projectPath,
			},
		)
		const [p] = stdout
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
		return p
	}

	async createEnv(
		{ name, projectPath }: HatchEnvInfo,
		{ mode = 'create' }: CreateEnvOptions = {},
	): Promise<void> {
		const args =
			mode === 'sync'
				? ['-e', name, 'run', 'python', '-V']
				: ['env', 'create', name]
		if (mode === 'ensure')
			try {
				await this.#exec(this.#hatch, args, { cwd: projectPath })
			} catch (_) {}
		await this.#exec(this.#hatch, args, { cwd: projectPath })
	}

	async removeEnv({ name, projectPath }: HatchEnvInfo): Promise<void> {
		await this.#exec(this.#hatch, ['env', 'remove', name], {
			cwd: projectPath,
		})
	}
}
