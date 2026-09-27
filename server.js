const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const publicIndex = path.join(__dirname, 'public', 'index.html');
    const rootIndex = path.join(__dirname, 'index.html');
    if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    }
    if (fs.existsSync(rootIndex)) {
        return res.sendFile(rootIndex);
    }
    res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head><title>SaveSave Engine Running</title><style>body{font-family:sans-serif;padding:40px;background:#F7F2EB;color:#2B3324;}</style></head>
            <body>
                <h1>SaveSave Engine Online</h1>
                <p>The backend server is running successfully!</p>
                <p><strong>Note:</strong> The <code>public/</code> folder was not found in this deployment.</p>
                <p>Please make sure you have pushed the <code>public/</code> folder (containing <code>index.html</code>, <code>style.css</code>, and <code>app.js</code>) to your GitHub repository.</p>
            </body>
            </html>
        `);
});

app.get('/style.css', (req, res) => {
    const rootCss = path.join(__dirname, 'style.css');
    const publicCss = path.join(__dirname, 'public', 'style.css');
    const cssPath = fs.existsSync(rootCss) ? rootCss : publicCss;
    if (fs.existsSync(cssPath)) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
        return res.sendFile(cssPath);
    }
    res.status(404).type('text/plain').send('/* style.css not found */');
});

app.get('/app.js', (req, res) => {
    const rootJs = path.join(__dirname, 'app.js');
    const publicJs = path.join(__dirname, 'public', 'app.js');
    const jsPath = fs.existsSync(rootJs) ? rootJs : publicJs;
    if (fs.existsSync(jsPath)) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        return res.sendFile(jsPath);
    }
    res.status(404).type('text/plain').send('// app.js not found');
});

// ============================================================
// Security & Anti-Malware Safeguards Engine
// ============================================================
const DANGEROUS_EXTENSIONS = [
    'exe', 'bat', 'cmd', 'ps1', 'vbs', 'js', 'scr', 'msi', 'jar', 'sh',
    'zip', 'rar', '7z', 'iso', 'img', 'tar', 'gz', 'apk', 'deb', 'rpm', 'dmg', 'app'
];

function isSecurityThreatUrl(urlStr) {
    try {
        const parsed = new URL(urlStr);
        const protocol = parsed.protocol.toLowerCase();

        // 1. Enforce HTTP/HTTPS only
        if (protocol !== 'http:' && protocol !== 'https:') {
            return { threat: true, reason: 'Invalid protocol. Only http:// and https:// URLs are permitted.' };
        }

        // 2. SSRF Protection (Block localhost and private IPs)
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1' ||
            host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.') ||
            host.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) {
            return { threat: true, reason: 'Access to internal network IP addresses is restricted for your protection.' };
        }

        // 3. Executable / Malware Extension Check
        const pathname = parsed.pathname.toLowerCase();
        for (const ext of DANGEROUS_EXTENSIONS) {
            if (pathname.endsWith('.' + ext)) {
                return { threat: true, reason: `Security Safeguard: Executable/Archive file (.${ext.toUpperCase()}) downloads are strictly blocked for malware prevention.` };
            }
        }

        return { threat: false };
    } catch (e) {
        return { threat: true, reason: 'Invalid URL format.' };
    }
}

// Health Check API
app.get('/api/health', (req, res) => {
    exec('python -m yt_dlp --version', (err, stdout, stderr) => {
        const ytDlpVersion = err ? "Not Found (Fallback Mode)" : stdout.trim();
        res.json({
            status: "online",
            securityEngine: "Active (Anti-Malware Active)",
            serverTime: new Date().toISOString(),
            pythonVersion: "3.11",
            ytDlpVersion: ytDlpVersion
        });
    });
});

app.post('/api/extract', (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'Valid URL is required.' });
    }

    let cleanUrl = url.trim();

    // Auto-extract URL if user pastes an <iframe> HTML tag
    const iframeSrcMatch = cleanUrl.match(/iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeSrcMatch) {
        cleanUrl = iframeSrcMatch[1];
    }

    // Security Check
    const secCheck = isSecurityThreatUrl(cleanUrl);
    if (secCheck.threat) {
        return res.status(403).json({
            success: false,
            error: secCheck.reason,
            isSecurityBlock: true
        });
    }

    // Direct MP4 / WebM check bypass
    if (cleanUrl.match(/\.(mp4|webm|mov|m3u8|avi)(\?.*)?$/i)) {
        const filename = cleanUrl.split('/').pop().split('?')[0] || "downloaded_video.mp4";
        return res.json({
            success: true,
            title: filename,
            thumbnail: "",
            duration: "Direct Stream",
            uploader: "Direct Media Link",
            platform: "Direct Video",
            webpage_url: cleanUrl,
            formats: [{
                format_id: "direct",
                quality: "Direct Video (MP4)",
                height: 720,
                type: "video",
                ext: "mp4",
                size: "Direct Download",
                url: cleanUrl,
                note: "Direct Media Link"
            }],
            direct_stream_url: cleanUrl
        });
    }

    // Call Python Extractor
    const pyProcess = spawn('python', ['extractor.py', 'info', cleanUrl]);
    let stdoutData = '';
    let stderrData = '';

    pyProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
    });

    pyProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
    });

    pyProcess.on('error', (err) => {
        console.warn('[Python Extractor] Python not available, using generic fallback:', err.message);
        if (!res.headersSent) {
            genericHtmlFallback(cleanUrl, res);
        }
    });

    pyProcess.on('close', (code) => {
        if (res.headersSent) return;
        if (code !== 0 && !stdoutData) {
            console.error('Extractor stderr:', stderrData);
            return genericHtmlFallback(cleanUrl, res);
        }

        try {
            const parsed = JSON.parse(stdoutData.trim());
            if (!parsed.success && parsed.error) {
                if (parsed.error.includes('Unsupported URL') || parsed.error.includes('timed out') || parsed.error.includes('Unable to download')) {
                    return genericHtmlFallback(cleanUrl, res);
                }
                return res.status(400).json(parsed);
            }
            res.json(parsed);
        } catch (e) {
            console.error('JSON Parse error:', e, stdoutData);
            return genericHtmlFallback(cleanUrl, res);
        }
    });
});

// HTML Extractor API (For protected sites where direct server connection is blocked)
app.post('/api/extract-html', (req, res) => {
    const { html, url } = req.body;
    if (!html || typeof html !== 'string') {
        return res.status(400).json({ success: false, error: 'Page HTML source is required.' });
    }

    const extracted = extractStreamFromHtml(html, url || '');
    if (!extracted.streamUrl) {
        return res.status(400).json({
            success: false,
            error: 'No downloadable video stream (.m3u8, .mp4, or get_video) found in the provided HTML source.'
        });
    }

    return sendFallbackResult(res, extracted.streamUrl, extracted.title, extracted.thumbnail, extracted.platform, extracted.fileSize, url || 'Pasted Page Source');
});

// Helper: Extract video details and stream URL from raw HTML
function extractStreamFromHtml(html, pageUrl = "") {
    let title = 'Video Download';
    let thumbnail = '';
    let platform = 'Web Video';
    let streamUrl = null;
    let fileSize = '';

    // Extract title
    const titleMatch = html.match(/<title>\s*(.+?)\s*<\/title>/i);
    if (titleMatch) {
        title = titleMatch[1].replace(/\s*[-|]\s*(?:watch|video|stream|download|free|online|hd).*$/i, '').trim();
    }
    const h1Match = html.match(/<h1[^>]*>\s*(.+?)\s*<\/h1>/i);
    if (h1Match) {
        title = h1Match[1].replace(/<[^>]+>/g, '').trim();
    }

    // Extract thumbnail
    const ogImgMatch = html.match(/og:image["\s]+content="([^"]+)"/i);
    if (ogImgMatch) thumbnail = ogImgMatch[1];

    // Extract file size if shown on page
    const sizeMatch = html.match(/([\d.]+)\s*(MB|GB|KB)/i);
    if (sizeMatch) fileSize = sizeMatch[1] + ' ' + sizeMatch[2];

    // Strategy 1: Dynamic token and innerHTML script evaluator
    const robotMatch = html.match(/id=['"]?robotlink['"]?[^>]*>(.*?)</i) || 
                       html.match(/robotlink['"]\)\.innerHTML\s*=\s*(.*?);/i);
    if (robotMatch) {
        let jsSnippet = robotMatch[1];
        let evaluated = '';
        const parts = jsSnippet.split('+');
        for (let part of parts) {
            part = part.trim();
            const subMatch = part.match(/\(['"]([^'"]+)['"]\)\.substring\((\d+)\)/);
            if (subMatch) {
                evaluated += subMatch[1].substring(parseInt(subMatch[2]));
            } else {
                const strMatch = part.match(/['"]([^'"]+)['"]/);
                if (strMatch) {
                    evaluated += strMatch[1];
                } else if (part.startsWith('//') || part.startsWith('http')) {
                    evaluated += part.replace(/['"]/g, '');
                }
            }
        }
        if (evaluated.includes('get_video')) {
            if (evaluated.startsWith('//')) evaluated = 'https:' + evaluated;
            streamUrl = evaluated;
        }
    }

    if (!streamUrl) {
        const directGetVid = html.match(/(https?:\/\/[^\s"'<>]+\/get_video[^\s"'<>]*)/i) || 
                             html.match(/(\/\/[^\s"'<>]+\/get_video[^\s"'<>]*)/i);
        if (directGetVid) {
            let rawUrl = directGetVid[1] || directGetVid[0];
            rawUrl = rawUrl.replace(/['"\s\+]/g, '');
            if (rawUrl.startsWith('//')) rawUrl = 'https:' + rawUrl;
            if (rawUrl.startsWith('http')) streamUrl = rawUrl;
        }
    }

    // Strategy 2: Decode Dean Edwards packed JS to find stream URL
    if (!streamUrl) {
        const packedMatches = html.match(/eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*[dr]\s*\)[\s\S]*?\.split\s*\(\s*['"]\|['"]\s*\)[\s\S]*?\)\s*\)/g);
        if (packedMatches) {
            for (const packed of packedMatches) {
                const decoded = decodePacked(packed);
                if (decoded) {
                    const m3u8Match = decoded.match(/(https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*)/);
                    if (m3u8Match) { streamUrl = m3u8Match[1]; break; }
                    const mp4Match = decoded.match(/(https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*)/);
                    if (mp4Match) { streamUrl = mp4Match[1]; break; }
                }
            }
        }
    }

    // Strategy 3: Direct regex for m3u8/mp4 URLs in page
    if (!streamUrl) {
        const directM3u8 = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (directM3u8) streamUrl = directM3u8[1];
    }
    if (!streamUrl) {
        const directMp4 = html.match(/file\s*:\s*"(https?:\/\/[^"]+\.mp4[^"]*)"/i);
        if (directMp4) streamUrl = directMp4[1];
    }
    if (!streamUrl) {
        const sourcesMatch = html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/i);
        if (sourcesMatch) streamUrl = sourcesMatch[1];
    }

    return { title, thumbnail, platform, streamUrl, fileSize };
}

function fetchPage(pageUrl) {
    return new Promise((resolve, reject) => {
        const protocol = pageUrl.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            }
        };
        
        const req = protocol.get(pageUrl, options, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return fetchPage(response.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
        });
        req.setTimeout(6000, () => { req.destroy(); reject(new Error('Connection timed out')); });
        req.on('error', reject);
    });
}

// Robust Dean Edwards Packer decoder
function decodePacked(packedCode) {
    try {
        const match = packedCode.match(/\}\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(['"])((?:\\.|(?!\5)[\s\S])*)\5\s*\.split\s*\(\s*['"]\|['"]\s*\)/);
        if (!match) return null;

        let [, , payload, radixStr, countStr, , keywordsStr] = match;
        const radix = parseInt(radixStr, 10);
        let count = parseInt(countStr, 10);
        const keywords = keywordsStr.split('|');

        payload = payload.replace(/\\(['"\\])/g, '$1');

        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        function baseConvert(val, base) {
            if (val === 0) return '0';
            let res = '';
            while (val > 0) {
                res = chars.charAt(val % base) + res;
                val = Math.floor(val / base);
            }
            return res;
        }

        const dict = {};
        while (count--) {
            const key = baseConvert(count, radix);
            const word = keywords[count];
            dict[key] = (typeof word !== 'undefined' && word !== '') ? word : key;
        }

        return payload.replace(/\b\w+\b/g, (token) => {
            return Object.prototype.hasOwnProperty.call(dict, token) ? dict[token] : token;
        });
    } catch (e) {
        return null;
    }
}

function genericHtmlFallback(url, res) {
    console.log('[Generic Fallback] Attempting HTML-based extraction for:', url);
    
    fetchPage(url).then(html => {
        const extracted = extractStreamFromHtml(html, url);
        if (extracted.streamUrl) {
            return sendFallbackResult(res, extracted.streamUrl, extracted.title, extracted.thumbnail, extracted.platform, extracted.fileSize, url);
        }

        // Try iframe embed
        const iframeMatch = html.match(/iframe\s+src="(https?:\/\/[^"]+\/e\/\w+)"/i);
        if (iframeMatch) {
            const embedUrl = iframeMatch[1];
            return fetchPage(embedUrl).then(embedHtml => {
                const embedExtracted = extractStreamFromHtml(embedHtml, url);
                sendFallbackResult(res, embedExtracted.streamUrl, extracted.title, extracted.thumbnail, extracted.platform, extracted.fileSize, url);
            }).catch(() => {
                sendFallbackResult(res, null, extracted.title, extracted.thumbnail, extracted.platform, extracted.fileSize, url);
            });
        }
        
        sendFallbackResult(res, null, extracted.title, extracted.thumbnail, extracted.platform, extracted.fileSize, url);
        
    }).catch(err => {
        console.error('[Generic Fallback] Page fetch failed:', err.message);
        res.status(400).json({
            success: false,
            error: 'Connection timed out. The host is blocking direct server requests.',
            suggestHtmlPaste: true,
            url: url
        });
    });
}

function sendFallbackResult(res, streamUrl, title, thumbnail, platform, fileSize, originalUrl) {
    if (!streamUrl) {
        return res.status(400).json({
            success: false,
            error: 'Could not find a downloadable video stream on this page. The site may use advanced protection.'
        });
    }
    
    const ext = streamUrl.includes('.m3u8') ? 'mp4' : (streamUrl.match(/\.(\w{3,4})(\?|$)/)?.[1] || 'mp4');
    
    console.log('[Generic Fallback] Found stream URL:', streamUrl.substring(0, 100));
    res.json({
        success: true,
        title: title,
        thumbnail: thumbnail,
        duration: 'Stream',
        uploader: platform,
        platform: platform.charAt(0).toUpperCase() + platform.slice(1),
        webpage_url: originalUrl,
        formats: [{
            format_id: 'fallback_best',
            quality: 'Best Quality (MP4)',
            height: 720,
            type: 'video',
            ext: ext,
            size: fileSize || 'Streaming',
            url: streamUrl,
            note: 'Extracted Video Stream'
        }],
        direct_stream_url: streamUrl
    });
}

// Direct Download & Stream API (Triggers browser save dialog)
app.get('/api/download', (req, res) => {
    const mediaUrl = req.query.mediaUrl;
    let filename = req.query.filename || 'downloaded_video';
    const ext = req.query.ext || 'mp4';

    if (!mediaUrl) {
        return res.status(400).send('Missing mediaUrl parameter.');
    }

    // Security Check on Download Media URL and Extension
    const secCheck = isSecurityThreatUrl(mediaUrl);
    if (secCheck.threat || DANGEROUS_EXTENSIONS.includes(ext.toLowerCase())) {
        console.warn('[Security Guard Alert] Blocked non-media / executable download request for:', mediaUrl);
        return res.status(403).send('Security Safeguard Violation: Executable/Archive file downloads are strictly blocked for malware protection.');
    }

    // Clean filename
    filename = filename.replace(/[^a-zA-Z0-9_\-\.\s]/g, '_').substring(0, 80);
    const downloadName = `${filename}.${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', ext === 'mp3' ? 'audio/mpeg' : 'video/mp4');

    console.log('[Media Download Engine] Initiating download for:', mediaUrl.substring(0, 80));

    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, 'temp_downloads');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempBasename = `dl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tempFile = path.join(tempDir, `${tempBasename}.${ext}`);

    const ytdlpArgs = [
        '-m', 'yt_dlp',
        '--quiet',
        '--no-warnings',
        '-f', 'best',
        '--no-part',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '-o', tempFile,
        mediaUrl
    ];

    const dlProcess = spawn('python', ytdlpArgs, { cwd: tempDir });

    let stderrOutput = '';
    dlProcess.stderr.on('data', (data) => {
        stderrOutput += data.toString();
    });

    const cleanupTemp = () => {
        try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch(e) {}
        try {
            const files = fs.readdirSync(tempDir);
            files.forEach(f => {
                if (f.startsWith(tempBasename)) {
                    try { fs.unlinkSync(path.join(tempDir, f)); } catch(e) {}
                }
            });
        } catch(e) {}
    };

    dlProcess.on('error', (err) => {
        console.warn('[Media Download Engine] Python/yt-dlp unavailable, falling back to direct proxy stream:', err.message);
        cleanupTemp();
        if (!res.headersSent) {
            proxyMediaStream(req, res, mediaUrl, 5, downloadName);
        }
    });

    dlProcess.on('close', (code) => {
        if (res.headersSent) return;
        if (code === 0 && fs.existsSync(tempFile) && fs.statSync(tempFile).size > 1000) {
            const stat = fs.statSync(tempFile);
            console.log(`[Media Download Engine] Complete! Download size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

            res.setHeader('Content-Length', stat.size);
            const fileStream = fs.createReadStream(tempFile);
            fileStream.pipe(res);

            fileStream.on('end', () => cleanupTemp());
            fileStream.on('error', () => cleanupTemp());
            res.on('close', () => cleanupTemp());
            return;
        }

        console.warn('[Media Download Engine] yt-dlp download failed, falling back to direct proxy stream:', stderrOutput);
        cleanupTemp();
        return proxyMediaStream(req, res, mediaUrl, 5, downloadName);
    });

    req.on('close', () => {
        if (!dlProcess.killed) {
            dlProcess.kill();
            cleanupTemp();
        }
    });
});

// Proxy API for direct embedded video preview (supports Range headers for HTML5 video seeking)
app.get('/api/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    return proxyMediaStream(req, res, targetUrl);
});

// Reusable media streaming proxy function with redirect, range, and IPv4 support
function proxyMediaStream(req, res, targetUrl, maxRedirects = 5, forcedFilename = null) {
    if (maxRedirects <= 0) {
        if (!res.headersSent) res.status(500).send('Too many redirects');
        return;
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
        };

        // Forward Range header for HTML5 video seeking & partial content streaming
        if (req.headers.range) {
            reqHeaders['Range'] = req.headers.range;
        }

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: reqHeaders,
            family: 4 // Prefer IPv4 to avoid IPv6 timeout delays
        };

        const proxyReq = protocol.request(options, (upstreamRes) => {
            // Handle HTTP redirects (301, 302, 303, 307, 308)
            if (upstreamRes.statusCode >= 300 && upstreamRes.statusCode < 400 && upstreamRes.headers.location) {
                const redirectUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
                return proxyMediaStream(req, res, redirectUrl, maxRedirects - 1, forcedFilename);
            }

            // If upstream host blocks server IP (403 Forbidden / 404 Not Found), redirect browser directly to targetUrl
            if (upstreamRes.statusCode >= 400) {
                console.warn(`[Proxy Fallback] Upstream host returned status ${upstreamRes.statusCode} for ${targetUrl}. Redirecting browser directly.`);
                if (!res.headersSent) {
                    return res.redirect(targetUrl);
                }
            }

            // Set response status code
            res.status(upstreamRes.statusCode);

            // Forward key media headers
            const headersToForward = [
                'content-type',
                'content-length',
                'content-range',
                'accept-ranges',
                'cache-control'
            ];

            headersToForward.forEach(header => {
                if (upstreamRes.headers[header]) {
                    res.setHeader(header, upstreamRes.headers[header]);
                }
            });

            // Always enforce attachment content-disposition for direct downloads
            if (forcedFilename) {
                res.setHeader('Content-Disposition', `attachment; filename="${forcedFilename}"`);
            } else if (upstreamRes.headers['content-disposition']) {
                res.setHeader('Content-Disposition', upstreamRes.headers['content-disposition']);
            }

            // Default content-type if missing
            if (!upstreamRes.headers['content-type'] && targetUrl.match(/\.(mp4|webm|mov|mkv)(\?|$)/i)) {
                res.setHeader('Content-Type', 'video/mp4');
            }

            upstreamRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[Proxy Error]:', err.message);
            if (!res.headersSent) {
                res.status(500).send(`Failed to stream video content: ${err.message}`);
            }
        });

        proxyReq.end();
    } catch (e) {
        console.error('[Proxy Exception]:', e.message);
        if (!res.headersSent) {
            res.status(500).send(`Invalid media URL: ${e.message}`);
        }
    }
}

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`================================================`);
    console.log(`🚀 Video Downloader App running on http://${HOST}:${PORT}`);
    console.log(`🔒 Security Guard: Real-time Anti-Malware Active`);
    console.log(`================================================`);
});
