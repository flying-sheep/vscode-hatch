import { type MarkdownString, type LogOutputChannel, Uri, window } from 'vscode'
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
import paths from 'node:path'
import * as meta from '../package.json'
import * as hatch from './hatch-cli'

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
	activeEnvs: ScopeMap

	constructor(private readonly api: PythonEnvironmentApi) {
		this.path2envs = new Map()
		this.activeEnvs = new ScopeMap()
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
		await hatch.createEnv(choice.env.name, uri)
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
				this.activeEnvs.delete(uri)
			} else {
				console.log('setting env %s for scope %s', env.displayName, uri?.fsPath)
				this.activeEnvs.set(uri, env)
			}
		}
	}
	async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
		const env = this.activeEnvs.get(scope)
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
		const envsPerProj = await Promise.all(
			projects.map(
				async (project) => [project.uri.fsPath, await hatch.getEnvs(project.uri)] as const,
			),
		)
		const pyEnvsPerProj = new Map(
			envsPerProj.map(([path, envs]) => [
				path,
				new Map(envs.map(hatch2pythonEnv).map((env) => [env.name, env])),
			]),
		)
		for (const [path, envs] of pyEnvsPerProj) {
			this.path2envs.set(path, envs)
		}
		return Array.from(pyEnvsPerProj.values()).flatMap((envs) => Array.from(envs.values()))
	}
}

class ScopeMap {
	map: Map<string | undefined, PythonEnvironment>

	constructor() {
		this.map = new Map()
	}

	set(key: Uri | undefined, value: PythonEnvironment): void {
		this.map.set(key?.fsPath, value)
	}
	delete(key: Uri | undefined): void {
		this.map.delete(key?.fsPath)
	}
	has(key: Uri | undefined): boolean {
		return this.get(key) !== undefined
	}
	get(keyOrig: Uri | undefined): PythonEnvironment | undefined {
		let key = keyOrig
		while (key && !this.map.has(key.fsPath)) {
			const parent = paths.dirname(key.fsPath)
			if (parent === key.fsPath) {
				console.log('hit root from', keyOrig?.fsPath)
				break
			}
			console.log('no env for %s, trying %s', key.fsPath, parent)
			key = Uri.file(parent)
		}
		return this.map.get(key?.fsPath)
	}
}

function hatch2pythonEnv({ name, conf, path }: hatch.HatchEnvInfo): PythonEnvironment {
	return {
		envId: {
			id: name,
			managerId: HatchEnvManager.ID,
		},
		name,
		description: conf.description,
		displayName: name,
		displayPath: path,
		tooltip: path,
		environmentPath: Uri.file(path),
		sysPrefix: path,
		version: '1', // TODO
		execInfo: {
			run: {
				executable: paths.join(path, 'bin', 'python'),
			},
		},
	}
}
