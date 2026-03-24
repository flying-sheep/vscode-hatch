import { run } from './index.js'

export interface HatchEnvInfo {
	name: string
	path: string
	conf: HatchEnvConf
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

export async function getEnvs(cwd: string): Promise<HatchEnvInfo[]> {
	const json = await run('hatch', ['env', 'show', '--json'], { cwd })
	const envs = JSON.parse(json) as { [name: string]: HatchEnvConf }
	return await Promise.all(
		Object.entries(envs).map(async ([name, conf]) => ({
			name,
			conf,
			path: await findEnv(name, cwd),
		})),
	)
}

export async function findEnv(name: string, cwd: string): Promise<string> {
	const results = await run('hatch', ['env', 'find', name], { cwd })
	const [p] = results
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
	return p
}

export async function createEnv(
	name: string,
	cwd: string,
	{ existOk = false }: { existOk?: boolean } = {},
): Promise<void> {
	const args = existOk
		? ['-e', name, 'run', 'python', '-V']
		: ['env', 'create', name]
	await run('hatch', args, { cwd })
}

export async function removeEnv(name: string, cwd: string): Promise<void> {
	await run('hatch', ['env', 'remove', name], { cwd })
}

