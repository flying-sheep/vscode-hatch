import paths from 'node:path'
import {
	EventEmitter,
	type IconPath,
	type LogOutputChannel,
	type MarkdownString,
	ProgressLocation,
	ThemeIcon,
	Uri,
	window,
} from 'vscode'
import { HATCH_ID, HATCH_NAME } from './common/constants'
import { createDeferred, type Deferred } from './common/deferred'
import { traceVerbose } from './common/logging'
import { isWindows } from './common/platform'
import * as hatch from './hatch-cli'
import {
	clearExtensionCache,
	getGlobalEnvId,
	getProjectEnvId,
	setGlobalEnvId,
	setProjectEnvId,
} from './utils'
import {
	type DidChangeEnvironmentEventArgs,
	type DidChangeEnvironmentsEventArgs,
	EnvironmentChangeKind,
	type EnvironmentManager,
	type GetEnvironmentScope,
	type GetEnvironmentsScope,
	type PythonEnvironment,
	type PythonEnvironmentApi,
	type RefreshEnvironmentsScope,
	type ResolveEnvironmentContext,
	type SetEnvironmentScope,
} from './vscode-python-environments'

export interface HatchEnvironment extends PythonEnvironment {
	hatch: hatch.HatchEnvInfo
}

export function isHatchEnv(
	env?: PythonEnvironment | undefined,
): env is HatchEnvironment {
	return env !== undefined && 'hatch' in env
}

function syncHatchEnv(
	environment: HatchEnvironment,
	fspath: string,
): Promise<void> {
	return hatch.createEnv(environment.hatch.name, fspath, {
		existOk: true,
	})
}

export class HatchEnvManager implements EnvironmentManager {
	#globalEnv: PythonEnvironment | undefined
	#activeEnv = new Map<string, PythonEnvironment>() // Selected environment for each project
	#projectToEnvs = new Map<string, HatchEnvironment[]>() // Maps a project path to its `hatch env show` output

	readonly #onDidChangeEnvironment =
		new EventEmitter<DidChangeEnvironmentEventArgs>()
	readonly onDidChangeEnvironment = this.#onDidChangeEnvironment.event

	readonly #onDidChangeEnvironments =
		new EventEmitter<DidChangeEnvironmentsEventArgs>()
	readonly onDidChangeEnvironments = this.#onDidChangeEnvironments.event

	constructor(
		readonly api: PythonEnvironmentApi,
		public readonly log: LogOutputChannel,
	) {
		this.#api = api
		this.name = HATCH_ID
		this.displayName = HATCH_NAME
		this.preferredPackageManagerId = 'ms-python.python:uv' // HATCH_MANAGER_ID
		this.tooltip = 'Hatch Environment Manager'
		this.iconPath = new ThemeIcon('prefix-dev')
	}

	readonly #api: PythonEnvironmentApi

	readonly name: string
	readonly displayName: string
	readonly preferredPackageManagerId: string
	readonly description?: string
	readonly tooltip: string | MarkdownString
	readonly iconPath?: IconPath

	dispose() {
		this.#onDidChangeEnvironment.dispose()
		this.#onDidChangeEnvironments.dispose()
		this.#globalEnv = undefined
		this.#activeEnv.clear()
		this.#projectToEnvs.clear()
	}

	#initialized: Deferred<void> | undefined

	async initialize(): Promise<void> {
		if (this.#initialized) {
			return this.#initialized.promise
		}

		this.#initialized = createDeferred()

		try {
			await this.#refreshAll()
		} finally {
			this.#initialized.resolve()
		}
	}

	async refresh(scope: RefreshEnvironmentsScope): Promise<void> {
		traceVerbose(`Called refresh with scope: ${scope}`)

		if (scope instanceof Uri) {
			await this.#refreshOne(scope)
		} else {
			await this.#refreshAll()
		}
	}

	async getEnvironments(
		scope: GetEnvironmentsScope,
	): Promise<PythonEnvironment[]> {
		traceVerbose(`Called getEnvironments with scope: ${scope}`)

		await this.initialize()

		if (scope === 'all') {
			return [...this.#buildEnvLookup().values()]
		}

		if (scope instanceof Uri) {
			const project = this.#api.getPythonProject(scope)
			return project
				? this.#projectToEnvs.get(project.uri.fsPath) || []
				: []
		}

		return []
	}

	async get(
		scope: GetEnvironmentScope,
	): Promise<PythonEnvironment | undefined> {
		traceVerbose(`Called get with scope: ${scope}`)

		await this.initialize()

		if (!scope) {
			return this.#globalEnv
		}

		const project = this.#api.getPythonProject(scope)
		return project
			? this.#activeEnv.get(project.uri.fsPath)
			: this.#globalEnv
	}

	async set(
		scope: SetEnvironmentScope,
		environment?: PythonEnvironment,
	): Promise<void> {
		traceVerbose(
			`Called set with scope: ${scope}, environment: ${JSON.stringify(environment)}`,
		)

		if (scope === undefined) {
			await setGlobalEnvId(environment?.envId.id)
			this.#triggerDidChangeEnvironment(
				undefined,
				this.#globalEnv,
				environment,
			)
			this.#globalEnv = environment
			return
		}

		const uris = scope instanceof Uri ? [scope] : scope
		for (const uri of uris) {
			const project = this.#api.getPythonProject(uri)
			if (!project) {
				continue
			}

			const projectPath = project.uri.fsPath
			if (isHatchEnv(environment)) {
				await window.withProgress(
					{
						location: ProgressLocation.Notification,
						title: 'Syncing hatch environment',
						cancellable: false,
					},
					() => syncHatchEnv(environment, projectPath),
				)
			}
			const oldEnv = this.#activeEnv.get(projectPath)

			if (environment) {
				this.#activeEnv.set(projectPath, environment)
			} else {
				this.#activeEnv.delete(projectPath)
			}

			await setProjectEnvId(projectPath, environment?.envId.id)
			this.#triggerDidChangeEnvironment(project.uri, oldEnv, environment)
		}
	}

	async resolve(
		context: ResolveEnvironmentContext,
	): Promise<PythonEnvironment | undefined> {
		traceVerbose(`Called resolve with context: ${context}`)
		const project = this.#api.getPythonProject(context)
		return project ? this.#activeEnv.get(project.uri.fsPath) : undefined
	}

	async clearCache() {
		traceVerbose('Called clearCache')
		await clearExtensionCache()
	}

	#buildEnvLookup(): Map<string, HatchEnvironment> {
		return new Map(
			Array.from(this.#projectToEnvs.values()).flatMap((envs) =>
				envs.map((env) => [env.envId.id, env]),
			),
		)
	}

	#diffEnvironments(
		oldEnvs: HatchEnvironment[],
		newEnvs: HatchEnvironment[],
	): DidChangeEnvironmentsEventArgs {
		const oldIds = new Set(oldEnvs.map((e) => e.envId.id))
		const newIds = new Set(newEnvs.map((e) => e.envId.id))

		return [
			...oldEnvs
				.filter((e) => !newIds.has(e.envId.id))
				.map((e) => ({
					environment: e,
					kind: EnvironmentChangeKind.remove,
				})),
			...newEnvs
				.filter((e) => !oldIds.has(e.envId.id))
				.map((e) => ({
					environment: e,
					kind: EnvironmentChangeKind.add,
				})),
		]
	}

	async #refreshAll(): Promise<void> {
		await window.withProgress(
			{
				location: ProgressLocation.Window,
				title: 'Discovering Hatch environments',
			},
			async () => {
				const oldProjectToEnvs = new Map(this.#projectToEnvs)
				this.#projectToEnvs.clear()

				// Collect project paths from registered Python projects and search paths
				const projects = this.#api.getPythonProjects()
				const projectMap = new Map(
					projects.map((p) => [p.uri.fsPath, p]),
				)

				const searchPathRoots = [] as const //await resolveHatchProjectPaths();
				const projectPaths = new Set([
					...projectMap.keys(),
					...searchPathRoots,
				])

				const changes: DidChangeEnvironmentsEventArgs = []

				await Promise.all(
					[...projectPaths].map(async (projectPath) => {
						const oldEnvs = oldProjectToEnvs.get(projectPath) || []
						const newEnvs = await this.#getHatchEnvs(projectPath)

						changes.push(
							...this.#diffEnvironments(oldEnvs, newEnvs),
						)
						this.#projectToEnvs.set(projectPath, newEnvs)
					}),
				)

				this.#onDidChangeEnvironments.fire(changes)

				const envLookup = this.#buildEnvLookup()

				// Update global environment
				const globalEnvId = await getGlobalEnvId()
				const globalEnv = globalEnvId
					? envLookup.get(globalEnvId)
					: undefined
				this.#triggerDidChangeEnvironment(
					undefined,
					this.#globalEnv,
					globalEnv,
				)
				this.#globalEnv = globalEnv

				// Update active environments for each project
				const oldActiveEnv = new Map(this.#activeEnv)
				this.#activeEnv.clear()

				for (const projectPath of projectPaths) {
					const envId = await getProjectEnvId(projectPath)
					const env = envId ? envLookup.get(envId) : undefined

					if (env) {
						this.#activeEnv.set(projectPath, env)
					}

					this.#triggerDidChangeEnvironment(
						projectMap.get(projectPath)?.uri,
						oldActiveEnv.get(projectPath),
						env,
					)
				}
			},
		)
	}

	async #refreshOne(scope: Uri): Promise<void> {
		const project = this.#api.getPythonProject(scope)
		if (!project) {
			return
		}

		const projectPath = project.uri.fsPath
		const oldEnvs = this.#projectToEnvs.get(projectPath) || []
		const newEnvs = await this.#getHatchEnvs(projectPath)

		this.#projectToEnvs.set(projectPath, newEnvs)
		this.#onDidChangeEnvironments.fire(
			this.#diffEnvironments(oldEnvs, newEnvs),
		)

		// Update active environment for this project
		const envId = await getProjectEnvId(projectPath)
		const env = envId
			? newEnvs.find((e) => e.envId.id === envId)
			: undefined
		this.#triggerDidChangeEnvironment(
			project.uri,
			this.#activeEnv.get(projectPath),
			env,
		)

		if (env) {
			this.#activeEnv.set(projectPath, env)
		} else {
			this.#activeEnv.delete(projectPath)
		}
	}

	#triggerDidChangeEnvironment(
		uri: Uri | undefined,
		oldEnv: PythonEnvironment | undefined,
		newEnv: PythonEnvironment | undefined,
	) {
		if (oldEnv?.envId.id !== newEnv?.envId.id) {
			this.#onDidChangeEnvironment.fire({ uri, old: oldEnv, new: newEnv })
		}
	}

	async #getHatchEnvs(path: string): Promise<HatchEnvironment[]> {
		const envs = await hatch.getEnvs(path)
		return envs.map((e) => this.#hatch2pythonEnv(e))
	}

	#hatch2pythonEnv({
		name,
		conf,
		path,
	}: hatch.HatchEnvInfo): HatchEnvironment {
		const executable = isWindows()
			? paths.join(path, 'Scripts', 'python.exe')
			: paths.join(path, 'bin', 'python')
		const pyEnv = this.#api.createPythonEnvironmentItem(
			{
				name,
				description: conf.description,
				displayName: name,
				displayPath: path,
				tooltip: path,
				environmentPath: Uri.file(path),
				sysPrefix: path,
				version: '1', // TODO
				execInfo: { run: { executable } },
			},
			this,
		)
		return { ...pyEnv, hatch: { name, conf, path } }
	}
}
