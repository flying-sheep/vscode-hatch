import paths from 'node:path'
import {
	EventEmitter,
	type LogOutputChannel,
	ProgressLocation,
	ThemeIcon,
	Uri,
	window,
} from 'vscode'
import * as hatch from './cli/hatch.js'
import { HATCH_ID, HATCH_MANAGER_ID, HATCH_NAME } from './common/constants.js'
import { createDeferred, type Deferred } from './common/deferred.js'
import { traceVerbose } from './common/logging.js'
import { isWindows } from './common/platform.js'
import {
	clearExtensionCache,
	getGlobalEnvId,
	getProjectEnvId,
	setGlobalEnvId,
	setProjectEnvId,
} from './utils.js'
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
	type PythonEnvironmentInfo,
	type RefreshEnvironmentsScope,
	type ResolveEnvironmentContext,
	type SetEnvironmentScope,
} from './vscode-python-environments/index.js'

export interface HatchEnvironment extends PythonEnvironment {
	hatch: hatch.HatchEnvInfo
}

export function isHatchEnv(
	env?: PythonEnvironment | undefined,
): env is HatchEnvironment {
	return env !== undefined && 'hatch' in env
}

export class HatchEnvManager implements EnvironmentManager {
	readonly name = HATCH_ID
	readonly displayName = HATCH_NAME
	readonly preferredPackageManagerId = HATCH_MANAGER_ID
	readonly tooltip = 'Hatch Environment Manager'
	readonly iconPath = new ThemeIcon('hatch-logo')

	readonly #onDidChangeEnvironment =
		new EventEmitter<DidChangeEnvironmentEventArgs>()
	readonly onDidChangeEnvironment = this.#onDidChangeEnvironment.event

	readonly #onDidChangeEnvironments =
		new EventEmitter<DidChangeEnvironmentsEventArgs>()
	readonly onDidChangeEnvironments = this.#onDidChangeEnvironments.event

	constructor(
		api: PythonEnvironmentApi,
		public readonly log: LogOutputChannel,
	) {
		this.#api = api
		this.#globalEnv = undefined
		this.#activeEnv = new Map()
		this.#projectToEnvs = new Map()
	}

	readonly #api: PythonEnvironmentApi
	#globalEnv: PythonEnvironment | undefined
	/** Selected environment for each project */
	#activeEnv: Map<string, PythonEnvironment>
	/** Maps a project path to its `hatch env show` output */
	#projectToEnvs: Map<string, HatchEnvironment[]>

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
					() =>
						hatch.createEnv(environment.hatch.name, projectPath, {
							mode: 'sync',
						}),
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

	async #getHatchEnvs(projectPath: string): Promise<HatchEnvironment[]> {
		const envs = await hatch.getEnvs(projectPath)
		return envs.map((e) => this.#hatch2pythonEnv(e))
	}

	#hatch2pythonEnv({
		name,
		path,
		conf,
		projectPath,
	}: hatch.HatchEnvInfo): HatchEnvironment {
		const shellActivation: Map<string, PythonCommandRunConfiguration[]> =
			new Map()
		const shellDeactivation: Map<string, PythonCommandRunConfiguration[]> =
			new Map()

		shellActivation.set('unknown', [
			{ executable: 'hatch', args: [`--env=${name}`, 'shell'] },
		])
		shellDeactivation.set('unknown', [{ executable: 'exit' }])

		const envInfo: PythonEnvironmentInfo = {
			name,
			description: conf.description,
			displayName: name,
			displayPath: path,
			tooltip: path,
			environmentPath: Uri.file(path),
			sysPrefix: path,
			version: '1', // TODO
			execInfo: {
				run: { executable: envBin(path, 'python') },
				shellActivation,
				shellDeactivation,
			},
		}
		// make sure `getCallingExtension` leads to the correct managerId
		const {
			envId: { managerId },
		} = this.#api.createPythonEnvironmentItem(envInfo, this)
		return {
			...envInfo,
			envId: { id: path, managerId },
			hatch: { name, path, conf, projectPath },
		}
	}
}

export function envBin(envPath: string, name: string): string {
	return isWindows()
		? paths.join(envPath, 'Scripts', `${name}.exe`)
		: paths.join(envPath, 'bin', name)
}
