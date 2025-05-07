import { Uri } from 'vscode'
import type { PythonEnvironment } from '../vscode-python-environments'
import paths from 'node:path'

export class ScopeMap {
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
