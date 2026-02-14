/**
 * RPC Bridge - connects the Tauri frontend to the pi coding agent via IPC.
 *
 * Tauri Rust backend spawns the pi process and relays stdin/stdout.
 * This bridge provides a typed API matching the pi RPC protocol.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Types (subset of pi RPC protocol)
// ============================================================================

export interface RpcStartOptions {
	/** Dev-mode only: path to the CLI JS file. Null in production (auto-discovery). */
	cliPath: string | null;
	cwd: string;
	provider?: string;
	model?: string;
	env?: Record<string, string>;
}

export interface RpcSessionState {
	model?: { provider: string; id: string; contextWindow?: number; reasoning?: boolean };
	thinkingLevel: string;
	isStreaming: boolean;
	isCompacting: boolean;
	steeringMode: "all" | "one-at-a-time";
	followUpMode: "all" | "one-at-a-time";
	sessionFile?: string;
	sessionId: string;
	sessionName?: string;
	autoCompactionEnabled: boolean;
	messageCount: number;
	pendingMessageCount: number;
}

export type RpcEventCallback = (event: Record<string, unknown>) => void;
export type RpcResponseCallback = (response: Record<string, unknown>) => void;

// ============================================================================
// RPC Bridge
// ============================================================================

export class RpcBridge {
	private requestId = 0;
	private pendingRequests = new Map<
		string,
		{ resolve: (data: Record<string, unknown>) => void; reject: (err: Error) => void }
	>();
	private eventListeners: RpcEventCallback[] = [];
	private unlistenEvent: UnlistenFn | null = null;
	private unlistenClosed: UnlistenFn | null = null;
	private unlistenStderr: UnlistenFn | null = null;
	private _isConnected = false;

	get isConnected(): boolean {
		return this._isConnected;
	}

	/**
	 * Start the pi RPC process and begin listening for events.
	 * Returns a string describing how the pi binary was discovered.
	 */
	async start(options: RpcStartOptions): Promise<string> {
		// Listen for events from Rust backend before starting process
		this.unlistenEvent = await listen<string>("rpc-event", (event) => {
			this.handleLine(event.payload);
		});

		this.unlistenClosed = await listen<string>("rpc-closed", () => {
			this._isConnected = false;
			this.rejectAllPending("RPC process closed");
			for (const listener of this.eventListeners) {
				listener({ type: "rpc_disconnected" });
			}
		});

		this.unlistenStderr = await listen<string>("rpc-stderr", (event) => {
			console.debug("[pi stderr]", event.payload);
		});

		// Start the RPC process via Tauri
		const discoveryInfo = await invoke<string>("rpc_start", {
			options: {
				cli_path: options.cliPath ?? null,
				cwd: options.cwd,
				provider: options.provider || null,
				model: options.model || null,
				env: options.env || null,
			},
		});

		this._isConnected = true;
		return discoveryInfo;
	}

	/**
	 * Stop the RPC process.
	 */
	async stop(): Promise<void> {
		this._isConnected = false;
		this.unlistenEvent?.();
		this.unlistenClosed?.();
		this.unlistenStderr?.();
		this.unlistenEvent = null;
		this.unlistenClosed = null;
		this.unlistenStderr = null;
		this.rejectAllPending("RPC stopped");
		await invoke("rpc_stop");
	}

	/**
	 * Subscribe to agent events (streaming text, tool calls, etc.)
	 */
	onEvent(callback: RpcEventCallback): () => void {
		this.eventListeners.push(callback);
		return () => {
			const idx = this.eventListeners.indexOf(callback);
			if (idx !== -1) this.eventListeners.splice(idx, 1);
		};
	}

	// =========================================================================
	// Commands
	// =========================================================================

	async prompt(message: string, images?: Array<{ type: string; data: string; mimeType: string }>): Promise<void> {
		await this.send({ type: "prompt", message, images });
	}

	async steer(message: string): Promise<void> {
		await this.send({ type: "steer", message });
	}

	async followUp(message: string): Promise<void> {
		await this.send({ type: "follow_up", message });
	}

	async abort(): Promise<void> {
		await this.send({ type: "abort" });
	}

	async newSession(parentSession?: string): Promise<{ cancelled: boolean }> {
		const response = await this.send({ type: "new_session", parentSession });
		return this.getData(response);
	}

	async getState(): Promise<RpcSessionState> {
		const response = await this.send({ type: "get_state" });
		return this.getData(response);
	}

	async setModel(provider: string, modelId: string): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "set_model", provider, modelId });
		return this.getData(response);
	}

	async cycleModel(): Promise<Record<string, unknown> | null> {
		const response = await this.send({ type: "cycle_model" });
		return this.getData(response);
	}

	async getAvailableModels(): Promise<Array<Record<string, unknown>>> {
		const response = await this.send({ type: "get_available_models" });
		const data = this.getData<{ models: Array<Record<string, unknown>> }>(response);
		return data.models;
	}

	async setThinkingLevel(level: string): Promise<void> {
		await this.send({ type: "set_thinking_level", level });
	}

	async cycleThinkingLevel(): Promise<{ level: string } | null> {
		const response = await this.send({ type: "cycle_thinking_level" });
		return this.getData(response);
	}

	async compact(customInstructions?: string): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "compact", customInstructions });
		return this.getData(response);
	}

	async setAutoCompaction(enabled: boolean): Promise<void> {
		await this.send({ type: "set_auto_compaction", enabled });
	}

	async bash(command: string): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "bash", command });
		return this.getData(response);
	}

	async abortBash(): Promise<void> {
		await this.send({ type: "abort_bash" });
	}

	async getMessages(): Promise<Array<Record<string, unknown>>> {
		const response = await this.send({ type: "get_messages" });
		const data = this.getData<{ messages: Array<Record<string, unknown>> }>(response);
		return data.messages;
	}

	async getSessionStats(): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "get_session_stats" });
		return this.getData(response);
	}

	async getCommands(): Promise<Array<Record<string, unknown>>> {
		const response = await this.send({ type: "get_commands" });
		const data = this.getData<{ commands: Array<Record<string, unknown>> }>(response);
		return data.commands;
	}

	async switchSession(sessionFile: string): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "switch_session", sessionFile });
		return this.getData(response);
	}

	async setSessionName(name: string): Promise<void> {
		await this.send({ type: "set_session_name", name });
	}

	async exportHtml(): Promise<{ html: string }> {
		const response = await this.send({ type: "export_html" });
		return this.getData(response);
	}

	async getForkMessages(forkId: string): Promise<Array<Record<string, unknown>>> {
		const response = await this.send({ type: "get_fork_messages", forkId });
		const data = this.getData<{ messages: Array<Record<string, unknown>> }>(response);
		return data.messages;
	}

	async fork(): Promise<Record<string, unknown>> {
		const response = await this.send({ type: "fork" });
		return this.getData(response);
	}

	async getLastAssistantText(): Promise<string> {
		const response = await this.send({ type: "get_last_assistant_text" });
		const data = this.getData<{ text: string }>(response);
		return data.text;
	}

	// =========================================================================
	// Internal
	// =========================================================================

	private handleLine(line: string): void {
		let data: Record<string, unknown>;
		try {
			data = JSON.parse(line);
		} catch {
			return; // Ignore non-JSON lines
		}

		// Check if it's a response to a pending request
		if (data.type === "response" && typeof data.id === "string" && this.pendingRequests.has(data.id)) {
			const pending = this.pendingRequests.get(data.id)!;
			this.pendingRequests.delete(data.id);
			pending.resolve(data);
			return;
		}

		// Otherwise it's a streaming event -- dispatch to listeners
		for (const listener of this.eventListeners) {
			listener(data);
		}
	}

	private async send(command: Record<string, unknown>): Promise<Record<string, unknown>> {
		const id = `req_${++this.requestId}`;
		const fullCommand = { ...command, id };

		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(id);
				reject(new Error(`Timeout waiting for response to ${command.type}`));
			}, 30000);

			this.pendingRequests.set(id, {
				resolve: (response) => {
					clearTimeout(timeout);
					resolve(response);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});

			invoke("rpc_send", { command: JSON.stringify(fullCommand) }).catch((err) => {
				clearTimeout(timeout);
				this.pendingRequests.delete(id);
				reject(new Error(`Failed to send RPC command: ${err}`));
			});
		});
	}

	private getData<T = Record<string, unknown>>(response: Record<string, unknown>): T {
		if (response.success === false) {
			throw new Error((response.error as string) || "Unknown RPC error");
		}
		return (response.data ?? response) as T;
	}

	private rejectAllPending(reason: string): void {
		for (const [_id, pending] of this.pendingRequests) {
			pending.reject(new Error(reason));
		}
		this.pendingRequests.clear();
	}
}

/** Singleton RPC bridge instance */
export const rpcBridge = new RpcBridge();
