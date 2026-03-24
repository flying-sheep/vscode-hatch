import { EventEmitter, type LogOutputChannel, ThemeIcon } from 'vscode'
import {
	installPackages,
	listPackages,
	uninstallPackages,
} from './cli/installer.js'
import { HATCH_ID, HATCH_NAME } from './common/constants.js'
import { isHatchEnv } from './hatch-env-manager.js'
import {
	type DidChangePackagesEventArgs,
	type Package,
	PackageChangeKind,
	type PackageManagementOptions,
	type PackageManager,
	type PythonEnvironment,
	type PythonEnvironmentApi,
} from './vscode-python-environments/index.js'

export class HatchPackageManager implements PackageManager {
	readonly name = HATCH_ID
	readonly displayName = HATCH_NAME
	readonly tooltip = 'Hatch Package Manager'
	readonly iconPath = new ThemeIcon('hatch-logo')

	readonly #onDidChangePackages: EventEmitter<DidChangePackagesEventArgs> =
		new EventEmitter<DidChangePackagesEventArgs>()
	readonly onDidChangePackages = this.#onDidChangePackages.event

	constructor(
		api: PythonEnvironmentApi,
		readonly log: LogOutputChannel,
	) {
		this.#api = api
		this.#packages = new Map()
	}

	readonly #api: PythonEnvironmentApi
	/** Map from environment path to packages */
	readonly #packages: Map<string, Package[]>

	dispose() {
		this.#onDidChangePackages.dispose()
	}

	async manage(
		environment: PythonEnvironment,
		{ upgrade, install = [], uninstall = [] }: PackageManagementOptions,
	): Promise<void> {
		if (!isHatchEnv(environment)) return
		if (install.length > 0) {
			await installPackages(environment.hatch, install, {
				upgrade,
			})
		}
		if (uninstall.length > 0) {
			await uninstallPackages(environment.hatch, uninstall)
		}
		await this.refresh(environment)
	}

	async refresh(environment: PythonEnvironment): Promise<void> {
		if (!isHatchEnv(environment)) return
		const { path: envPath } = environment.hatch
		const raw = await listPackages(environment.hatch)
		const packages = raw.map(({ name, version }) =>
			this.#api.createPackageItem(
				{ name, displayName: name, version },
				environment,
				this,
			),
		)

		const oldPackages = this.#packages.get(envPath) ?? []
		this.#packages.set(envPath, packages)

		const oldIds = new Set(oldPackages.map((p) => p.pkgId.id))
		const newIds = new Set(packages.map((p) => p.pkgId.id))

		const changes: DidChangePackagesEventArgs['changes'] = [
			...oldPackages
				.filter((p) => !newIds.has(p.pkgId.id))
				.map((pkg) => ({ kind: PackageChangeKind.remove, pkg })),
			...packages
				.filter((p) => !oldIds.has(p.pkgId.id))
				.map((pkg) => ({ kind: PackageChangeKind.add, pkg })),
		]

		if (changes.length > 0) {
			this.#onDidChangePackages.fire({
				environment,
				manager: this,
				changes,
			})
		}
	}

	async getPackages(
		environment: PythonEnvironment,
	): Promise<Package[] | undefined> {
		if (!isHatchEnv(environment)) return undefined
		const packages = this.#packages.get(environment.hatch.path)
		if (packages !== undefined) return packages
		await this.refresh(environment)
		return this.#packages.get(environment.hatch.path)
	}

	async clearCache(): Promise<void> {
		this.#packages.clear()
	}
}
