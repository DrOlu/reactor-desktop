/**
 * Extension UI Handler - handles dialogs and notifications from pi extensions
 *
 * Extensions can request user interaction via:
 * - select: Choose from a list of options
 * - confirm: Yes/no confirmation
 * - input: Free-form text input
 * - editor: Multi-line text editor
 * - notify: Display a notification (fire-and-forget)
 */

import { html, render, type TemplateResult } from "lit";
import { rpcBridge } from "../rpc/bridge.js";

/** Extension UI request types */
type UiMethod =
	| "select"
	| "confirm"
	| "input"
	| "editor"
	| "notify"
	| "setStatus"
	| "setWidget"
	| "setTitle"
	| "set_editor_text";

interface ExtensionUiRequest {
	id: string;
	method: UiMethod;
	title?: string;
	message?: string;
	text?: string;
	options?: string[];
	placeholder?: string;
	prefill?: string;
	timeout?: number;
	notifyType?: "info" | "warning" | "error";
	statusKey?: string;
	statusText?: string;
	widgetKey?: string;
	widgetLines?: string[];
	widgetPlacement?: "aboveEditor" | "belowEditor";
}

export class ExtensionUiHandler {
	private overlayContainer: HTMLElement | null = null;
	private statusContainer: HTMLElement | null = null;
	private widgetAboveContainer: HTMLElement | null = null;
	private widgetBelowContainer: HTMLElement | null = null;
	private onSetEditorText: ((text: string) => void) | null = null;

	constructor() {
		this.createContainers();
	}

	setEditorTextHandler(handler: (text: string) => void): void {
		this.onSetEditorText = handler;
	}

	private createContainers(): void {
		// Overlay for dialogs
		this.overlayContainer = document.createElement("div");
		this.overlayContainer.id = "extension-ui-overlay";
		this.overlayContainer.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/50 hidden";
		document.body.appendChild(this.overlayContainer);

		// Status bar container (above input)
		this.statusContainer = document.createElement("div");
		this.statusContainer.id = "extension-status-container";
		this.statusContainer.className = "hidden fixed bottom-[92px] left-[278px] right-4 z-40 pointer-events-none";
		document.body.appendChild(this.statusContainer);

		// Widget containers
		this.widgetAboveContainer = document.createElement("div");
		this.widgetAboveContainer.id = "widget-above";
		this.widgetAboveContainer.className = "hidden fixed bottom-[132px] left-[278px] right-4 z-30";
		document.body.appendChild(this.widgetAboveContainer);

		this.widgetBelowContainer = document.createElement("div");
		this.widgetBelowContainer.id = "widget-below";
		this.widgetBelowContainer.className = "hidden fixed bottom-3 left-[278px] right-4 z-30";
		document.body.appendChild(this.widgetBelowContainer);
	}

	/**
	 * Handle an extension UI request from the RPC bridge
	 */
	async handleRequest(request: ExtensionUiRequest): Promise<void> {
		switch (request.method) {
			case "select":
				await this.showSelectDialog(request);
				break;
			case "confirm":
				await this.showConfirmDialog(request);
				break;
			case "input":
				await this.showInputDialog(request);
				break;
			case "editor":
				await this.showEditorDialog(request);
				break;
			case "notify":
				this.showNotification(request);
				break;
			case "setStatus":
				this.setStatus(request);
				break;
			case "setWidget":
				this.setWidget(request);
				break;
			case "setTitle":
				this.setTitle(request);
				break;
			case "set_editor_text":
				this.setEditorText(request);
				break;
		}
	}

	private async showSelectDialog(request: ExtensionUiRequest): Promise<void> {
		if (!this.overlayContainer) return;

		return new Promise((resolve) => {
			const options = request.options || [];
			let selectedIndex = -1;

			const template = html`
				<div class="bg-background rounded-lg shadow-xl border border-border w-full max-w-md p-4">
					<h3 class="text-sm font-medium mb-3">${request.title || "Select"}</h3>
					<div class="space-y-1 max-h-60 overflow-y-auto">
						${options.map(
							(opt, i) => html`
								<button
									class="w-full text-left px-3 py-2 rounded text-sm hover:bg-secondary transition-colors"
									@click=${() => {
										selectedIndex = i;
										this.closeOverlay();
										this.sendResponse(request.id, { value: opt });
										resolve();
									}}
								>
									${opt}
								</button>
							`,
						)}
					</div>
					<button
						class="mt-3 w-full px-3 py-2 rounded text-sm border border-border hover:bg-secondary transition-colors"
						@click=${() => {
							this.closeOverlay();
							this.sendResponse(request.id, { cancelled: true });
							resolve();
						}}
					>
						Cancel
					</button>
				</div>
			`;

			this.showOverlay(template);

			// Handle timeout
			if (request.timeout) {
				setTimeout(() => {
					if (selectedIndex === -1) {
						this.closeOverlay();
						this.sendResponse(request.id, { cancelled: true });
						resolve();
					}
				}, request.timeout);
			}
		});
	}

	private async showConfirmDialog(request: ExtensionUiRequest): Promise<void> {
		if (!this.overlayContainer) return;

		return new Promise((resolve) => {
			const template = html`
				<div class="bg-background rounded-lg shadow-xl border border-border w-full max-w-sm p-4">
					<h3 class="text-sm font-medium mb-2">${request.title || "Confirm"}</h3>
					<p class="text-sm text-muted-foreground mb-4">${request.message || "Are you sure?"}</p>
					<div class="flex gap-2 justify-end">
						<button
							class="px-3 py-1.5 rounded text-sm border border-border hover:bg-secondary transition-colors"
							@click=${() => {
								this.closeOverlay();
								this.sendResponse(request.id, { confirmed: false });
								resolve();
							}}
						>
							Cancel
						</button>
						<button
							class="px-3 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click=${() => {
								this.closeOverlay();
								this.sendResponse(request.id, { confirmed: true });
								resolve();
							}}
						>
							Confirm
						</button>
					</div>
				</div>
			`;

			this.showOverlay(template);

			// Handle timeout
			if (request.timeout) {
				setTimeout(() => {
					this.closeOverlay();
					this.sendResponse(request.id, { cancelled: true });
					resolve();
				}, request.timeout);
			}
		});
	}

	private async showInputDialog(request: ExtensionUiRequest): Promise<void> {
		if (!this.overlayContainer) return;

		return new Promise((resolve) => {
			let inputValue = "";

			const template = html`
				<div class="bg-background rounded-lg shadow-xl border border-border w-full max-w-md p-4">
					<h3 class="text-sm font-medium mb-3">${request.title || "Enter value"}</h3>
					<input
						type="text"
						class="w-full px-3 py-2 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
						placeholder="${request.placeholder || ""}"
						@input=${(e: Event) => {
							inputValue = (e.target as HTMLInputElement).value;
						}}
						@keydown=${(e: KeyboardEvent) => {
							if (e.key === "Enter") {
								this.closeOverlay();
								this.sendResponse(request.id, { value: inputValue });
								resolve();
							}
						}}
					/>
					<div class="flex gap-2 justify-end mt-3">
						<button
							class="px-3 py-1.5 rounded text-sm border border-border hover:bg-secondary transition-colors"
							@click=${() => {
								this.closeOverlay();
								this.sendResponse(request.id, { cancelled: true });
								resolve();
							}}
						>
							Cancel
						</button>
						<button
							class="px-3 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click=${() => {
								this.closeOverlay();
								this.sendResponse(request.id, { value: inputValue });
								resolve();
							}}
						>
							Submit
						</button>
					</div>
				</div>
			`;

			this.showOverlay(template);

			// Focus input after render
			setTimeout(() => {
				const input = this.overlayContainer?.querySelector("input");
				input?.focus();
			}, 50);
		});
	}

	private async showEditorDialog(request: ExtensionUiRequest): Promise<void> {
		if (!this.overlayContainer) return;

		return new Promise((resolve) => {
			let editorValue = request.prefill || "";

			const template = html`
				<div class="bg-background rounded-lg shadow-xl border border-border w-full max-w-2xl h-96 p-4 flex flex-col">
					<h3 class="text-sm font-medium mb-3">${request.title || "Edit"}</h3>
					<textarea
						class="flex-1 w-full px-3 py-2 rounded border border-border bg-background text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary"
						@input=${(e: Event) => {
							editorValue = (e.target as HTMLTextAreaElement).value;
						}}
					>${request.prefill || ""}</textarea>
					<div class="flex gap-2 justify-end mt-3">
						<button
							class="px-3 py-1.5 rounded text-sm border border-border hover:bg-secondary transition-colors"
							@click=${() => {
								this.closeOverlay();
								this.sendResponse(request.id, { cancelled: true });
								resolve();
							}}
						>
							Cancel
						</button>
						<button
							class="px-3 py-1.5 rounded text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
							@click=${() => {
								this.closeOverlay();
								this.sendResponse(request.id, { value: editorValue });
								resolve();
							}}
						>
							Save
						</button>
					</div>
				</div>
			`;

			this.showOverlay(template);

			// Focus textarea after render
			setTimeout(() => {
				const textarea = this.overlayContainer?.querySelector("textarea");
				textarea?.focus();
			}, 50);
		});
	}

	private showNotification(request: ExtensionUiRequest): void {
		const type = request.notifyType || "info";
		const bgColor =
			type === "error"
				? "bg-red-500"
				: type === "warning"
					? "bg-amber-500"
					: "bg-primary";

		const notification = document.createElement("div");
		notification.className = `fixed bottom-4 right-4 ${bgColor} text-white px-4 py-3 rounded-lg shadow-lg z-50 text-sm animate-slide-in`;
		notification.textContent = request.message || "";

		document.body.appendChild(notification);

		// Auto-remove after 5 seconds
		setTimeout(() => {
			notification.remove();
		}, 5000);
	}

	private setStatus(request: ExtensionUiRequest): void {
		if (!this.statusContainer) return;

		if (request.statusText === undefined) {
			// Clear status
			this.statusContainer.classList.add("hidden");
			this.statusContainer.innerHTML = "";
		} else {
			this.statusContainer.classList.remove("hidden");
			render(
				html`<div class="text-xs text-muted-foreground px-3 py-1">${request.statusText}</div>`,
				this.statusContainer,
			);
		}
	}

	private setWidget(request: ExtensionUiRequest): void {
		const container =
			request.widgetPlacement === "belowEditor" ? this.widgetBelowContainer : this.widgetAboveContainer;
		if (!container) return;

		if (!request.widgetLines || request.widgetLines.length === 0) {
			container.classList.add("hidden");
			container.innerHTML = "";
		} else {
			container.classList.remove("hidden");
			render(
				html`
					<div class="text-xs text-muted-foreground px-3 py-2 bg-secondary/50 border-t border-b border-border">
						${request.widgetLines.map((line) => html`<div>${line}</div>`)}
					</div>
				`,
				container,
			);
		}
	}

	private setTitle(request: ExtensionUiRequest): void {
		if (request.title) {
			document.title = request.title;
		}
	}

	private setEditorText(request: ExtensionUiRequest): void {
		if (typeof request.text !== "string") return;
		this.onSetEditorText?.(request.text);
	}

	private showOverlay(template: TemplateResult): void {
		if (!this.overlayContainer) return;
		this.overlayContainer.classList.remove("hidden");
		render(template, this.overlayContainer);
	}

	private closeOverlay(): void {
		if (!this.overlayContainer) return;
		this.overlayContainer.classList.add("hidden");
		this.overlayContainer.innerHTML = "";
	}

	private async sendResponse(id: string, data: Record<string, unknown>): Promise<void> {
		await rpcBridge.sendExtensionUiResponse({ type: "extension_ui_response", id, ...data });
	}

	destroy(): void {
		this.overlayContainer?.remove();
		this.statusContainer?.remove();
		this.widgetAboveContainer?.remove();
		this.widgetBelowContainer?.remove();
	}
}

