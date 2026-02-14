/**
 * Pi Desktop - Main entry point
 *
 * Initializes the Tauri app, connects to the pi coding agent via RPC,
 * renders the minimalist chat interface, and sets up keyboard shortcuts.
 */

import { html, render } from "lit";
import { ChatView } from "./components/chat-view.js";
import { TitleBar } from "./components/titlebar.js";
import { rpcBridge } from "./rpc/bridge.js";
import "./styles/app.css";

// ============================================================================
// State
// ============================================================================

let titleBar: TitleBar | null = null;
let chatView: ChatView | null = null;
let connectionError: string | null = null;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Find the pi CLI entry point.
 * Returns null — the Rust backend discovers the pi binary
 * by checking PATH for a globally installed `pi` CLI.
 */
function findCliPath(): string | null {
	return null;
}

/**
 * Get the current working directory.
 * Defaults to the directory the app was launched from.
 */
function getCwd(): string {
	return ".";
}

async function initialize(): Promise<void> {
	const app = document.getElementById("app");
	if (!app) throw new Error("App container not found");

	// Render initial loading state
	render(
		html`
			<div class="w-full h-screen flex flex-col">
				<div id="titlebar"></div>
				<div class="flex-1 flex items-center justify-center">
					<div class="text-sm text-muted-foreground">Starting pi agent...</div>
				</div>
			</div>
		`,
		app,
	);

	// Initialize titlebar (even during loading)
	const titlebarEl = document.getElementById("titlebar")!;
	titleBar = new TitleBar(titlebarEl);

	try {
		const cliPath = findCliPath();
		const cwd = getCwd();

		const discoveryInfo = await rpcBridge.start({ cliPath, cwd });
		console.log("Pi process started via:", discoveryInfo);
		connectionError = null;

		// Render the main app shell
		renderApp();

		// Initialize chat view
		const chatContainer = document.getElementById("chat-container")!;
		chatView = new ChatView(chatContainer);

		// Wire up state change: chat-view -> titlebar
		chatView.setOnStateChange((state) => {
			titleBar?.updateState(state);
		});

		chatView.connect();
		chatView.render();

		// Start periodic stats refresh
		titleBar.startStatsRefresh();

		// Focus the input
		chatView.focusInput();
	} catch (err) {
		connectionError = err instanceof Error ? err.message : String(err);
		renderApp();
	}
}

// ============================================================================
// Keyboard Shortcuts
// ============================================================================

function setupKeyboardShortcuts(): void {
	document.addEventListener("keydown", (e: KeyboardEvent) => {
		const isCtrlOrMeta = e.ctrlKey || e.metaKey;

		// Ctrl+N / Cmd+N — New session
		if (isCtrlOrMeta && e.key === "n") {
			e.preventDefault();
			chatView?.newSession();
			return;
		}

		// Ctrl+L / Cmd+L — Clear and focus input
		if (isCtrlOrMeta && e.key === "l") {
			e.preventDefault();
			chatView?.focusInput();
			return;
		}

		// Escape — Abort current run
		if (e.key === "Escape") {
			// Don't steal Escape from model selector or other overlays
			const modelSelector = document.getElementById("model-selector-root");
			if (modelSelector && modelSelector.children.length > 0) return;

			chatView?.abortCurrentRun();
			return;
		}

		// Ctrl+M / Cmd+M — Cycle model (quick switch)
		if (isCtrlOrMeta && e.key === "m") {
			e.preventDefault();
			rpcBridge
				.cycleModel()
				.then(async () => {
					const state = await rpcBridge.getState();
					titleBar?.updateState(state);
				})
				.catch((err) => {
					console.error("Failed to cycle model:", err);
				});
			return;
		}

		// Ctrl+Shift+M — Open model selector
		if (isCtrlOrMeta && e.shiftKey && e.key === "M") {
			e.preventDefault();
			// Trigger model selector via titlebar - we can access it through the DOM
			const modelBtn = document.querySelector("[title*='Select model']") as HTMLButtonElement | null;
			modelBtn?.click();
			return;
		}
	});
}

// ============================================================================
// Render
// ============================================================================

function renderApp(): void {
	const app = document.getElementById("app");
	if (!app) return;

	if (connectionError) {
		render(
			html`
				<div class="w-full h-screen flex flex-col">
					<div id="titlebar"></div>
					<div class="flex-1 flex flex-col items-center justify-center px-8">
						<div class="text-foreground text-lg font-medium mb-2">Connection failed</div>
						<div class="text-sm text-muted-foreground text-center max-w-md mb-4">
							${connectionError}
						</div>
						<button
							@click=${() => {
								connectionError = null;
								renderApp();
								initialize();
							}}
							class="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90"
						>
							Retry
						</button>
					</div>
				</div>
			`,
			app,
		);
		// Re-initialize titlebar after re-render
		const titlebarEl = document.getElementById("titlebar")!;
		titleBar = new TitleBar(titlebarEl);
		return;
	}

	render(
		html`
			<div class="w-full h-screen flex flex-col">
				<div id="titlebar"></div>
				<div id="chat-container" class="flex-1 overflow-hidden"></div>
			</div>
		`,
		app,
	);

	// Re-initialize titlebar
	const titlebarEl = document.getElementById("titlebar")!;
	titleBar = new TitleBar(titlebarEl);
}

// ============================================================================
// Start
// ============================================================================

setupKeyboardShortcuts();
initialize();
