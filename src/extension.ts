import { window, type ExtensionContext } from "vscode";
import { getEnvExtApi } from "./pythonEnvsApi";
import { HatchEnvManager } from "./hatchEnvManager";

export async function activate(context: ExtensionContext) {
	const log = window.createOutputChannel("Hatch", { log: true });
	context.subscriptions.push(log);

	const api = await getEnvExtApi();
	const envManager = new HatchEnvManager(api, log);
	context.subscriptions.push(api.registerEnvironmentManager(envManager));
}

export function deactivate() {}
