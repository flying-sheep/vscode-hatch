import { envBin, run } from './index.js'

async function runPipOrUv(
	envPath: string,
	installer: 'uv' | 'pip',
	args: string[],
): Promise<string> {
	if (installer === 'uv') {
		return run('uv', [
			'pip',
			...args,
			`--python=${envBin(envPath, 'python')}`,
		])
	}
	return run(envBin(envPath, 'pip'), [
		...args,
		...(args[0] === 'uninstall' ? ['--yes'] : []),
	])
}

export async function listPackages(
	envPath: string,
	installer: 'uv' | 'pip',
): Promise<{ name: string; version: string }[]> {
	const json = await runPipOrUv(envPath, installer, ['list', '--format=json'])
	return JSON.parse(json) as { name: string; version: string }[]
}

export async function installPackages(
	envPath: string,
	packages: string[],
	installer: 'uv' | 'pip',
	{ upgrade = false }: { upgrade?: boolean } = {},
): Promise<void> {
	const args = [...(upgrade ? ['--upgrade'] : []), ...packages]
	await runPipOrUv(envPath, installer, ['install', ...args])
}

export async function uninstallPackages(
	envPath: string,
	packages: string[],
	installer: 'uv' | 'pip',
): Promise<void> {
	await runPipOrUv(envPath, installer, ['uninstall', ...packages])
}
