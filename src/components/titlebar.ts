/**
 * Custom titlebar component for the desktop app.
 *
 * Provides window controls (minimize, maximize, close), drag region,
 * model selector trigger, session name, and token/cost stats display.
 */

import { icon } from "@mariozechner/mini-lit";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { html, nothing, render } from "lit";
import { Maximize2, Minus, Square, X } from "lucide";
import { type RpcSessionState, rpcBridge } from "../rpc/bridge.js";
import { ModelSelector } from "./model-selector.js";

// ============================================================================
// Types
// ============================================================================

interface SessionStats {
	tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
	cost: number;
	totalMessages: number;
}

// ============================================================================
// TitleBar
// ============================================================================

export class TitleBar {
	private container: HTMLElement;
	private isMaximized = false;
	private state: RpcSessionState | null = null;
	private stats: SessionStats | null = null;
	private modelSelector: ModelSelector;
	private modelSelectorContainer: HTMLElement;
	private statsRefreshInterval: ReturnType<typeof setInterval> | null = null;

	constructor(container: HTMLElement) {
		this.container = container;

		// Create a container for the model selector overlay
		this.modelSelectorContainer = document.createElement("div");
		this.modelSelectorContainer.id = "model-selector-root";
		document.body.appendChild(this.modelSelectorContainer);
		this.modelSelector = new ModelSelector(this.modelSelectorContainer);

		this.checkMaximized();
		this.render();
	}

	/** Update displayed state (called from chat-view's onStateChange) */
	updateState(state: RpcSessionState): void {
		this.state = state;
		this.refreshStats();
		this.render();
	}

	/** Start periodic stats refresh */
	startStatsRefresh(): void {
		this.stopStatsRefresh();
		this.statsRefreshInterval = setInterval(() => this.refreshStats(), 10000);
	}

	stopStatsRefresh(): void {
		if (this.statsRefreshInterval) {
			clearInterval(this.statsRefreshInterval);
			this.statsRefreshInterval = null;
		}
	}

	private async refreshStats(): Promise<void> {
		try {
			const raw = await rpcBridge.getSessionStats();
			this.stats = {
				tokens: raw.tokens as SessionStats["tokens"],
				cost: raw.cost as number,
				totalMessages: raw.totalMessages as number,
			};
			this.render();
		} catch {
			// Stats not critical; ignore errors
		}
	}

	private async checkMaximized(): Promise<void> {
		try {
			this.isMaximized = await getCurrentWindow().isMaximized();
		} catch {
			// Ignore errors during dev mode
		}
	}

	private async minimize(): Promise<void> {
		await getCurrentWindow().minimize();
	}

	private async toggleMaximize(): Promise<void> {
		const win = getCurrentWindow();
		if (this.isMaximized) {
			await win.unmaximize();
		} else {
			await win.maximize();
		}
		this.isMaximized = !this.isMaximized;
		this.render();
	}

	private async close(): Promise<void> {
		await getCurrentWindow().close();
	}

	private openModelSelector(): void {
		const provider = this.state?.model?.provider ?? "";
		const modelId = this.state?.model?.id ?? "";

		this.modelSelector.open(provider, modelId, async (newProvider, newModelId) => {
			try {
				await rpcBridge.setModel(newProvider, newModelId);
				const state = await rpcBridge.getState();
				this.updateState(state);
			} catch (err) {
				console.error("Failed to set model:", err);
			}
		});
	}

	private formatTokens(n: number): string {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
		return `${n}`;
	}

	private formatCost(cost: number): string {
		if (cost === 0) return "$0.00";
		if (cost < 0.01) return `$${cost.toFixed(4)}`;
		return `$${cost.toFixed(2)}`;
	}

	destroy(): void {
		this.stopStatsRefresh();
		this.modelSelectorContainer.remove();
	}

	render(): void {
		const modelDisplay = this.state?.model ? this.state.model.id : "No model";

		const thinkingLevel = this.state?.thinkingLevel;
		const showThinking = thinkingLevel && thinkingLevel !== "off" && thinkingLevel !== "none";

		const template = html`
			<div
				data-tauri-drag-region
				class="flex items-center justify-between h-9 px-3 bg-background border-b border-border select-none"
			>
				<!-- Left: App title + session name -->
				<div data-tauri-drag-region class="flex items-center gap-2 flex-1 min-w-0">
					<span data-tauri-drag-region class="text-xs font-medium text-muted-foreground tracking-wide uppercase shrink-0">
						Pi
					</span>
					${
						this.state?.sessionName
							? html`
							<span class="text-[10px] text-muted-foreground/60 truncate">
								/ ${this.state.sessionName}
							</span>
						`
							: nothing
					}
				</div>

				<!-- Center: Model selector + thinking level + stats -->
				<div data-tauri-drag-region class="flex items-center gap-3 justify-center">
					<!-- Model button -->
					<button
						class="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-secondary transition-colors text-xs text-muted-foreground hover:text-foreground"
						@click=${() => this.openModelSelector()}
						title="Select model (Ctrl+M)"
					>
						<span class="font-mono truncate max-w-[200px]">${modelDisplay}</span>
						<span class="text-[10px] opacity-60">&#9662;</span>
					</button>

					${
						showThinking
							? html`<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">${thinkingLevel}</span>`
							: nothing
					}

					<!-- Stats -->
					${
						this.stats
							? html`
							<div class="flex items-center gap-2 text-[10px] text-muted-foreground/60">
								<span title="Total tokens">${this.formatTokens(this.stats.tokens.total)} tok</span>
								<span title="Session cost">${this.formatCost(this.stats.cost)}</span>
							</div>
						`
							: nothing
					}
				</div>

				<!-- Right: Window controls -->
				<div class="flex items-center gap-0.5 flex-1 justify-end">
					<button
						@click=${() => this.minimize()}
						class="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
						title="Minimize"
					>
						${icon(Minus, "xs")}
					</button>
					<button
						@click=${() => this.toggleMaximize()}
						class="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
						title=${this.isMaximized ? "Restore" : "Maximize"}
					>
						${this.isMaximized ? icon(Square, "xs") : icon(Maximize2, "xs")}
					</button>
					<button
						@click=${() => this.close()}
						class="p-1.5 rounded hover:bg-destructive/20 transition-colors text-muted-foreground hover:text-destructive"
						title="Close"
					>
						${icon(X, "xs")}
					</button>
				</div>
			</div>
		`;

		render(template, this.container);
	}
}
