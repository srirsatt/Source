// @ts-check

(function () {

    // @ts-ignore
    const vscode = acquireVsCodeApi();

    window.addEventListener("message", (event) => {
        const message = event.data;
        console.log("Recieved message", message);
    });
})();