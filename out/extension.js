"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const crawler_1 = require("./crawler");
const mcpServer_1 = require("./mcpServer");
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    /*

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "source" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const disposable = vscode.commands.registerCommand('source.helloWorld', () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user
        vscode.window.showInformationMessage('Hello World from Source!');
    });

    context.subscriptions.push(disposable);

    */
    const provider = new Source(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(Source.viewType, provider));
}
class Source {
    _extensionUri;
    static viewType = "source.mainView";
    _view;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri],
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (message) => {
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (message.command === 'ready') {
                if (workspacePath) {
                    webviewView.webview.postMessage({
                        command: 'updateSources',
                        sources: (0, mcpServer_1.getManifestSources)(workspacePath)
                    });
                }
            }
            if (message.command === 'indexUrl') {
                if (workspacePath && (0, mcpServer_1.isSourceIndexed)(message.url, workspacePath)) {
                    const hostname = new URL(message.url).hostname;
                    vscode.window.showInformationMessage(`${hostname} already crawled, updating agent configs...`);
                    const existingPages = (0, mcpServer_1.getIndexedPages)(message.url, workspacePath);
                    if (existingPages) {
                        await (0, mcpServer_1.setupDocs)(existingPages, workspacePath, message.url, this._extensionUri.fsPath);
                    }
                    webviewView.webview.postMessage({ command: 'updateSources', sources: (0, mcpServer_1.getManifestSources)(workspacePath) });
                    webviewView.webview.postMessage({ command: 'done' });
                    return;
                }
                vscode.window.showInformationMessage(`Indexing ${message.url} for ${message.agent}`);
                const pages = await (0, crawler_1.crawlDocs)(message.url, { maxDepth: 3, maxPages: 200 });
                console.log(`Crawled ${pages.length} pages`);
                if (workspacePath) {
                    await (0, mcpServer_1.setupDocs)(pages, workspacePath, message.url, this._extensionUri.fsPath);
                    webviewView.webview.postMessage({ command: 'updateSources', sources: (0, mcpServer_1.getManifestSources)(workspacePath) });
                }
                webviewView.webview.postMessage({ command: 'done' });
            }
            if (message.command === 'removeSource') {
                if (workspacePath) {
                    (0, mcpServer_1.removeSource)(message.hostname, workspacePath);
                    vscode.window.showInformationMessage(`Removed ${message.hostname}`);
                    webviewView.webview.postMessage({ command: 'updateSources', sources: (0, mcpServer_1.getManifestSources)(workspacePath) });
                    webviewView.webview.postMessage({ command: 'done' });
                }
            }
        });
    }
    _getHtmlForWebview(webview) {
        // Get the local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');
        // And the uri we use to load it in the webview
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();
        return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
				<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Space+Grotesk:wght@700&display=swap" rel="stylesheet">
				<title>Source</title>
				<style>
					* { box-sizing: border-box; margin: 0; padding: 0; }

					:root {
						--accent: #5b7ff5;
						--accent-dim: rgba(91, 127, 245, 0.08);
						--gray: #212223;
						--gray-border: rgba(255,255,255,0.08);
						--r: 8px;
					}

					body {
						font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
						color: var(--vscode-foreground);
						padding: 16px 14px 16px;
						min-height: 100vh;
						display: flex;
						flex-direction: column;
					}

					/* ── Brand (compact) ── */
					.brand {
						display: flex;
						align-items: baseline;
						gap: 8px;
						padding: 8px 2px 14px;
					}

					.brand-logo {
						font-family: 'Space Grotesk', sans-serif;
						font-size: 18px;
						font-weight: 700;
						letter-spacing: 1px;
						text-transform: lowercase;
						color: rgba(255,255,255,0.85);
					}

					.brand-logo span {
						color: var(--accent);
					}

					.brand-sub {
						font-size: 10px;
						font-weight: 400;
						opacity: 0.2;
					}

					/* ── Add Source ── */
					.add-section {
						display: flex;
						flex-direction: column;
						gap: 8px;
					}

					.input-wrap {
						position: relative;
					}

					.input-wrap svg {
						position: absolute;
						left: 12px;
						top: 50%;
						transform: translateY(-50%);
						opacity: 0.2;
						pointer-events: none;
					}

					input {
						width: 100%;
						padding: 11px 40px 11px 34px;
						font-size: 13px;
						font-family: inherit;
						background: var(--gray);
						color: var(--vscode-input-foreground);
						border: 1px solid var(--gray-border);
						border-radius: var(--r);
						outline: none;
						transition: border-color 0.15s;
					}

					input:focus {
						border-color: rgba(91, 127, 245, 0.4);
					}

					input::placeholder {
						color: var(--vscode-input-placeholderForeground);
						opacity: 0.4;
					}

					/* ── Inline + button ── */
					.input-wrap button {
						position: absolute;
						right: 6px;
						top: 50%;
						transform: translateY(-50%);
						width: 28px;
						height: 28px;
						display: flex;
						align-items: center;
						justify-content: center;
						font-size: 18px;
						font-family: inherit;
						font-weight: 300;
						line-height: 1;
						background: var(--accent);
						color: #fff;
						border: none;
						border-radius: 6px;
						cursor: pointer;
						transition: opacity 0.2s;
						opacity: 0;
						pointer-events: none;
					}

					.input-wrap button.visible {
						opacity: 1;
						pointer-events: auto;
					}

					.input-wrap button:hover {
						opacity: 0.85;
					}

					.input-wrap button:disabled {
						opacity: 0.3;
						cursor: not-allowed;
					}

					/* ── Loading card ── */
					.source-loading {
						position: relative;
						display: flex;
						align-items: center;
						padding: 10px 12px;
						background: var(--gray);
						border-radius: var(--r);
						font-size: 12px;
						gap: 10px;
						border: 1px solid rgba(91, 127, 245, 0.12);
						overflow: hidden;
					}

					.source-loading .progress-track {
						position: absolute;
						left: 0;
						right: 0;
						bottom: 0;
						height: 2px;
						background: rgba(255,255,255,0.03);
						overflow: hidden;
					}

					.source-loading .progress-bar {
						height: 100%;
						width: 35%;
						background: linear-gradient(90deg, transparent, var(--accent), transparent);
						animation: indeterminate 1.4s ease-in-out infinite;
					}

					@keyframes indeterminate {
						0%   { transform: translateX(-100%); }
						100% { transform: translateX(350%); }
					}

					@keyframes pulse {
						0%, 100% { opacity: 1; }
						50%      { opacity: 0.3; }
					}

					/* ── Sources ── */
					.sources-section {
						display: none;
						margin-top: 24px;
					}

					.sources-section.visible {
						display: block;
					}

					.sources-header {
						display: flex;
						align-items: center;
						justify-content: space-between;
						margin-bottom: 10px;
						padding: 0 2px;
					}

					.sources-label {
						font-size: 11px;
						font-weight: 500;
						opacity: 0.25;
					}

					.sources-count {
						font-size: 10px;
						font-weight: 500;
						color: var(--accent);
						opacity: 0.4;
					}

					#sourcesList {
						display: flex;
						flex-direction: column;
						gap: 6px;
					}

					/* ── Footer ── */
					.footer {
						margin-top: auto;
						padding-top: 20px;
						text-align: center;
					}

					.footer-text {
						font-size: 9px;
						opacity: 0.1;
					}
				</style>
			</head>
			<body>
				<div class="brand">
					<div class="brand-logo">source<span>.</span></div>
					<div class="brand-sub">indexed docs for agent context</div>
				</div>

				<div class="add-section">
					<div class="input-wrap">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
						<input type="text" id="urlInput" placeholder="https://docs.example.com..." />
						<button id="goBtn">+</button>
					</div>
				</div>

				<div class="sources-section" id="sourcesSection">
					<div class="sources-header">
						<span class="sources-label">Indexed Sources</span>
						<span class="sources-count" id="sourcesCount"></span>
					</div>
					<div id="sourcesList"></div>
				</div>

				<div class="footer">
					<div class="footer-text">source v1.0</div>
				</div>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
		`;
    }
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map