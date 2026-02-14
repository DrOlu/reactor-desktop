/**
 * Chat view component.
 *
 * Renders the conversation with the pi coding agent using streaming RPC events.
 * Supports markdown rendering, streaming bash output, collapsible thinking blocks,
 * and Warp-inspired tool call visualization.
 */

import "@mariozechner/mini-lit/dist/MarkdownBlock.js";
import { html, nothing, render, type TemplateResult } from "lit";
import { type RpcSessionState, rpcBridge } from "../rpc/bridge.js";

// ============================================================================
// Types
// ============================================================================

interface MessageBlock {
	role: "user" | "assistant";
	content: string;
	toolCalls: ToolCallBlock[];
	isStreaming: boolean;
	thinkingContent?: string;
	isThinkingExpanded?: boolean;
}

interface ToolCallBlock {
	id: string;
	name: string;
	args: Record<string, unknown>;
	result?: string;
	streamingOutput?: string;
	isError?: boolean;
	isRunning: boolean;
	isExpanded: boolean;
}

// ============================================================================
// Chat View
// ============================================================================

export class ChatView {
	private container: HTMLElement;
	private messages: MessageBlock[] = [];
	private inputText = "";
	private state: RpcSessionState | null = null;
	private isConnected = false;
	private scrollContainer: HTMLElement | null = null;
	private unsubscribeEvents: (() => void) | null = null;
	private renderScheduled = false;
	private onStateChange: ((state: RpcSessionState) => void) | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Register a callback for state changes (used by titlebar to update model/session info).
	 */
	setOnStateChange(callback: (state: RpcSessionState) => void): void {
		this.onStateChange = callback;
	}

	getState(): RpcSessionState | null {
		return this.state;
	}

	/**
	 * Connect to the RPC bridge and start listening for events.
	 */
	connect(): void {
		this.unsubscribeEvents = rpcBridge.onEvent((event) => this.handleEvent(event));
		this.isConnected = rpcBridge.isConnected;
		this.scheduleRender();

		// Get initial state
		if (this.isConnected) {
			rpcBridge.getState().then((state) => {
				this.state = state;
				this.onStateChange?.(state);
				this.scheduleRender();
			});
		}
	}

	disconnect(): void {
		this.unsubscribeEvents?.();
		this.unsubscribeEvents = null;
	}

	// =========================================================================
	// Event Handling
	// =========================================================================

	private handleEvent(event: Record<string, unknown>): void {
		const type = event.type as string;

		switch (type) {
			case "agent_start":
				break;

			case "agent_end":
				if (this.messages.length > 0) {
					const last = this.messages[this.messages.length - 1];
					if (last.role === "assistant") {
						last.isStreaming = false;
					}
				}
				// Refresh state after agent run
				rpcBridge.getState().then((state) => {
					this.state = state;
					this.onStateChange?.(state);
					this.scheduleRender();
				});
				this.scheduleRender();
				break;

			case "message_start": {
				const msg = event.message as Record<string, unknown>;
				const role = msg.role as string;
				if (role === "assistant") {
					this.messages.push({
						role: "assistant",
						content: "",
						toolCalls: [],
						isStreaming: true,
					});
					this.scheduleRender();
				}
				break;
			}

			case "message_update": {
				const assistantEvent = event.assistantMessageEvent as Record<string, unknown>;
				if (!assistantEvent) break;

				const subtype = assistantEvent.type as string;
				const last = this.messages[this.messages.length - 1];
				if (!last || last.role !== "assistant") break;

				if (subtype === "text_delta") {
					last.content += assistantEvent.delta as string;
					this.scheduleRender();
					this.scrollToBottom();
				} else if (subtype === "thinking_delta") {
					if (!last.thinkingContent) last.thinkingContent = "";
					last.thinkingContent += assistantEvent.delta as string;
					// Only render occasionally for thinking to reduce overhead
					if (last.thinkingContent.length % 100 === 0) this.scheduleRender();
				} else if (subtype === "thinking_end") {
					this.scheduleRender();
				} else if (subtype === "toolcall_end") {
					const toolCall = assistantEvent.toolCall as Record<string, unknown>;
					if (toolCall) {
						last.toolCalls.push({
							id: toolCall.id as string,
							name: toolCall.name as string,
							args: (toolCall.arguments ?? toolCall.args ?? {}) as Record<string, unknown>,
							isRunning: true,
							isExpanded: true,
						});
						this.scheduleRender();
					}
				}
				break;
			}

			case "message_end":
				this.scheduleRender();
				break;

			case "tool_execution_start": {
				const toolCallId = event.toolCallId as string;
				for (const msg of this.messages) {
					for (const tc of msg.toolCalls) {
						if (tc.id === toolCallId) {
							tc.isRunning = true;
						}
					}
				}
				this.scheduleRender();
				break;
			}

			case "tool_execution_update": {
				const toolCallId = event.toolCallId as string;
				const partialResult = event.partialResult as Record<string, unknown> | undefined;
				if (!partialResult) break;

				for (const msg of this.messages) {
					for (const tc of msg.toolCalls) {
						if (tc.id === toolCallId) {
							// Extract text from content array
							const content = partialResult.content as Array<Record<string, unknown>> | undefined;
							if (content && content.length > 0) {
								tc.streamingOutput = content[0].text as string;
							}
						}
					}
				}
				this.scheduleRender();
				this.scrollToBottom();
				break;
			}

			case "tool_execution_end": {
				const toolCallId = event.toolCallId as string;
				const result = event.result;
				const isError = event.isError as boolean;
				for (const msg of this.messages) {
					for (const tc of msg.toolCalls) {
						if (tc.id === toolCallId) {
							tc.isRunning = false;
							tc.streamingOutput = undefined;
							if (typeof result === "string") {
								tc.result = result;
							} else if (result && typeof result === "object") {
								const r = result as Record<string, unknown>;
								const content = r.content as Array<Record<string, unknown>> | undefined;
								if (content && content.length > 0) {
									tc.result = content[0].text as string;
								} else {
									tc.result = JSON.stringify(result, null, 2);
								}
							}
							tc.isError = isError;
							// Auto-collapse successful non-bash tool calls
							if (!isError && tc.name !== "bash") {
								tc.isExpanded = false;
							}
						}
					}
				}
				this.scheduleRender();
				this.scrollToBottom();
				break;
			}

			case "rpc_disconnected":
				this.isConnected = false;
				this.scheduleRender();
				break;
		}
	}

	// =========================================================================
	// Actions
	// =========================================================================

	async sendMessage(): Promise<void> {
		const text = this.inputText.trim();
		if (!text) return;

		this.messages.push({
			role: "user",
			content: text,
			toolCalls: [],
			isStreaming: false,
		});
		this.inputText = "";
		this.scheduleRender();
		this.scrollToBottom();

		try {
			await rpcBridge.prompt(text);
		} catch (err) {
			console.error("Failed to send prompt:", err);
		}
	}

	async abortCurrentRun(): Promise<void> {
		try {
			await rpcBridge.abort();
		} catch (err) {
			console.error("Failed to abort:", err);
		}
	}

	async newSession(): Promise<void> {
		try {
			await rpcBridge.newSession();
			this.messages = [];
			const state = await rpcBridge.getState();
			this.state = state;
			this.onStateChange?.(state);
			this.scheduleRender();
		} catch (err) {
			console.error("Failed to create new session:", err);
		}
	}

	private scrollToBottom(): void {
		requestAnimationFrame(() => {
			if (this.scrollContainer) {
				this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
			}
		});
	}

	private scheduleRender(): void {
		if (this.renderScheduled) return;
		this.renderScheduled = true;
		requestAnimationFrame(() => {
			this.renderScheduled = false;
			this.doRender();
		});
	}

	// =========================================================================
	// Rendering
	// =========================================================================

	private renderUserMessage(msg: MessageBlock): TemplateResult {
		return html`
			<div class="flex justify-end mb-4 px-4">
				<div class="max-w-[80%] px-4 py-2.5 rounded-2xl bg-primary/10 text-foreground text-sm leading-relaxed whitespace-pre-wrap">
					${msg.content}
				</div>
			</div>
		`;
	}

	private renderToolCall(tc: ToolCallBlock): TemplateResult {
		const statusDot = tc.isRunning
			? html`<span class="tool-status-dot running"></span>`
			: tc.isError
				? html`<span class="tool-status-dot error"></span>`
				: html`<span class="tool-status-dot success"></span>`;

		// Format tool display
		let label = tc.name;
		let detail = "";
		if (tc.name === "bash" && tc.args.command) {
			label = "Terminal";
			detail = tc.args.command as string;
		} else if (tc.name === "read" && tc.args.filePath) {
			label = "Read";
			detail = this.shortenPath(tc.args.filePath as string);
		} else if (tc.name === "edit" && tc.args.filePath) {
			label = "Edit";
			detail = this.shortenPath(tc.args.filePath as string);
		} else if (tc.name === "write" && tc.args.filePath) {
			label = "Write";
			detail = this.shortenPath(tc.args.filePath as string);
		} else if (tc.name === "glob" && tc.args.pattern) {
			label = "Search";
			detail = tc.args.pattern as string;
		} else if (tc.name === "grep" && tc.args.pattern) {
			label = "Grep";
			detail = tc.args.pattern as string;
		}

		const output = tc.streamingOutput ?? tc.result;
		const hasOutput = output && output.length > 0;

		return html`
			<div class="tool-block my-2 mx-4">
				<button
					class="tool-block-header w-full text-left"
					@click=${() => {
						tc.isExpanded = !tc.isExpanded;
						this.scheduleRender();
					}}
				>
					${statusDot}
					<span class="font-mono font-medium text-foreground/80">${label}</span>
					${
						detail
							? html`<span class="text-muted-foreground truncate ml-1 flex-1 font-mono">${detail}</span>`
							: nothing
					}
					<span class="text-muted-foreground text-[10px] ml-auto pl-2">${tc.isExpanded ? "\u25B2" : "\u25BC"}</span>
				</button>
				${
					tc.isExpanded && hasOutput
						? html`
						<div class="tool-output ${tc.name === "bash" ? "bash-output" : ""}">
							<pre class="text-xs text-muted-foreground whitespace-pre-wrap break-all m-0">${output}${tc.isRunning ? html`<span class="streaming-cursor-inline"></span>` : nothing}</pre>
						</div>
					`
						: nothing
				}
			</div>
		`;
	}

	private shortenPath(path: string): string {
		const parts = path.replace(/\\/g, "/").split("/");
		if (parts.length <= 3) return parts.join("/");
		return `.../${parts.slice(-2).join("/")}`;
	}

	private renderThinking(msg: MessageBlock): TemplateResult | typeof nothing {
		if (!msg.thinkingContent) return nothing;
		const isExpanded = msg.isThinkingExpanded ?? false;
		const preview = msg.thinkingContent.slice(0, 80).replace(/\n/g, " ");

		return html`
			<div class="mx-4 mb-2">
				<button
					class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground/70 transition-colors"
					@click=${() => {
						msg.isThinkingExpanded = !msg.isThinkingExpanded;
						this.scheduleRender();
					}}
				>
					<span class="text-[10px]">${isExpanded ? "\u25B2" : "\u25BC"}</span>
					<span class="italic">${isExpanded ? "Thinking" : `Thinking: ${preview}...`}</span>
				</button>
				${
					isExpanded
						? html`
						<div class="mt-1 pl-4 border-l-2 border-border">
							<div class="text-xs text-muted-foreground/70 italic whitespace-pre-wrap leading-relaxed">
								${msg.thinkingContent}
							</div>
						</div>
					`
						: nothing
				}
			</div>
		`;
	}

	private renderAssistantMessage(msg: MessageBlock): TemplateResult {
		return html`
			<div class="mb-4">
				<!-- Thinking -->
				${this.renderThinking(msg)}

				<!-- Text content with markdown -->
				${
					msg.content
						? html`
						<div class="px-4 py-1 assistant-content">
							<markdown-block
								.content=${msg.content}
								class="${msg.isStreaming ? "streaming-cursor" : ""}"
							></markdown-block>
						</div>
					`
						: nothing
				}

				<!-- Tool calls -->
				${msg.toolCalls.map((tc) => this.renderToolCall(tc))}
			</div>
		`;
	}

	private renderEmptyState(): TemplateResult {
		return html`
			<div class="flex-1 flex flex-col items-center justify-center text-center px-8">
				<div class="text-5xl font-extralight text-foreground/80 mb-3 tracking-tight">pi</div>
				<p class="text-sm text-muted-foreground max-w-md leading-relaxed">
					Ask anything. I can read, write, and edit files, run commands, and help you build software.
				</p>
				<div class="flex gap-2 mt-6">
					<button
						class="px-3 py-1.5 rounded-lg bg-secondary/50 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
						@click=${() => {
							this.inputText = "What files are in this project?";
							this.scheduleRender();
							requestAnimationFrame(() => {
								const ta = this.container.querySelector("textarea");
								ta?.focus();
							});
						}}
					>List files</button>
					<button
						class="px-3 py-1.5 rounded-lg bg-secondary/50 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
						@click=${() => {
							this.inputText = "Explain this codebase";
							this.scheduleRender();
							requestAnimationFrame(() => {
								const ta = this.container.querySelector("textarea");
								ta?.focus();
							});
						}}
					>Explain codebase</button>
				</div>
			</div>
		`;
	}

	private renderInput(): TemplateResult {
		const isStreaming = this.messages.some((m) => m.isStreaming);

		return html`
			<div class="border-t border-border px-4 py-3 bg-background">
				<div class="flex items-end gap-2 max-w-3xl mx-auto">
					<div class="flex-1 relative">
						<textarea
							id="chat-input"
							class="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 min-h-[44px] max-h-[200px]"
							placeholder="Message pi... (Enter to send, Shift+Enter for newline)"
							rows="1"
							.value=${this.inputText}
							@input=${(e: Event) => {
								const textarea = e.target as HTMLTextAreaElement;
								this.inputText = textarea.value;
								textarea.style.height = "auto";
								textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
							}}
							@keydown=${(e: KeyboardEvent) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									if (isStreaming) return;
									this.sendMessage();
								}
							}}
						></textarea>
					</div>
					${
						isStreaming
							? html`
							<button
								@click=${() => this.abortCurrentRun()}
								class="shrink-0 p-2.5 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
								title="Stop (Esc)"
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<rect x="3" y="3" width="10" height="10" rx="1" />
								</svg>
							</button>
						`
							: html`
							<button
								@click=${() => this.sendMessage()}
								class="shrink-0 p-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30"
								?disabled=${!this.inputText.trim()}
								title="Send (Enter)"
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M2 8h12M10 4l4 4-4 4" />
								</svg>
							</button>
						`
					}
				</div>
			</div>
		`;
	}

	private doRender(): void {
		const hasMessages = this.messages.length > 0;

		const template = html`
			<div class="flex flex-col h-full">
				<!-- Messages area -->
				<div class="flex-1 overflow-y-auto" id="chat-scroll">
					${
						hasMessages
							? html`
							<div class="max-w-3xl mx-auto py-4">
								${this.messages.map((msg) =>
									msg.role === "user" ? this.renderUserMessage(msg) : this.renderAssistantMessage(msg),
								)}
							</div>
						`
							: this.renderEmptyState()
					}
				</div>

				<!-- Input -->
				${this.renderInput()}
			</div>
		`;

		render(template, this.container);
		this.scrollContainer = this.container.querySelector("#chat-scroll");
	}

	/** Public render for initial call */
	render(): void {
		this.doRender();
	}

	/** Focus the input textarea */
	focusInput(): void {
		const ta = this.container.querySelector("#chat-input") as HTMLTextAreaElement | null;
		ta?.focus();
	}
}
