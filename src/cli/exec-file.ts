import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'

export type ExecFile = (
	exe: string,
	args: readonly string[],
	options?: {
		cwd?: string
	},
) => Promise<{ stdout: string; stderr: string }>

const execFile: ExecFile = promisify(execFileCb)

export default execFile
