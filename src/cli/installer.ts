import type { HatchEnvInfo } from './hatch.js'
import { run } from './index.js'

async function runPipOrUv(env: HatchEnvInfo, args: string[]): Promise<string> {
	const args_ =
		env.conf.installer === 'uv'
			? ['uv', 'pip', ...args]
			: ['pip', ...args, ...(args[0] === 'uninstall' ? ['--yes'] : [])]

	return run('hatch', ['-e', env.name, 'run', ...args_], {
		cwd: env.projectPath,
	})
}

export async function listPackages(
	env: HatchEnvInfo,
): Promise<{ name: string; version: string }[]> {
	const json = await runPipOrUv(env, ['list', '--format=json'])
	return JSON.parse(json) as { name: string; version: string }[]
}

export async function installPackages(
	env: HatchEnvInfo,
	packages: string[],
	{ upgrade = false }: { upgrade?: boolean } = {},
): Promise<void> {
	const args = [...(upgrade ? ['--upgrade'] : []), ...packages]
	await runPipOrUv(env, ['install', ...args])
}

export async function uninstallPackages(
	env: HatchEnvInfo,
	packages: string[],
): Promise<void> {
	await runPipOrUv(env, ['uninstall', ...packages])
}
