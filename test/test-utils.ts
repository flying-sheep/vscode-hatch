import { mkdtemp, rm } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import * as vscode from 'vscode'

/**
 * Wait for a condition to become true within a timeout.
 *
 * This is the PRIMARY utility for smoke/E2E tests. Use this instead of sleep()
 * for any async assertion that depends on VS Code state.
 *
 * @param condition - Async function that returns true when condition is met
 * @param timeoutMs - Maximum time to wait (default: 10 seconds)
 * @param errorMessage - Error message if condition is not met
 * @param pollIntervalMs - How often to check condition (default: 100ms)
 *
 * @example
 * // Wait for extension to activate
 * await waitForCondition(
 *     () => extension.isActive,
 *     10_000,
 *     'Extension did not activate within 10 seconds'
 * );
 *
 * @example
 * // Wait for file to exist
 * await waitForCondition(
 *     async () => fs.pathExists(outputFile),
 *     30_000,
 *     `Output file ${outputFile} was not created`
 * );
 */
export async function waitForCondition(
	condition: () => boolean | Promise<boolean>,
	timeoutMs: number = 10_000,
	errorMessage: string | (() => string) = 'Condition not met within timeout',
	pollIntervalMs: number = 100,
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const startTime = Date.now()

		const checkCondition = async () => {
			try {
				const result = await condition()
				if (result) {
					resolve()
					return
				}
			} catch {
				// Condition threw - keep waiting
			}

			if (Date.now() - startTime >= timeoutMs) {
				const msg =
					typeof errorMessage === 'function'
						? errorMessage()
						: errorMessage
				reject(new Error(`${msg} (waited ${timeoutMs}ms)`))
				return
			}

			setTimeout(checkCondition, pollIntervalMs)
		}

		checkCondition()
	})
}

// similar to fs.mkdtempDisposable but for node<24
export async function tmpdir(
	prefix: string,
): Promise<{ uri: vscode.Uri } & AsyncDisposable> {
	const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
	return {
		uri: vscode.Uri.file(dir),
		async [Symbol.asyncDispose]() {
			await rm(dir, { recursive: true })
		},
	}
}
