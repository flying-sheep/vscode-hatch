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
	readonly name: string = 'hatch'
	readonly displayName: string = 'Hatch'
	readonly preferredPackageManagerId: string = 'ms-python.python:pip' // maybe a custom one using uv or pip depending on what’s configured?
	readonly description?: string | undefined
	readonly tooltip?: string | MarkdownString | undefined
	readonly iconPath?: IconPath | undefined
	readonly log?: LogOutputChannel | undefined

	path2envs: Map<string, Map<string, PythonEnvironment>>

	constructor(private readonly api: PythonEnvironmentApi) {
		this.path2envs = new Map()
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
		const projects = this.api
			.getPythonProjects()
			// TODO: check if that === is accurate
			.filter((p) => scope === undefined || p.uri.fsPath === scope.fsPath)
		console.log(
			'Refreshing projects for %s',
			scope === undefined ? 'all projects' : scope.fsPath,
		)
		await this.fetchEnvsForProjects(projects)
	}
	async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
		if (scope === 'global') {
			return [] // TODO: maybe create shims for Hatch-downloadable Pythons?
		}

		const projects = this.api
			.getPythonProjects()
			// TODO: check if that === is accurate
			.filter((p) => scope === 'all' || p.uri.fsPath === scope.fsPath)

		const cachedEnvs = projects.flatMap((p) =>
			Array.from(this.path2envs.get(p.uri.fsPath)?.values() ?? []),
		)
		const uncachedProjects = projects.filter((p) => !this.path2envs.has(p.uri.fsPath))
		if (uncachedProjects.length === 0) {
			// If all projects are already cached, just return them
			console.log('Found %d cached envs', cachedEnvs.length)
			return cachedEnvs
		}
		const newEnvs = await this.fetchEnvsForProjects(uncachedProjects)
		console.log('Found %d cached and fetched %d new envs', cachedEnvs.length, newEnvs.length)
		return [...cachedEnvs, ...newEnvs]
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
	async clearCache(): Promise<void> {
		this.path2envs.clear()
	}

	/** Fetches environments for a list of projects and updates the cache */
	async fetchEnvsForProjects(projects: PythonProject[]): Promise<PythonEnvironment[]> {
		const promises = projects.map(async (project) => {
			const json = await run('hatch', ['env', 'show', '--json'], {
				cwd: project.uri.fsPath,
			})
			const envs = await Promise.all(
				Object.entries(JSON.parse(json) as { [name: string]: HatchEnvConf }).map(
					async ([name, conf]): Promise<PythonEnvironment> =>
						this.fetchHatchEnv(name, conf, project),
				),
			)
			return [project.uri.fsPath, new Map(envs.map((e) => [e.envId.id, e]))] as const
		})
		const envsPerProj = await Promise.all(promises)
		for (const [path, envs] of envsPerProj) {
			this.path2envs.set(path, envs)
		}
		return envsPerProj.flatMap(([, envs]) => Array.from(envs.values()))
	}

	async fetchHatchEnv(
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
