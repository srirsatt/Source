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
            if (message.command === 'indexUrl') {
                vscode.window.showInformationMessage(`Indexing ${message.url} for ${message.agent}`);
                // msg cralwer goes here
                // basically, we want to crawl the link thru MCP + indexing, and send it back
                // afterwards, we'll keep the done command as it is here
                // lets start with a basic HTML index -> crawler.ts
                const pages = await (0, crawler_1.crawlDocs)(message.url, { maxDepth: 3, maxPages: 100 });
                console.log(`Crawled ${pages.length} pages`);
                webviewView.webview.postMessage({
                    command: 'done'
                });
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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<title>Source</title>
				<style>
					.container {
						display: flex;
						flex-direction: column;
						gap: 10px;
					}
				</style>
			</head>
			<body>
			<div class="container">
				<h1>Source</h1>
				<input type="text" id="urlInput" placeholder="https://supabase.com/docs/..." />
				<select id="agentSelect">
					<option value="antigravity">Antigravity</option>
					<option value="claudecode">Claude Code</option>
					<option value="cursor">Cursor</option>
					<option value="copilot">Copilot</option>
				</select>

				<button id="goBtn">Index Docs</button>
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