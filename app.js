// SaveSave Client Application Logic
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const videoUrlInput = document.getElementById('videoUrlInput');
    const urlForm = document.getElementById('urlForm');
    const clearBtn = document.getElementById('clearBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const fetchBtn = document.getElementById('fetchBtn');
    const loaderCard = document.getElementById('loaderCard');
    const errorCard = document.getElementById('errorCard');
    const errorMessage = document.getElementById('errorMessage');
    const closeErrorBtn = document.getElementById('closeErrorBtn');
    const videoCard = document.getElementById('videoCard');
    
    // Video Details Elements
    const videoThumbnail = document.getElementById('videoThumbnail');
    const durationBadge = document.getElementById('durationBadge');
    const platformBadge = document.getElementById('platformBadge');
    const platformName = document.getElementById('platformName');
    const videoTitle = document.getElementById('videoTitle');
    const videoAuthor = document.getElementById('videoAuthor');
    const videoDuration = document.getElementById('videoDuration');
    const formatOptionsGrid = document.getElementById('formatOptionsGrid');
    const startDownloadBtn = document.getElementById('startDownloadBtn');
    const downloadFormatSublabel = document.getElementById('downloadFormatSublabel');
    const playPreviewBtn = document.getElementById('playPreviewBtn');
    const mediaContainer = document.getElementById('mediaContainer');
    const playerWrapper = document.getElementById('playerWrapper');
    const previewPlayer = document.getElementById('previewPlayer');
    const closePlayerBtn = document.getElementById('closePlayerBtn');

    // Active Progress Card
    const progressCard = document.getElementById('progressCard');
    const progressFileName = document.getElementById('progressFileName');
    const progressPercent = document.getElementById('progressPercent');
    const progressBarFill = document.getElementById('progressBarFill');
    const progressSpeed = document.getElementById('progressSpeed');
    const progressSize = document.getElementById('progressSize');
    const progressEta = document.getElementById('progressEta');

    // History Elements
    const historyList = document.getElementById('historyList');
    const emptyHistory = document.getElementById('emptyHistory');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const serverStatusPill = document.getElementById('serverStatusPill');
    const serverStatusText = document.getElementById('serverStatusText');

    // State Variables
    let currentVideoData = null;
    let selectedFormat = null;
    let downloadHistory = JSON.parse(localStorage.getItem('savesave_history') || localStorage.getItem('streamdrop_history') || '[]');

    // HTML Modal Elements
    const htmlModal = document.getElementById('htmlModal');
    const htmlPasteHelper = document.getElementById('htmlPasteHelper');
    const openHtmlPasteBtn = document.getElementById('openHtmlPasteBtn');
    const closeHtmlModalBtn = document.getElementById('closeHtmlModalBtn');
    const cancelHtmlModalBtn = document.getElementById('cancelHtmlModalBtn');
    const extractHtmlBtn = document.getElementById('extractHtmlBtn');
    const htmlSourceInput = document.getElementById('htmlSourceInput');
    const targetSiteLink = document.getElementById('targetSiteLink');

    let currentTargetUrl = '';

    // Check Server Health Status
    checkServerHealth();
    renderHistory();

    // Input Event Listeners
    videoUrlInput.addEventListener('input', () => {
        clearBtn.style.display = videoUrlInput.value.trim() ? 'block' : 'none';
    });

    clearBtn.addEventListener('click', () => {
        videoUrlInput.value = '';
        clearBtn.style.display = 'none';
        videoUrlInput.focus();
    });

    // Paste from Clipboard Button
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                videoUrlInput.value = text.trim();
                clearBtn.style.display = 'block';
                showToast('Link pasted from clipboard', 'info');
            }
        } catch (err) {
            showToast('Please paste the URL manually (Ctrl+V)', 'warning');
        }
    });

    // Sample Link Buttons
    document.querySelectorAll('.sample-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-url');
            videoUrlInput.value = url;
            clearBtn.style.display = 'block';
            showToast('Sample link selected! Click Extract Video.', 'info');
        });
    });

    // Close Error Card
    closeErrorBtn.addEventListener('click', () => {
        errorCard.style.display = 'none';
    });

    // Modal Control Handlers
    openHtmlPasteBtn.addEventListener('click', () => {
        targetSiteLink.href = currentTargetUrl || '#';
        htmlModal.style.display = 'flex';
    });

    const closeHtmlModal = () => { htmlModal.style.display = 'none'; };
    closeHtmlModalBtn.addEventListener('click', closeHtmlModal);
    cancelHtmlModalBtn.addEventListener('click', closeHtmlModal);

    extractHtmlBtn.addEventListener('click', async () => {
        const html = htmlSourceInput.value.trim();
        if (!html) {
            showToast('Please paste page HTML source first', 'warning');
            return;
        }

        closeHtmlModal();
        hideAllCards();
        showLoader(true);

        try {
            const res = await fetch('/api/extract-html', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html, url: currentTargetUrl })
            });

            const data = await res.json();
            showLoader(false);

            if (!res.ok || !data.success) {
                showError(data.error || 'Failed to extract video from HTML.');
                return;
            }

            renderVideoCard(data);
            showToast('Video extracted successfully from source!', 'success');
        } catch (err) {
            showLoader(false);
            showError('Error connecting to backend server.');
        }
    });

    // Form Submit - Extract Video Info
    urlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        let url = videoUrlInput.value.trim();
        if (!url) return;

        // Auto-extract URL if user pastes an <iframe> tag
        const iframeMatch = url.match(/iframe[^>]+src=["']([^"']+)["']/i);
        if (iframeMatch) {
            url = iframeMatch[1];
            videoUrlInput.value = url;
        }

        // Client-side Anti-Malware Safeguard Check
        const DANGEROUS_EXT = ['exe', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'scr', 'msi', 'jar', 'sh', 'zip', 'rar', '7z', 'iso', 'img', 'tar', 'gz', 'apk', 'deb', 'rpm', 'dmg', 'app'];
        const lowerUrl = url.toLowerCase().split('?')[0];
        for (const ext of DANGEROUS_EXT) {
            if (lowerUrl.endsWith('.' + ext)) {
                hideAllCards();
                showError(`Security Safeguard Violation: Executable/Archive file (.${ext.toUpperCase()}) downloads are strictly blocked for malware prevention.`);
                showToast(`Security Shield: Blocked non-media .${ext.toUpperCase()} link for your safety!`, 'warning');
                return;
            }
        }

        currentTargetUrl = url;
        hideAllCards();
        showLoader(true);

        try {
            const res = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const data = await res.json();

            if (!res.ok || !data.success) {
                // If server is blocked or timed out, attempt automatic browser-assisted extraction
                if (data.suggestHtmlPaste || (data.error && (data.error.includes('timed out') || data.error.includes('blocking')))) {
                    console.log('[Auto Extractor] Server connection blocked. Trying automatic browser-side extraction...');
                    showToast('Bypassing site protection in browser...', 'info');

                    const clientHtml = await autoFetchHtmlClientSide(url);
                    if (clientHtml) {
                        try {
                            const htmlRes = await fetch('/api/extract-html', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ html: clientHtml, url })
                            });
                            const htmlData = await htmlRes.json();
                            if (htmlRes.ok && htmlData.success) {
                                showLoader(false);
                                renderVideoCard(htmlData);
                                showToast('Video extracted automatically via browser bypass!', 'success');
                                return;
                            }
                        } catch (htmlErr) {
                            console.warn('[Auto Extractor] Extract-html failed:', htmlErr);
                        }
                    }
                }

                showLoader(false);
                showError(data.error || 'Failed to extract video details.', data.suggestHtmlPaste, url);
                return;
            }

            showLoader(false);
            renderVideoCard(data);
            showToast('Video extracted successfully!', 'success');
        } catch (err) {
            showLoader(false);
            showError('Network error connecting to backend server.');
        }
    });

    // Automatic Browser Client HTML Extractor
    async function autoFetchHtmlClientSide(targetUrl) {
        // Method 1: Direct fetch from browser (if CORS headers permitted)
        try {
            const resp = await fetch(targetUrl, { credentials: 'omit' });
            if (resp.ok) {
                const text = await resp.text();
                if (text && text.length > 200) return text;
            }
        } catch (e) {}

        // Method 2: Allorigins public CORS proxy
        try {
            const resp = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
            if (resp.ok) {
                const text = await resp.text();
                if (text && text.length > 200) return text;
            }
        } catch (e) {}

        // Method 3: Corsproxy.io public CORS proxy
        try {
            const resp = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
            if (resp.ok) {
                const text = await resp.text();
                if (text && text.length > 200) return text;
            }
        } catch (e) {}

        // Method 4: Hidden iframe DOM reading fallback
        try {
            const iframeHtml = await new Promise((resolve) => {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                iframe.src = targetUrl;

                const timer = setTimeout(() => {
                    try { iframe.remove(); } catch(e) {}
                    resolve(null);
                }, 4000);

                iframe.onload = () => {
                    clearTimeout(timer);
                    try {
                        const doc = iframe.contentDocument || iframe.contentWindow.document;
                        const outer = doc ? doc.documentElement.outerHTML : null;
                        iframe.remove();
                        resolve(outer);
                    } catch (e) {
                        try { iframe.remove(); } catch(e) {}
                        resolve(null);
                    }
                };

                document.body.appendChild(iframe);
            });
            if (iframeHtml && iframeHtml.length > 200) return iframeHtml;
        } catch (e) {}

        return null;
    }

    // Render Extracted Video Data Card
    function renderVideoCard(data) {
        currentVideoData = data;
        videoCard.style.display = 'block';

        videoTitle.textContent = data.title;
        videoAuthor.textContent = data.uploader || 'Unknown';
        videoDuration.textContent = data.duration || 'Unknown';
        durationBadge.textContent = data.duration || '00:00';
        platformName.textContent = data.platform || 'Video';

        // Thumbnail fallback
        const defaultPoster = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=600&auto=format&fit=crop';
        videoThumbnail.onerror = () => {
            videoThumbnail.src = defaultPoster;
        };
        videoThumbnail.src = data.thumbnail || defaultPoster;

        // Render Format Options
        formatOptionsGrid.innerHTML = '';
        if (data.formats && data.formats.length > 0) {
            data.formats.forEach((fmt, index) => {
                const card = document.createElement('div');
                card.className = `format-option-card ${index === 0 ? 'active' : ''}`;
                card.innerHTML = `
                    <div class="format-quality">${fmt.quality}</div>
                    <div class="format-details">
                        <span>${fmt.size}</span>
                        <span class="format-tag">${fmt.ext.toUpperCase()}</span>
                    </div>
                `;

                card.addEventListener('click', () => {
                    document.querySelectorAll('.format-option-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    selectedFormat = fmt;
                    updateDownloadSublabel(fmt);
                });

                formatOptionsGrid.appendChild(card);
            });

            selectedFormat = data.formats[0];
            updateDownloadSublabel(selectedFormat);
        }

        // Reset inline player
        mediaContainer.style.display = 'block';
        playerWrapper.style.display = 'none';
        previewPlayer.pause();
    }

    function updateDownloadSublabel(fmt) {
        downloadFormatSublabel.textContent = `Quality: ${fmt.quality} | Format: ${fmt.ext.toUpperCase()} | Size: ${fmt.size}`;
    }

    // Play Inline Video Preview
    playPreviewBtn.addEventListener('click', () => {
        if (!currentVideoData) return;
        const targetUrl = selectedFormat ? selectedFormat.url : currentVideoData.direct_stream_url;
        
        if (targetUrl) {
            mediaContainer.style.display = 'none';
            playerWrapper.style.display = 'block';
            
            // Try proxy preview first
            previewPlayer.src = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
            previewPlayer.play().catch(err => {
                console.warn('Proxy preview failed, trying direct stream URL:', err);
                previewPlayer.src = targetUrl;
                previewPlayer.play().catch(e => {
                    showToast('Inline preview unavailable for this stream. Click Start Download to save the file.', 'info');
                });
            });
        } else {
            showToast('Preview stream not available for this link.', 'warning');
        }
    });

    previewPlayer.addEventListener('error', () => {
        const targetUrl = selectedFormat ? selectedFormat.url : (currentVideoData ? currentVideoData.direct_stream_url : null);
        if (targetUrl && !previewPlayer.src.includes(encodeURIComponent(targetUrl))) {
            // Fallback to direct stream URL if proxy throws error
            previewPlayer.src = targetUrl;
            previewPlayer.play().catch(() => {
                showToast('Preview stream unavailable. Click Start Download to save the video.', 'info');
                mediaContainer.style.display = 'block';
                playerWrapper.style.display = 'none';
            });
        } else {
            showToast('Preview stream unavailable. Click Start Download to save the video.', 'info');
            mediaContainer.style.display = 'block';
            playerWrapper.style.display = 'none';
        }
    });

    closePlayerBtn.addEventListener('click', () => {
        mediaContainer.style.display = 'block';
        playerWrapper.style.display = 'none';
        previewPlayer.pause();
    });

    // Start Download Trigger
    startDownloadBtn.addEventListener('click', async () => {
        if (!currentVideoData || !selectedFormat) return;

        const downloadUrl = selectedFormat.url || currentVideoData.direct_stream_url;
        const filename = currentVideoData.title;
        const ext = selectedFormat.ext || 'mp4';
        const isHLS = downloadUrl.includes('.m3u8');

        const triggerUrl = `/api/download?mediaUrl=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}&ext=${ext}`;

        // Add item to Download History
        addToHistory({
            id: Date.now(),
            title: currentVideoData.title,
            platform: currentVideoData.platform,
            thumbnail: currentVideoData.thumbnail,
            quality: selectedFormat.quality,
            ext: selectedFormat.ext,
            downloadUrl: triggerUrl,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });

        // Use startRealDownload for ALL media streams for 100% reliable file delivery and real progress
        startRealDownload(triggerUrl, `${filename}.${ext}`, currentVideoData.title, selectedFormat.quality);
    });

    // Direct Browser Download with Blob / Proxy Fallback
    async function tryDirectBlobDownload(directUrl, fileName, proxyUrl) {
        try {
            const resp = await fetch(directUrl, { credentials: 'omit' });
            if (resp.ok) {
                const blob = await resp.blob();
                if (blob && blob.size > 1000) {
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    showToast('Download complete! Saved to your computer.', 'success');
                    return;
                }
            }
        } catch (e) {
            console.log('[Direct Blob Download] Fetch blocked or CORS, using proxy triggerUrl:', e.message);
        }

        // Fallback to proxy triggerUrl via hidden iframe
        const a = document.createElement('a');
        a.href = proxyUrl;
        a.target = 'downloadIframe';
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Download initiated! Check your browser downloads.', 'success');
    }

    // Real download with fetch (for HLS streams — server processes fully before sending)
    async function startRealDownload(url, downloadName, title, quality) {
        progressCard.style.display = 'block';
        progressFileName.textContent = `${title} (${quality})`;
        progressPercent.textContent = '...';
        progressBarFill.style.width = '0%';
        progressSpeed.textContent = 'Processing...';
        progressSize.textContent = 'Server is converting HLS stream';
        progressEta.textContent = 'Please wait — this may take a moment';
        document.getElementById('progressStatusTag').textContent = 'Server is processing video segments...';

        startDownloadBtn.disabled = true;
        startDownloadBtn.style.opacity = '0.6';

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Download failed (HTTP ${response.status})`);
            }

            const contentLength = response.headers.get('Content-Length');
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
            const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

            document.getElementById('progressStatusTag').textContent = 'Downloading to browser...';
            progressEta.textContent = 'Downloading...';

            const reader = response.body.getReader();
            const chunks = [];
            let receivedBytes = 0;
            const startTime = Date.now();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedBytes += value.length;

                const receivedMB = (receivedBytes / 1024 / 1024).toFixed(2);
                const elapsed = (Date.now() - startTime) / 1000;
                const speedMBs = elapsed > 0 ? (receivedBytes / 1024 / 1024 / elapsed).toFixed(1) : '0';

                if (totalBytes > 0) {
                    const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
                    progressPercent.textContent = `${pct}%`;
                    progressBarFill.style.width = `${pct}%`;
                    progressSize.textContent = `${receivedMB} MB / ${totalMB} MB`;
                } else {
                    progressPercent.textContent = `${receivedMB} MB`;
                    progressBarFill.style.width = '60%';
                    progressSize.textContent = `${receivedMB} MB downloaded`;
                }
                progressSpeed.textContent = `${speedMBs} MB/s`;
            }

            // Complete — create blob and trigger save
            const blob = new Blob(chunks);
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = downloadName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);

            const finalMB = (receivedBytes / 1024 / 1024).toFixed(2);
            progressPercent.textContent = '100%';
            progressBarFill.style.width = '100%';
            progressSpeed.textContent = 'Complete';
            progressSize.textContent = `${finalMB} MB`;
            progressEta.textContent = 'Download Finished!';
            document.getElementById('progressStatusTag').textContent = `Saved! (${finalMB} MB)`;

            showToast(`Download complete! ${finalMB} MB saved.`, 'success');

            setTimeout(() => { progressCard.style.display = 'none'; }, 5000);
        } catch (err) {
            console.warn('[Download Engine] Server download error:', err.message);
            progressPercent.textContent = 'Bypassing...';
            progressBarFill.style.width = '100%';
            progressEta.textContent = 'Opening direct stream link in browser...';
            document.getElementById('progressStatusTag').textContent = 'Server blocked — using browser direct link';

            showToast('Server proxy blocked by site. Opening direct video stream in browser...', 'info');

            // Fallback: Open direct stream URL directly in browser tab so the user's browser session downloads it
            const mediaUrl = selectedFormat ? selectedFormat.url : (currentVideoData ? currentVideoData.direct_stream_url : null);
            if (mediaUrl) {
                setTimeout(() => {
                    const a = document.createElement('a');
                    a.href = mediaUrl;
                    a.target = '_blank';
                    a.download = downloadName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    progressCard.style.display = 'none';
                }, 1200);
            } else {
                setTimeout(() => { progressCard.style.display = 'none'; }, 4000);
            }
        } finally {
            startDownloadBtn.disabled = false;
            startDownloadBtn.style.opacity = '1';
        }
    }

    // Simulated Progress Bar
    function startSimulatedProgress(title, quality) {
        progressCard.style.display = 'block';
        progressFileName.textContent = `${title} (${quality})`;
        progressPercent.textContent = '0%';
        progressBarFill.style.width = '0%';

        let progress = 0;
        const interval = setInterval(() => {
            progress += Math.floor(Math.random() * 15) + 8;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                progressPercent.textContent = '100%';
                progressBarFill.style.width = '100%';
                progressEta.textContent = 'Download Finished!';
                progressSpeed.textContent = 'Complete';
                setTimeout(() => {
                    progressCard.style.display = 'none';
                }, 4000);
            } else {
                progressPercent.textContent = `${progress}%`;
                progressBarFill.style.width = `${progress}%`;
                progressSpeed.textContent = `${(Math.random() * 4 + 3).toFixed(1)} MB/s`;
                progressSize.textContent = `${Math.round(progress * 0.35)} MB / 35 MB`;
                progressEta.textContent = `Downloading... ${Math.round((100 - progress) / 20)}s remaining`;
            }
        }, 300);
    }

    // Download History Management
    function addToHistory(item) {
        downloadHistory.unshift(item);
        if (downloadHistory.length > 10) downloadHistory.pop(); // Keep last 10
        localStorage.setItem('savesave_history', JSON.stringify(downloadHistory));
        renderHistory();
    }

    function renderHistory() {
        if (!downloadHistory || downloadHistory.length === 0) {
            emptyHistory.style.display = 'block';
            historyList.querySelectorAll('.history-item').forEach(el => el.remove());
            return;
        }

        emptyHistory.style.display = 'none';
        historyList.querySelectorAll('.history-item').forEach(el => el.remove());

        downloadHistory.forEach(item => {
            const el = document.createElement('div');
            el.className = 'history-item';
            const thumbSrc = item.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=200&auto=format&fit=crop';
            
            el.innerHTML = `
                <img class="history-thumb" src="${thumbSrc}" alt="thumb">
                <div class="history-info">
                    <div class="history-title">${item.title}</div>
                    <div class="history-meta">
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon-sm"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> ${item.platform}</span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon-sm"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg> ${item.quality}</span>
                        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon-sm"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${item.timestamp}</span>
                    </div>
                </div>
                <div class="history-actions">
                    <button class="btn-history-action btn-redownload" title="Re-download">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="svg-icon-sm"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                    <button class="btn-history-action btn-delete" title="Remove from list">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="svg-icon-sm"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `;

            el.querySelector('.btn-redownload').addEventListener('click', () => {
                window.location.href = item.downloadUrl;
                showToast('Re-downloading video...', 'info');
            });

            el.querySelector('.btn-delete').addEventListener('click', () => {
                downloadHistory = downloadHistory.filter(h => h.id !== item.id);
                localStorage.setItem('savesave_history', JSON.stringify(downloadHistory));
                renderHistory();
                showToast('Removed from history', 'info');
            });

            historyList.appendChild(el);
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        downloadHistory = [];
        localStorage.removeItem('savesave_history');
        localStorage.removeItem('streamdrop_history');
        renderHistory();
        showToast('History cleared', 'info');
    });

    // Server Health Check
    async function checkServerHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            if (data.status === 'online') {
                serverStatusPill.classList.add('online');
                serverStatusText.textContent = 'Engine Online (yt-dlp)';
            }
        } catch (e) {
            serverStatusText.textContent = 'Server Offline';
        }
    }

    // Helper UI functions
    function showLoader(show) {
        loaderCard.style.display = show ? 'block' : 'none';
        if (show) {
            fetchBtn.querySelector('.btn-text').style.display = 'none';
            fetchBtn.querySelector('.spinner').style.display = 'inline-block';
            fetchBtn.disabled = true;
        } else {
            fetchBtn.querySelector('.btn-text').style.display = 'inline-block';
            fetchBtn.querySelector('.spinner').style.display = 'none';
            fetchBtn.disabled = false;
        }
    }

    function showError(msg, suggestHtmlPaste = false, url = '') {
        errorCard.style.display = 'flex';
        errorMessage.textContent = msg;
        if (suggestHtmlPaste || msg.includes('timed out') || msg.includes('blocking')) {
            htmlPasteHelper.style.display = 'block';
            if (url) currentTargetUrl = url;
        } else {
            htmlPasteHelper.style.display = 'none';
        }
    }

    function hideAllCards() {
        loaderCard.style.display = 'none';
        errorCard.style.display = 'none';
        videoCard.style.display = 'none';
    }

    function showToast(msg, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        if (type === 'success') {
            iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        } else if (type === 'warning') {
            iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="svg-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        }

        toast.innerHTML = `${iconSvg} <span>${msg}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(12px)';
            setTimeout(() => toast.remove(), 250);
        }, 3200);
    }
});
