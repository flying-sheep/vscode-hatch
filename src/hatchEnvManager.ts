import { type MarkdownString, type LogOutputChannel, Uri } from 'vscode'
import {
	execFile as execFileCb,
	type ExecFileException,
	type ProcessEnvOptions,
} from 'node:child_process'
import { promisify } from 'node:util'
import type {
	EnvironmentManager,
	GetEnvironmentScope,
	GetEnvironmentsScope,
	IconPath,
	PythonEnvironment,
	PythonEnvironmentApi,
	PythonProject,
	RefreshEnvironmentsScope,
	ResolveEnvironmentContext,
	SetEnvironmentScope,
} from 'vscode-python-environments'
import path from 'node:path'

const execFile = promisify(execFileCb)

export class HatchEnvManager implements EnvironmentManager {
	readonly name: string
	readonly displayName: string
	readonly preferredPackageManagerId: string
	readonly description?: string | undefined
	readonly tooltip?: string | MarkdownString | undefined
	readonly iconPath?: IconPath | undefined
	readonly log?: LogOutputChannel | undefined

	constructor(private readonly api: PythonEnvironmentApi) {
		this.name = 'hatch'
		this.displayName = 'Hatch'
		this.preferredPackageManagerId = 'ms-python.python:pip' // maybe a custom one using uv or pip depending on what’s configured?
	}

	/*quickCreateConfig(): QuickCreateConfig | undefined {
		throw new Error('Method not implemented.')
	}*/
	/*async create(
		scope: CreateEnvironmentScope,
		options?: CreateEnvironmentOptions,
	): Promise<PythonEnvironment | undefined> {
		throw new Error('Method not implemented.')
	}*/
	/*async remove(environment: PythonEnvironment): Promise<void> {
		throw new Error('Method not implemented.')
	}*/
	async refresh(scope: RefreshEnvironmentsScope): Promise<void> {
		console.log('Refreshing scope:', scope)
		// TODO
	}
	async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
		if (scope === 'global') {
			return []
		}

		const promises = this.api
			.getPythonProjects()
			// TODO: check if that === is accurate
			.filter((p) => scope === 'all' || p.uri.fsPath === scope.fsPath)
			.map(async (project) => {
				const json = await run('hatch', ['env', 'show', '--json'], {
					cwd: project.uri.fsPath,
				})
				return await Promise.all(
					Object.entries(JSON.parse(json) as { [name: string]: HatchEnvConf }).map(
						async ([name, conf]): Promise<PythonEnvironment> =>
							this.findHatchEnv(name, conf, project),
					),
				)
			})
		return (await Promise.all(promises)).flat()
	}
	//onDidChangeEnvironments: Event<DidChangeEnvironmentsEventArgs> | undefined
	async set(scope: SetEnvironmentScope, environment?: PythonEnvironment): Promise<void> {
		console.log(scope, environment)
		throw new Error('set not implemented.')
	}
	async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
		console.log(scope)
		throw new Error('get not implemented.')
	}
	//onDidChangeEnvironment: Event<DidChangeEnvironmentEventArgs> | undefined
	async resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
		console.log(context)
		throw new Error('resolve not implemented.')
	}
	/*async clearCache(): Promise<void> {
		throw new Error('Method not implemented.')
	}*/

	async findHatchEnv(
		name: string,
		conf: HatchEnvConf,
		project: PythonProject,
	): Promise<PythonEnvironment> {
		const results = await run('hatch', ['env', 'find', name], { cwd: project.uri.fsPath })
		const [p] = results.split('\n')
		return {
			envId: {
				id: name,
				managerId: this.name,
			},
			name,
			description: conf.description,
			displayName: name,
			displayPath: p,
			tooltip: p,
			environmentPath: Uri.file(p),
			sysPrefix: p,
			version: '1', // TODO
			execInfo: {
				run: {
					executable: path.join(p, 'bin', 'python'),
				},
			},
		}
	}
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

interface HatchEnvConf {
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
