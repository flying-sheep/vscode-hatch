import { HATCH_MANAGER_ID } from './common/constants.js'
import { getWorkspacePersistentState } from './common/persistent-state.js'

const HATCH_WORKSPACE_KEY = `${HATCH_MANAGER_ID}:WORKSPACE_SELECTED`
const HATCH_GLOBAL_KEY = `${HATCH_MANAGER_ID}:GLOBAL_SELECTED`

type HatchPersistentState = {
	[projectPath: string]: string
}

export async function clearExtensionCache() {
	const state = await getWorkspacePersistentState()
	await state.clear([HATCH_WORKSPACE_KEY, HATCH_GLOBAL_KEY])
}

export async function getGlobalEnvId(): Promise<string | undefined> {
	const state = await getWorkspacePersistentState()
	return state.get(HATCH_GLOBAL_KEY)
}

export async function setGlobalEnvId(envId: string | undefined) {
	const state = await getWorkspacePersistentState()
	await state.set(HATCH_GLOBAL_KEY, envId)
}

export async function getProjectEnvId(
	projectPath: string,
): Promise<string | undefined> {
	const state = await getWorkspacePersistentState()
	const data: HatchPersistentState =
		(await state.get(HATCH_WORKSPACE_KEY)) ?? {}
	return data[projectPath]
}

export async function setProjectEnvId(
	projectPath: string,
	envId: string | undefined,
) {
	const state = await getWorkspacePersistentState()
	const data: HatchPersistentState =
		(await state.get(HATCH_WORKSPACE_KEY)) ?? {}
	if (envId) {
		data[projectPath] = envId
	} else {
		delete data[projectPath]
	}
	await state.set(HATCH_WORKSPACE_KEY, data)
}
