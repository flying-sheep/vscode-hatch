import { type MarkdownString, type LogOutputChannel, Uri, window, type QuickPickItem } from 'vscode'
import {
	execFile as execFileCb,
	type ExecFileException,
	type ProcessEnvOptions,
} from 'node:child_process'
import { promisify } from 'node:util'
import type {
	CreateEnvironmentOptions,
	CreateEnvironmentScope,
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
import * as meta from '../package.json'

const execFile = promisify(execFileCb)

export class HatchEnvManager implements EnvironmentManager {
	static ID = `${meta.publisher}.${meta.name}:${meta.name}`

	readonly name: string = meta.name
	readonly displayName: string = meta.displayName
	readonly preferredPackageManagerId: string = 'ms-python.python:pip' // maybe a custom one using uv or pip depending on what’s configured?
	readonly description?: string | undefined // = meta.description
	readonly tooltip?: string | MarkdownString | undefined
	readonly iconPath?: IconPath | undefined
	readonly log?: LogOutputChannel | undefined

	/** Maps project paths to env names to envs */
	path2envs: Map<string, Map<string, PythonEnvironment>>
	/** Maps project paths to active envs */
	activeEnvs: Map<string | undefined, PythonEnvironment>

	constructor(private readonly api: PythonEnvironmentApi) {
		this.path2envs = new Map()
		this.activeEnvs = new Map()
	}

	/*quickCreateConfig(): QuickCreateConfig | undefined {
		return undefined // TODO: maybe default env?
	}*/
	async create(
		scope: CreateEnvironmentScope,
		_options: CreateEnvironmentOptions = {}, // TODO: create options
	): Promise<PythonEnvironment | undefined> {
		if (scope === 'global' || (Array.isArray(scope) && scope.length !== 1)) {
			throw new Error('Can’t create a global or multi-project environment.')
		}
		const uri = Array.isArray(scope) ? scope[0] : scope
		const choices = (await this.getEnvironments(uri)).map((env) => ({
			label: env.displayName,
			env,
		}))
		const choice = await window.showQuickPick(choices)
		if (!choice) {
			return undefined
		}
		await run('hatch', ['env', 'create', choice.env.name], { cwd: uri.fsPath })
		return choice.env
	}
	/*async remove(env: PythonEnvironment): Promise<void> {
		await run('hatch', ['env', 'remove', env.name], { cwd: ??? })
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
	async set(scope: SetEnvironmentScope, env?: PythonEnvironment): Promise<void> {
		for (const uri of Array.isArray(scope) ? scope : [scope]) {
			if (!env) {
				console.log('unsetting env for scope %s', uri?.fsPath)
				this.activeEnvs.delete(uri?.fsPath)
			} else {
				console.log('setting g env %s for scope %s', env.displayName, uri?.fsPath)
				this.activeEnvs.set(uri?.fsPath, env)
			}
		}
	}
	async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
		const env = this.activeEnvs.get(scope?.fsPath)
		console.log('got env %s for scope %s', env?.displayName, scope?.fsPath)
		return env
	}
	//onDidChangeEnvironment: Event<DidChangeEnvironmentEventArgs> | undefined
	async resolve(_context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
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
				managerId: HatchEnvManager.ID,
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
