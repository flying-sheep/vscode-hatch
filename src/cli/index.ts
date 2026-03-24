import {
	type ExecFileException,
	execFile as execFileCb,
	type ProcessEnvOptions,
} from 'node:child_process'
import paths from 'node:path'
import { promisify } from 'node:util'
import { traceError } from '../common/logging.js'
import { isWindows } from '../common/platform.js'

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

export function envBin(envPath: string, name: string): string {
	return isWindows()
		? paths.join(envPath, 'Scripts', `${name}.exe`)
		: paths.join(envPath, 'bin', name)
}
