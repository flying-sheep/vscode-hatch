import type { ExecFileException, ProcessEnvOptions } from 'node:child_process'
import { traceError } from '../common/logging.js'
import { execFile } from './index.js'

export default async function run(
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
