// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { crawlDocs } from './crawler';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(Source.viewType, provider)
	);
}


class Source implements vscode.WebviewViewProvider {

	public static readonly viewType = "source.mainView";

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
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
				const pages = await crawlDocs(message.url, { maxDepth: 3, maxPages: 200 });
				console.log(`Crawled ${pages.length} pages`);

				webviewView.webview.postMessage({
					command: 'done'
				});

			}
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
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
export function deactivate() { }
