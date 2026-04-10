export interface BuiltinSlashCommandDefinition {
	name: string;
	description: string;
}

export type RuntimeSlashCommandSource = "extension" | "prompt" | "skill" | "other";

function normalizeText(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function normalizeSlashCommandName(name: string): string {
	return normalizeText(name).replace(/^\/+/, "").toLowerCase();
}

function runtimeCommandUsageHint(name: string): string | null {
	const normalized = normalizeSlashCommandName(name);
	if (normalized === "auto-rename" || normalized === "name-ai-config") {
		return "Args: config, test, init, regen, <name>";
	}
	if (normalized === "voice-notify") {
		return "No arg opens extension settings; args: status, reload, on, off, test <idle|permission|question|error>";
	}
	return null;
}

function runtimeCommandDescriptionOverride(name: string, description: string): string | null {
	const normalizedName = normalizeSlashCommandName(name);
	const normalizedDescription = normalizeText(description);
	if (normalizedName === "voice-notify") {
		return "Voice notifications: no arg opens extension settings, or use status/reload/on/off/test";
	}
	if (/^configure windows smart voice notifications$/i.test(normalizedDescription)) {
		return "Voice notifications: no arg opens extension settings, or use status/reload/on/off/test";
	}
	return null;
}

export function withRuntimeCommandUsageHint(name: string, description: string): string {
	const override = runtimeCommandDescriptionOverride(name, description);
	if (override) return override;
	const normalizedDescription = normalizeText(description);
	const hint = runtimeCommandUsageHint(name);
	if (!hint) return normalizedDescription;
	if (!normalizedDescription) return hint;
	const lower = normalizedDescription.toLowerCase();
	const normalizedName = normalizeSlashCommandName(name);
	if (normalizedName === "auto-rename" && lower.includes("config") && lower.includes("test")) {
		return normalizedDescription;
	}
	if (
		normalizedName === "voice-notify" &&
		lower.includes("status") &&
		lower.includes("reload") &&
		lower.includes("test")
	) {
		return normalizedDescription;
	}
	return `${normalizedDescription} · ${hint}`;
}

export function normalizeRuntimeSlashCommandSource(rawSource: string): RuntimeSlashCommandSource {
	const source = normalizeText(rawSource).toLowerCase();
	switch (source) {
		case "extension":
		case "prompt":
		case "skill":
			return source;
		default:
			return "other";
	}
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommandDefinition[] = [
	{ name: "settings", description: "Open Desktop settings" },
	{ name: "model", description: "No arg opens picker; exact arg sets model, otherwise opens picker near matches" },
	{ name: "scoped-models", description: "Open Settings scoped-models editor (Ctrl+P model cycle scope)" },
	{ name: "export", description: "No arg opens save dialog, /export <path> writes HTML directly" },
	{ name: "import", description: "No arg opens file picker, /import <path> imports a session file" },
	{ name: "share", description: "Create secret gist and post minimal links to pi.dev + GitHub gist" },
	{ name: "copy", description: "Copy last assistant message" },
	{ name: "name", description: "No arg opens inline rename, /name <text> sets name directly" },
	{ name: "session", description: "Append detailed session info + token stats" },
	{ name: "changelog", description: "Show latest changelog in collapsible row (/changelog all, /changelog refresh)" },
	{ name: "hotkeys", description: "Open keyboard shortcuts" },
	{ name: "terminal", description: "Toggle docked terminal" },
	{ name: "fork", description: "Open fork flow, /fork <query> pre-fills message search" },
	{ name: "tree", description: "Open full session tree across branches, /tree <query> pre-fills search" },
	{ name: "login", description: "No arg opens model picker auth actions; /login <provider> opens provider login guidance/setup" },
	{ name: "logout", description: "No arg opens model picker auth actions; /logout <provider> clears auth.json credentials" },
	{ name: "new", description: "Start fresh session tab" },
	{ name: "compact", description: "Manually compact context, /compact <instructions> optional" },
	{ name: "resume", description: "Open session browser, /resume <query> pre-fills search" },
	{ name: "reload", description: "Reload runtime (bridge restart + state/models/commands refresh)" },
	{ name: "quit", description: "Quit Desktop app" },
];
