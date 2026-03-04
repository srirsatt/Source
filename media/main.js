// @ts-nocheck

(function () {

    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // grab my elements by DOM
    const urlInput = document.getElementById("urlInput");
    const agentSelect = document.getElementById("agentSelect");
    const goBtn = document.getElementById("goBtn");

    // handle the button click
    goBtn?.addEventListener('click', () => {
        const url = urlInput?.value.trim();
        const agent = agentSelect?.value;

        if (!url) {
            return;
        }

        // try
        try {
            new URL(url);
        } catch (e) {
            console.error("Invalid URL", e);
            return;
        }

        // send msg to the extension on success
        vscode.postMessage({
            command: 'indexUrl',
            url: url,
            agent: agent
        });

        goBtn.disabled = true;
        goBtn.textContent = "Indexing...";

        console.log("URL:", url);
        console.log("Agent:", agent);
    });

    urlInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            goBtn?.click();
        }
    });

    window.addEventListener("message", (event) => {
        const message = event.data;
        if (message.command === 'done') {
            goBtn.disabled = false;
            goBtn.textContent = "Index Docs";
        }
        console.log("Recieved message", message);
    });
})();