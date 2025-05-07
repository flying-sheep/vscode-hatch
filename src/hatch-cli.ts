import {
	type ExecFileException,
	type ProcessEnvOptions,
	execFile as execFileCb,
} from 'node:child_process'
import { promisify } from 'node:util'
import type { Uri } from 'vscode'

const execFile = promisify(execFileCb)

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

export async function getEnvs(scope: Uri): Promise<HatchEnvInfo[]> {
	const json = await run('hatch', ['env', 'show', '--json'], { cwd: scope.fsPath })
	const envs = JSON.parse(json) as { [name: string]: HatchEnvConf }
	return await Promise.all(
		Object.entries(envs).map(async ([name, conf]) => ({
			name,
			conf,
			path: await findEnv(name, scope),
		})),
	)
}

export async function findEnv(name: string, scope: Uri): Promise<string> {
	const results = await run('hatch', ['env', 'find', name], { cwd: scope.fsPath })
	const [p] = results
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
	return p
}

export async function createEnv(name: string, scope: Uri): Promise<void> {
	run('hatch', ['env', 'create', name], { cwd: scope.fsPath })
}

export async function removeEnv(name: string, scope: Uri): Promise<void> {
	run('hatch', ['env', 'remove', name], { cwd: scope.fsPath })
}

async function run(cmd: string, args: string[], opts: ProcessEnvOptions): Promise<string> {
	try {
		const { stdout } = await execFile(cmd, args, opts)
		return stdout
	} catch (e) {
		const err = e as ExecFileException
		console.error(err.stderr)
		throw err
	}
}
