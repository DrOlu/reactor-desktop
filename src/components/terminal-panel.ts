/**
 * TerminalPanel - lightweight command runner panel
 */

import { html, nothing, render } from "lit";
import { rpcBridge } from "../rpc/bridge.js";

interface TerminalEntry {
	id: string;
	kind: "command" | "stdout" | "stderr" | "meta";
	text: string;
}

function uid(prefix = "entry"): string {
	return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

function normalizeText(value: unknown): string {
	if (typeof value === "string") return value;
	if (value == null) return "";
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export class TerminalPanel {
	private container: HTMLElement;
	private entries: TerminalEntry[] = [];
	private command = "";
	private running = false;
	private cwd: string | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
		this.render();
	}

	setProjectPath(path: string | null): void {
		this.cwd = path;
		this.render();
	}

	focusInput(): void {
		const input = this.container.querySelector("#terminal-input") as HTMLInputElement | null;
		input?.focus();
	}

	private push(kind: TerminalEntry["kind"], text: string): void {
		this.entries.push({ id: uid(kind), kind, text });
		if (this.entries.length > 350) {
			this.entries = this.entries.slice(this.entries.length - 350);
		}
		this.render();
		requestAnimationFrame(() => {
			const body = this.container.querySelector("#terminal-log") as HTMLElement | null;
			if (body) body.scrollTop = body.scrollHeight;
		});
	}

	private clear(): void {
		this.entries = [];
		this.render();
	}

	private async run(): Promise<void> {
		if (this.running) return;
		const command = this.command.trim();
		if (!command) return;
		this.command = "";
		this.running = true;
		this.push("command", `$ ${command}`);

		try {
			const result = await rpcBridge.bash(command);
			const stdout = normalizeText((result as Record<string, unknown>).stdout);
			const stderr = normalizeText((result as Record<string, unknown>).stderr);
			const exitCode = (result as Record<string, unknown>).exitCode;

			if (stdout.trim()) this.push("stdout", stdout.trimEnd());
			if (stderr.trim()) this.push("stderr", stderr.trimEnd());
			if (typeof exitCode === "number") this.push("meta", `exit ${exitCode}`);
		} catch (err) {
			this.push("stderr", err instanceof Error ? err.message : String(err));
		} finally {
			this.running = false;
			this.render();
		}
	}

	private async abort(): Promise<void> {
		if (!this.running) return;
		try {
			await rpcBridge.abortBash();
			this.push("meta", "Command aborted");
		} catch {
			// ignore
		} finally {
			this.running = false;
			this.render();
		}
	}

	render(): void {
		const template = html`
			<div class="terminal-panel-root">
				<div class="terminal-panel-header">
					<div class="terminal-panel-title">Terminal</div>
					<div class="terminal-panel-cwd" title=${this.cwd || ""}>${this.cwd || "."}</div>
					<div class="terminal-panel-actions">
						<button class="ghost-btn" @click=${() => this.clear()}>Clear</button>
						${this.running
							? html`<button class="ghost-btn" @click=${() => void this.abort()}>Stop</button>`
							: nothing}
					</div>
				</div>
				<div class="terminal-panel-log" id="terminal-log">
					${this.entries.length === 0
						? html`<div class="terminal-panel-empty">Run a shell command in this workspace.</div>`
						: this.entries.map(
								(entry) => html`<pre class="terminal-entry ${entry.kind}">${entry.text}</pre>`,
							)}
				</div>
				<div class="terminal-panel-input-row">
					<span class="terminal-prompt">$</span>
					<input
						id="terminal-input"
						type="text"
						placeholder="Type a command"
						.value=${this.command}
						?disabled=${this.running}
						@input=${(e: Event) => {
							this.command = (e.target as HTMLInputElement).value;
							this.render();
						}}
						@keydown=${(e: KeyboardEvent) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void this.run();
							}
						}}
					/>
					<button class="ghost-btn" ?disabled=${this.running || !this.command.trim()} @click=${() => void this.run()}>Run</button>
				</div>
			</div>
		`;

		render(template, this.container);
	}
}
