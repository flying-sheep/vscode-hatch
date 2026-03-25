import {
	EventEmitter,
	type LogOutputChannel,
	ProgressLocation,
	ThemeIcon,
	window,
} from 'vscode'
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
		const opts = {
			location: ProgressLocation.Window,
			title: 'Syncing hatch environment',
			cancellable: false,
		}
		const packages = await window.withProgress(opts, async () => {
			const packages = await listPackages(environment.hatch)
			return packages.map(({ name, version }) =>
				this.#api.createPackageItem(
					{ name, displayName: name, version },
					environment,
					this,
				),
			)
		})

		const oldPackages = this.#packages.get(envPath) ?? []
		this.#packages.set(envPath, packages)

		const changes = this.#diffPkgs(oldPackages, packages)
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

	#diffPkgs(
		oldPackages: Package[],
		packages: Package[],
	): DidChangePackagesEventArgs['changes'] {
		const oldIds = new Set(oldPackages.map((p) => p.pkgId.id))
		const newIds = new Set(packages.map((p) => p.pkgId.id))

		return [
			{ pkgs: oldPackages, ids: newIds, kind: PackageChangeKind.remove },
			{ pkgs: packages, ids: oldIds, kind: PackageChangeKind.add },
		].flatMap(({ pkgs, ids, kind }) =>
			pkgs
				.filter((p) => !ids.has(p.pkgId.id))
				.map((pkg) => ({ pkg, kind })),
		)
	}
}
