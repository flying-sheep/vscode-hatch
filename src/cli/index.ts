import {
	type ExecFileException,
	execFile as execFileCb,
	type ProcessEnvOptions,
} from 'node:child_process'
import { promisify } from 'node:util'
import untildify from 'untildify'
import { window, workspace } from 'vscode'
import which from 'which'
import { traceError } from '../common/logging.js'

const execFile = promisify(execFileCb)

export async function run(
	cmd: string,
	args: string[],
	opts: ProcessEnvOptions = {},
): Promise<string> {
	try {
		const { stdout } = await execFile(cmd, args, opts)
		return stdout
	} catch (e) {
		const err = e as ExecFileException
		traceError(err, err.stderr)
		throw err
	}
}

export async function getHatch(): Promise<string> {
	const config = workspace.getConfiguration('hatch')
	const value = config.get<string>('executable') ?? ''
	if (value.length > 0) return untildify(value)

	const path = await which('hatch', { nothrow: true })
	if (!path) {
		const errorMsg =
			'Hatch executable not found. Please install Hatch or set "hatch.executable" in your settings.'
		window.showErrorMessage(errorMsg)
		throw new Error(errorMsg)
	}
	return path
}
