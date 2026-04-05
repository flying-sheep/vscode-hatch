import * as assert from 'node:assert'
import CallableInstance from 'callable-instance'
import type { ExecFile } from '../src/cli/exec-file.js'

const call = Symbol('call')

export default class MockExec extends CallableInstance<
	Parameters<ExecFile>,
	ReturnType<ExecFile>
> {
	#command: string
	#map: Map<string, string>
	constructor(command: string) {
		super(call)
		this.#command = command
		this.#map = new Map()
	}

	async [call](
		executable: string,
		args: readonly string[],
		opts?: { cwd?: string },
	): Promise<{ stdout: string; stderr: string }> {
		assert.equal(executable, this.#command)
		assert.ok(opts?.cwd)
		const r = this.#map.get(JSON.stringify(args))
		assert.ok(r, `Command not found: ${JSON.stringify(args)}`)
		return { stdout: r, stderr: '' }
	}

	reset(...commands: [string[], string | object | object[]][]) {
		this.#map.clear()
		for (const [args, r] of commands) {
			this.#map.set(
				JSON.stringify(args),
				typeof r === 'string' ? r : JSON.stringify(r),
			)
		}
	}
}
