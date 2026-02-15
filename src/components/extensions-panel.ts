/**
 * Extensions Panel - discovered resources + package management
 */

import { html, render, type TemplateResult } from "lit";
import { rpcBridge } from "../rpc/bridge.js";

interface CommandInfo {
	name: string;
	description?: string;
	source: "extension" | "prompt" | "skill";
	location?: string;
	path?: string;
}

function getActiveProjectPath(): string {
	try {
		const raw = localStorage.getItem("pi-desktop.projects.v1");
		if (!raw) return ".";
		const projects = JSON.parse(raw) as Array<{ path?: string }>;
		return projects[0]?.path || ".";
	} catch {
		return ".";
	}
}

export class ExtensionsPanel {
	private container: HTMLElement;
	private isOpen = false;
	private loading = false;
	private runningCommand = false;
	private commands: CommandInfo[] = [];
	private onClose: (() => void) | null = null;

	private packageSource = "";
	private packageScope: "global" | "local" = "global";
	private commandOutput = "";
	private activeTab: "resources" | "packages" = "resources";

	constructor(container: HTMLElement) {
		this.container = container;
	}

	setOnClose(callback: () => void): void {
		this.onClose = callback;
	}

	async open(): Promise<void> {
		this.isOpen = true;
		this.loading = true;
		this.render();
		await this.loadResources();
		this.loading = false;
		this.render();
	}

	close(): void {
		this.isOpen = false;
		this.render();
		this.onClose?.();
	}

	private async loadResources(): Promise<void> {
		try {
			const commands = await rpcBridge.getCommands();
			this.commands = (commands as unknown as CommandInfo[]).sort((a, b) => a.source.localeCompare(b.source));
		} catch (err) {
			console.error("Failed to load extension resources:", err);
			this.commands = [];
		}
	}

	private renderBlock(title: string, entries: CommandInfo[], emptyLabel: string): TemplateResult {
		return html`
			<div class="resource-block">
				<div class="resource-title">${title}</div>
				${entries.length === 0
					? html`<div class="resource-empty">${emptyLabel}</div>`
					: entries.map(
							(item) => html`
								<div class="resource-row" title=${item.path || ""}>
									<div class="resource-main">/${item.name}</div>
									<div class="resource-meta">${item.description || item.location || item.path || item.source}</div>
								</div>
							`,
						)}
			</div>
		`;
	}

	private async runPackageCommand(args: string[]): Promise<void> {
		if (this.runningCommand) return;
		this.runningCommand = true;
		this.commandOutput = `${this.commandOutput ? `${this.commandOutput}\n\n` : ""}$ pi ${args.join(" ")}\n`;
		this.render();

		try {
			const cwd = this.packageScope === "local" ? getActiveProjectPath() : ".";
			const allArgs = this.packageScope === "local" ? [...args, "-l"] : args;
			const result = await rpcBridge.runPiCliCommand(allArgs, { cwd });

			const stdOut = result.stdout?.trim();
			const stdErr = result.stderr?.trim();
			this.commandOutput += [`[exit ${result.exit_code}] via ${result.discovery}`, stdOut, stdErr].filter(Boolean).join("\n") + "\n";

			if (result.exit_code === 0) {
				await this.loadResources();
			}
		} catch (err) {
			this.commandOutput += `Error: ${err instanceof Error ? err.message : String(err)}\n`;
		} finally {
			this.runningCommand = false;
			this.render();
		}
	}

	private async installPackage(): Promise<void> {
		const source = this.packageSource.trim();
		if (!source) return;
		await this.runPackageCommand(["install", source]);
	}

	private async removePackage(): Promise<void> {
		const source = this.packageSource.trim();
		if (!source) return;
		await this.runPackageCommand(["remove", source]);
	}

	private async updatePackages(): Promise<void> {
		const source = this.packageSource.trim();
		if (!source) {
			await this.runPackageCommand(["update"]);
			return;
		}
		await this.runPackageCommand(["update", source]);
	}

	private async listPackages(): Promise<void> {
		await this.runPackageCommand(["list"]);
	}

	render(): void {
		if (!this.isOpen) {
			this.container.innerHTML = "";
			return;
		}

		const extensions = this.commands.filter((c) => c.source === "extension");
		const prompts = this.commands.filter((c) => c.source === "prompt");
		const skills = this.commands.filter((c) => c.source === "skill");

		const template = html`
			<div class="overlay" @click=${(e: Event) => e.target === e.currentTarget && this.close()}>
				<div class="extensions-card">
					<div class="extensions-header">
						<h2>Extensions, Skills & Packages</h2>
						<button @click=${() => this.close()}>✕</button>
					</div>

					<div class="extensions-body">
						<div class="resource-tabs">
							<button class="ghost-btn ${this.activeTab === "resources" ? "active-tab" : ""}" @click=${() => {
								this.activeTab = "resources";
								this.render();
							}}>Discovered resources</button>
							<button class="ghost-btn ${this.activeTab === "packages" ? "active-tab" : ""}" @click=${() => {
								this.activeTab = "packages";
								this.render();
							}}>Package manager</button>
						</div>

						${this.activeTab === "resources"
							? this.loading
								? html`<div class="overlay-empty">Loading resources…</div>`
								: html`
									${this.renderBlock(
										`Extensions (${extensions.length})`,
										extensions,
										"No extension commands discovered.",
									)}
									${this.renderBlock(
										`Prompt templates (${prompts.length})`,
										prompts,
										"No prompt templates discovered.",
									)}
									${this.renderBlock(`Skills (${skills.length})`, skills, "No skills discovered.")}
								`
							: html`
								<div class="package-controls">
									<input
										type="text"
										placeholder="npm:@scope/pkg or git:github.com/user/repo"
										.value=${this.packageSource}
										@input=${(e: Event) => {
											this.packageSource = (e.target as HTMLInputElement).value;
											this.render();
										}}
									/>
									<select
										class="settings-select"
										.value=${this.packageScope}
										@change=${(e: Event) => {
											this.packageScope = (e.target as HTMLSelectElement).value as "global" | "local";
											this.render();
										}}
									>
										<option value="global">global (~/.pi/agent)</option>
										<option value="local">project (.pi)</option>
									</select>
								</div>

								<div class="settings-actions">
									<button class="ghost-btn" ?disabled=${this.runningCommand || !this.packageSource.trim()} @click=${() => this.installPackage()}>Install</button>
									<button class="ghost-btn" ?disabled=${this.runningCommand || !this.packageSource.trim()} @click=${() => this.removePackage()}>Remove</button>
									<button class="ghost-btn" ?disabled=${this.runningCommand} @click=${() => this.updatePackages()}>Update</button>
									<button class="ghost-btn" ?disabled=${this.runningCommand} @click=${() => this.listPackages()}>List</button>
								</div>

								<div class="resource-block">
									<div class="resource-title">Command Output</div>
									<pre class="tool-output" style="max-height:280px">${this.commandOutput || "No command run yet."}</pre>
								</div>
							`}
					</div>

					<div class="extensions-footer">
						<button class="ghost-btn" @click=${() => this.open()}>Refresh</button>
						<span class="settings-desc">
							This runs real <code>pi install/remove/update/list</code> commands via the desktop backend.
						</span>
					</div>
				</div>
			</div>
		`;

		render(template, this.container);
	}

	destroy(): void {
		this.container.innerHTML = "";
	}
}
