import * as assert from 'node:assert'
import * as vscode from 'vscode'

//import * as extension from '../extension'

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.')

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5))
		assert.strictEqual(-1, [1, 2, 3].indexOf(0))
	})
})
