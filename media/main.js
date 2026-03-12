// @ts-nocheck

(function () {

    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // grab my elements by DOM
    const urlInput = document.getElementById("urlInput");
    const goBtn = document.getElementById("goBtn");

    // show/hide the + button based on input content
    function updateBtnVisibility() {
        if (!goBtn) return;
        const hasValue = urlInput?.value.trim().length > 0;
        goBtn.classList.toggle('visible', hasValue);
    }

    urlInput?.addEventListener('input', updateBtnVisibility);

    // handle the button click
    goBtn?.addEventListener('click', () => {
        const url = urlInput?.value.trim();

        if (!url) {
            return;
        }

        // try
        try {
            new URL(url);
        } catch (e) {
            //console.error("Invalid URL", e);
            return;
        }

        // send msg to the extension on success
        vscode.postMessage({
            command: 'indexUrl',
            url: url
        });

        goBtn.disabled = true;
        goBtn.classList.remove('visible');

        // show loading card
        const hostname = new URL(url).hostname;
        showLoadingCard(hostname);
    });

    urlInput?.addEventListener('paste', () => {
        setTimeout(() => {
            urlInput.scrollLeft = 0;
            updateBtnVisibility();
        }, 0);
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
            goBtn.textContent = "+";
            updateBtnVisibility();
            removeLoadingCard();
        }
        if (message.command === 'updateSources') {
            renderSources(message.sources);
        }
        console.log("Recieved message", message);
    });

    function showLoadingCard(hostname) {
        const section = document.getElementById('sourcesSection');
        const list = document.getElementById('sourcesList');
        if (!list || !section) return;

        section.classList.add('visible');
        removeLoadingCard();

        const card = document.createElement('div');
        card.className = 'source-loading';
        card.id = 'loadingCard';

        const dot = document.createElement('span');
        dot.style.cssText = 'width:6px; height:6px; border-radius:50%; background:rgba(91,127,245,0.5); flex-shrink:0; animation: pulse 1.5s ease-in-out infinite;';

        const info = document.createElement('div');
        info.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;';

        const name = document.createElement('span');
        name.textContent = hostname;
        name.style.cssText = 'opacity:0.7; font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

        const meta = document.createElement('span');
        meta.textContent = 'indexing\u2026';
        meta.style.cssText = 'opacity:0.2; font-size:10px; color:#5b7ff5;';

        info.appendChild(name);
        info.appendChild(meta);

        const track = document.createElement('div');
        track.className = 'progress-track';
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        track.appendChild(progressBar);

        card.appendChild(dot);
        card.appendChild(info);
        card.appendChild(track);

        list.insertBefore(card, list.firstChild);
    }

    function removeLoadingCard() {
        const existing = document.getElementById('loadingCard');
        if (existing) existing.remove();
    }

    function renderSources(sources) {
        const section = document.getElementById('sourcesSection');
        const list = document.getElementById('sourcesList');
        const countEl = document.getElementById('sourcesCount');
        if (!list || !section) return;

        list.innerHTML = '';

        if (sources.length === 0) {
            section.classList.remove('visible');
            return;
        }

        section.classList.add('visible');
        if (countEl) countEl.textContent = sources.length;

        sources.forEach(source => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex; align-items: center; padding: 10px 12px;
                background: var(--gray); border-radius: 8px;
                font-size: 12px; gap: 10px; transition: background 0.12s;
                border: 1px solid rgba(255,255,255,0.06);
            `;

            const dot = document.createElement('span');
            dot.style.cssText = 'width:6px; height:6px; border-radius:50%; background:rgba(91,127,245,0.5); flex-shrink:0;';

            const info = document.createElement('div');
            info.style.cssText = 'flex:1; min-width:0; display:flex; flex-direction:column; gap:2px;';

            const name = document.createElement('span');
            name.textContent = source.hostname;
            name.style.cssText = 'opacity:0.7; font-size:12px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';

            const meta = document.createElement('span');
            meta.textContent = source.pageCount ? source.pageCount + ' pages indexed' : 'indexed';
            meta.style.cssText = 'opacity:0.2; font-size:10px;';

            info.appendChild(name);
            info.appendChild(meta);

            const trash = document.createElement('button');
            trash.innerHTML = '&#x2715;';
            trash.style.cssText = `
                background: none; border: none; color: var(--vscode-foreground);
                cursor: pointer; opacity: 0; transition: opacity 0.1s;
                font-size: 9px; padding: 4px; flex-shrink: 0;
            `;

            row.addEventListener('mouseenter', () => {
                row.style.background = '#282929';
                trash.style.opacity = '0.35';
            });
            row.addEventListener('mouseleave', () => {
                row.style.background = 'var(--gray)';
                trash.style.opacity = '0';
            });
            trash.addEventListener('mouseenter', () => trash.style.opacity = '0.7');

            trash.addEventListener('click', () => {
                vscode.postMessage({ command: 'removeSource', hostname: source.hostname });
            });

            row.appendChild(dot);
            row.appendChild(info);
            row.appendChild(trash);
            list.appendChild(row);
        });
    }

    // tell extension we're ready to receive source list
    vscode.postMessage({ command: 'ready' });
})();