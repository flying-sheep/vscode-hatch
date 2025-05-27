import paths from 'node:path'
import * as fs from 'fs-extra'
import {
	EventEmitter,
	type IconPath,
	type MarkdownString,
	ProgressLocation,
	Uri,
	window,
} from 'vscode'
import { HATCH_ID, HATCH_NAME } from './common/constants'
import { type Deferred, createDeferred } from './common/deferred'
import { traceInfo, traceVerbose } from './common/logging'
import { isWindows } from './common/platform'
import { ScopeMap } from './common/scope-map'
import * as hatch from './hatch-cli'
import {
	type DidChangeEnvironmentEventArgs,
	type DidChangeEnvironmentsEventArgs,
	EnvironmentChangeKind,
	type EnvironmentManager,
	type GetEnvironmentScope,
	type GetEnvironmentsScope,
	type PythonCommandRunConfiguration,
	type PythonEnvironment,
	type PythonEnvironmentApi,
	type PythonProject,
	type RefreshEnvironmentsScope,
	type ResolveEnvironmentContext,
	type SetEnvironmentScope,
} from './vscode-python-environments'

export class HatchEnvManager implements EnvironmentManager {
	readonly name: string = HATCH_ID
	readonly displayName: string = HATCH_NAME

	private readonly _onDidChangeEnvironment = new EventEmitter<DidChangeEnvironmentEventArgs>()
	readonly onDidChangeEnvironment = this._onDidChangeEnvironment.event

	private readonly _onDidChangeEnvironments = new EventEmitter<DidChangeEnvironmentsEventArgs>()
	readonly onDidChangeEnvironments = this._onDidChangeEnvironments.event

	// The ms-python `pip` package manager uses `uv` when available internally.
	readonly preferredPackageManagerId: string = 'ms-python.python:pip'
	readonly description?: string
	readonly tooltip?: string | MarkdownString
	readonly iconPath?: IconPath

	path2envs: Map<string, Map<string, PythonEnvironment>>
	activeEnvs: ScopeMap

	constructor(private readonly api: PythonEnvironmentApi) {
		this.path2envs = new Map()
		this.activeEnvs = new ScopeMap()
	}

	private _initialized: Deferred<void> | undefined
	async initialize(): Promise<void> {
		if (this._initialized) {
			return this._initialized.promise
		}

		this._initialized = createDeferred()

		try {
			await this.internalRefresh(undefined)
		} finally {
			this._initialized?.resolve()
		}
	}

	async refresh(scope: RefreshEnvironmentsScope): Promise<void> {
		await this.internalRefresh(scope)
	}

	async internalRefresh(
		scope: RefreshEnvironmentsScope,
		location: ProgressLocation = ProgressLocation.Window,
	): Promise<void> {
		await window.withProgress(
			{
				location,
				title: 'Refreshing Hatch environments',
				cancellable: false,
			},
			async () => {
				this.path2envs.clear()
				if (scope === undefined) {
					const projects = this.api.getPythonProjects()
					await this.fetchEnvsForProjects(projects)
				} else {
					const project = this.api.getPythonProject(scope)
					if (project) {
						traceInfo('Refreshing project %s', project.uri.fsPath)
						await this.fetchEnvsForProjects([project])
					}
				}
			},
		)
	}

	async getEnvironments(scope: GetEnvironmentsScope): Promise<PythonEnvironment[]> {
		await this.initialize()

		if (scope === 'global') {
			traceVerbose("getEnvironments called with scope 'global'")
			return [] // TODO: maybe create shims for Hatch-downloadable Pythons?
		}

		if (scope === 'all') {
			traceVerbose("getEnvironments called with scope 'all'")
			const allEnvs = Array.from(this.path2envs.values()).flatMap((envs) =>
				Array.from(envs.values()),
			)
			traceVerbose('Found %d environments in cache', allEnvs.length)
			return allEnvs
		}

		const project = this.api.getPythonProject(scope)
		if (!project) {
			return []
		}

		const cachedEnvs = Array.from(this.path2envs.get(project.uri.fsPath)?.values() ?? [])
		const uncached = !this.path2envs.has(project.uri.fsPath)
		if (!uncached) {
			traceInfo('Found %d cached envs', cachedEnvs.length)
			return cachedEnvs
		}
		await this.fetchEnvsForProjects([project])
		return Array.from(this.path2envs.get(project.uri.fsPath)?.values() ?? [])
	}

	async set(scope: SetEnvironmentScope, env?: PythonEnvironment): Promise<void> {
		for (const uri of Array.isArray(scope) ? scope : [scope]) {
			if (!env) {
				traceInfo('unsetting env for scope %s', uri?.fsPath)
				this.activeEnvs.delete(uri)
			} else {
				traceInfo('setting env %s for scope %s', env.displayName, uri?.fsPath)
				if (uri) {
					await hatch.createEnv(env.name, uri, { existOk: true })
				}
				const old = this.activeEnvs.get(uri)
				this.activeEnvs.set(uri, env)
				if (old?.envId.id !== env.envId.id) {
					this._onDidChangeEnvironment.fire({
						uri,
						new: env,
						old: old,
					})
				}
			}
		}
	}

	async get(scope: GetEnvironmentScope): Promise<PythonEnvironment | undefined> {
		await this.initialize()

		let env = this.activeEnvs.get(scope)
		if (!env) {
			// If no active environment is set, try to find the default environment for the scope.
			if (scope) {
				env = Array.from(this.path2envs.get(scope.fsPath)?.values() ?? []).find(
					(env) => env.name === 'default',
				)
			} else {
				env = Array.from(this.path2envs.values())
					.flatMap((envs) => Array.from(envs.values()))
					.find((env) => env.name === 'default')
			}
			if (env) {
				// otherwise the python-environments extension goes haywire and calls `get` in a loop
				// it also created 2 copies of my python project, one with one copy of the env and one with two
				await this.set(scope, env)
			}
		}

		if (scope && env && !(await fs.pathExists(env.environmentPath.fsPath))) {
			await hatch.createEnv(env.name, scope, { existOk: true })
		}

		traceInfo(`got env ${env?.displayName} for scope ${scope?.fsPath}`)
		return env
	}

	async resolve(context: ResolveEnvironmentContext): Promise<PythonEnvironment | undefined> {
		return Array.from(this.path2envs.values())
			.flatMap((envs) => Array.from(envs.values()))
			.find(
				(env) =>
					!paths.relative(env.environmentPath.fsPath, context.fsPath).startsWith('..'),
			)
	}

	async clearCache(): Promise<void> {
		this.path2envs.clear()
	}

	/** Fetches environments for a list of projects and updates the cache */
	async fetchEnvsForProjects(projects: readonly PythonProject[]): Promise<void> {
		const before = Array.from(this.path2envs.values())
			.flatMap((envs) => Array.from(envs.values()))
			.map((env) => ({
				kind: EnvironmentChangeKind.remove,
				environment: env,
			}))

		const envsPerProj = await Promise.all(
			projects.map(
				async (project) => [project.uri.fsPath, await hatch.getEnvs(project.uri)] as const,
			),
		)

		const pyEnvsPerProj = new Map(
			envsPerProj.map(([path, envs]) => [
				path,
				new Map(envs.map(this.hatch2pythonEnv.bind(this)).map((env) => [env.name, env])),
			]),
		)

		for (const [path, envs] of pyEnvsPerProj) {
			this.path2envs.set(path, envs)
		}

		const after = Array.from(pyEnvsPerProj.values())
			.flatMap((envs) => Array.from(envs.values()))
			.map((env) => ({
				kind: EnvironmentChangeKind.add,
				environment: env,
			}))

		this._onDidChangeEnvironments.fire([...before, ...after])
	}

	private hatch2pythonEnv({ name, conf, path }: hatch.HatchEnvInfo): PythonEnvironment {
		const executable = isWindows()
			? paths.join(path, 'Scripts', 'python.exe')
			: paths.join(path, 'bin', 'python')

		const shellActivation: Map<string, PythonCommandRunConfiguration[]> = new Map()
		const shellDeactivation: Map<string, PythonCommandRunConfiguration[]> = new Map()

		shellActivation.set('unknown', [
			{ executable: 'hatch', args: ['shell', '--name', `"${name}"`] },
		])
		shellDeactivation.set('unknown', [{ executable: 'exit' }])

		return this.api.createPythonEnvironmentItem(
			{
				name,
				description: conf.description,
				displayName: name,
				displayPath: path,
				tooltip: path,
				environmentPath: Uri.file(executable),
				sysPrefix: path,
				version: '3', // TODO
				execInfo: { run: { executable }, shellActivation, shellDeactivation },
			},
			this,
		)
	}
}
