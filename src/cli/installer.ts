import type { HatchEnvInfo } from './hatch.js'
import run from './run.js'

async function runPipOrUv(
	hatch: string,
	env: HatchEnvInfo,
	args: string[],
): Promise<string> {
	const args_ =
		env.conf.installer === 'uv'
			? ['uv', 'pip', ...args]
			: ['pip', ...args, ...(args[0] === 'uninstall' ? ['--yes'] : [])]

	return run(hatch, ['-e', env.name, 'run', ...args_], {
		cwd: env.projectPath,
	})
}

export async function listPackages(
	hatch: string,
	env: HatchEnvInfo,
): Promise<{ name: string; version: string }[]> {
	const json = await runPipOrUv(hatch, env, ['list', '--format=json'])
	return JSON.parse(json) as { name: string; version: string }[]
}

export interface InstallOptions {
	upgrade?: boolean
}
export async function installPackages(
	hatch: string,
	env: HatchEnvInfo,
	packages: string[],
	{ upgrade = false }: InstallOptions = {},
): Promise<void> {
	const args = [...(upgrade ? ['--upgrade'] : []), ...packages]
	await runPipOrUv(hatch, env, ['install', ...args])
}

export async function uninstallPackages(
	hatch: string,
	env: HatchEnvInfo,
	packages: string[],
): Promise<void> {
	await runPipOrUv(hatch, env, ['uninstall', ...packages])
}
