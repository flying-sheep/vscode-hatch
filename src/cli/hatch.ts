import { run } from './index.js'

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

export async function getEnvs(
	hatch: string,
	projectPath: string,
): Promise<HatchEnvInfo[]> {
	const json = await run(hatch, ['env', 'show', '--json'], {
		cwd: projectPath,
	})
	const envs = JSON.parse(json) as { [name: string]: HatchEnvConf }
	return await Promise.all(
		Object.entries(envs).map(async ([name, conf]) => ({
			name,
			conf,
			path: await findEnv(hatch, name, projectPath),
			projectPath,
		})),
	)
}

export async function findEnv(
	hatch: string,
	name: string,
	projectPath: string,
): Promise<string> {
	const results = await run(hatch, ['env', 'find', name], {
		cwd: projectPath,
	})
	const [p] = results
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
	return p
}

interface CreateEnvOptions {
	mode?: 'create' | 'sync' | 'ensure'
}

export async function createEnv(
	hatch: string,
	name: string,
	projectPath: string,
	{ mode = 'create' }: CreateEnvOptions = {},
): Promise<void> {
	const args =
		mode === 'sync'
			? ['-e', name, 'run', 'python', '-V']
			: ['env', 'create', name]
	if (mode === 'ensure')
		try {
			await run(hatch, args, { cwd: projectPath })
		} catch (_) {}
	await run(hatch, args, { cwd: projectPath })
}

export async function removeEnv(
	hatch: string,
	name: string,
	projectPath: string,
): Promise<void> {
	await run(hatch, ['env', 'remove', name], { cwd: projectPath })
}
