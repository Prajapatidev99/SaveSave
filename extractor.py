import sys
import json
import os
import re
import urllib.request
import urllib.error

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

# ============================================================
# Custom extractor for direct player streams (unsupported by yt-dlp)
# ============================================================
CUSTOM_STREAM_PATTERNS = [
    re.compile(r'https?://(?:www\.)?([^/]+)/v/(\w+)', re.IGNORECASE),
    re.compile(r'https?://(?:www\.)?([^/]+)/e/(\w+)', re.IGNORECASE),
]

def try_custom_stream_extract(url):
    """
    Attempt to extract video info from custom player architectures.
    Returns a result dict on success, or None if the URL doesn't match or stream not found.
    """
    domain = None
    filecode = None
    for pattern in CUSTOM_STREAM_PATTERNS:
        m = pattern.match(url)
        if m:
            domain = m.group(1)
            filecode = m.group(2)
            break

    if not filecode or not domain:
        return None

    # Step 1: Fetch the main page to get the title & thumbnail
    title = filecode
    thumbnail = ""
    embed_domain = domain
    try:
        page_url = f"https://{domain}/v/{filecode}"
        req = urllib.request.Request(page_url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            page_html = resp.read().decode('utf-8', errors='replace')
            # Extract title from <title>Watch XXXX</title>
            title_match = re.search(r'<title>\s*(?:Watch\s+)?(.+?)\s*</title>', page_html, re.IGNORECASE)
            if title_match:
                title = title_match.group(1).strip()
            # Extract og:image thumbnail
            og_match = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\'](.*?)["\']', page_html, re.IGNORECASE)
            if og_match:
                thumbnail = og_match.group(1)
            # Also find embed domain from iframe if present
            iframe_match = re.search(r'<iframe\s+src=["\'](https?://([^/]+)/e/\w+)["\']', page_html, re.IGNORECASE)
            if iframe_match:
                embed_domain = iframe_match.group(2)
    except Exception:
        embed_domain = domain

    # Step 2: Call the embed player's /api/stream to get the real streaming URL
    stream_url = None
    stream_title = title
    stream_thumb = thumbnail
    try:
        api_url = f"https://{embed_domain}/api/stream"
        post_data = json.dumps({"filecode": filecode, "device": "web"}).encode('utf-8')
        req = urllib.request.Request(api_url, data=post_data, headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': f'https://{embed_domain}/e/{filecode}',
            'Origin': f'https://{embed_domain}',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            api_data = json.loads(resp.read().decode('utf-8', errors='replace'))
            stream_url = api_data.get('streaming_url') or api_data.get('url')
            if api_data.get('title'):
                stream_title = api_data['title']
            if api_data.get('thumbnail'):
                stream_thumb = api_data['thumbnail']
    except Exception:
        return None

    if not stream_url:
        return None

    # Determine extension from stream URL
    ext = "mp4"
    if '.m3u8' in stream_url:
        ext = "mp4"
    elif '.webm' in stream_url:
        ext = "webm"

    formats = [{
        "format_id": "stream_best",
        "quality": "Best Quality (MP4)",
        "height": 720,
        "type": "video",
        "ext": ext,
        "size": "Streaming",
        "url": stream_url,
        "note": "Full Video Stream"
    }]

    return {
        "success": True,
        "title": stream_title,
        "thumbnail": stream_thumb,
        "duration": "Stream",
        "duration_seconds": None,
        "uploader": "Web Video",
        "platform": "Web Video",
        "webpage_url": url,
        "formats": formats,
        "direct_stream_url": stream_url
    }


def get_platform_name(extractor):
    if not extractor:
        return "Direct Link"
    ext_lower = extractor.lower()
    if 'youtube' in ext_lower:
        return 'YouTube'
    elif 'tiktok' in ext_lower:
        return 'TikTok'
    elif 'twitter' in ext_lower or 'x' in ext_lower:
        return 'Twitter / X'
    elif 'instagram' in ext_lower:
        return 'Instagram'
    elif 'facebook' in ext_lower:
        return 'Facebook'
    elif 'vimeo' in ext_lower:
        return 'Vimeo'
    elif 'dailymotion' in ext_lower:
        return 'Dailymotion'
    elif 'twitch' in ext_lower:
        return 'Twitch'
    elif 'reddit' in ext_lower:
        return 'Reddit'
    else:
        return "Web Video"

def format_duration(seconds):
    if not seconds:
        return "Unknown"
    try:
        s = int(seconds)
        mins, secs = divmod(s, 60)
        hrs, mins = divmod(mins, 60)
        if hrs > 0:
            return f"{hrs}:{mins:02d}:{secs:02d}"
        else:
            return f"{mins}:{secs:02d}"
    except Exception:
        return "Unknown"

def format_bytes(bytes_val):
    if not bytes_val:
        return "Unknown size"
    try:
        b = float(bytes_val)
        kb = b / 1024.0
        if kb < 1024:
            return f"{kb:.1f} KB"
        mb = kb / 1024.0
        if mb < 1024:
            return f"{mb:.1f} MB"
        gb = mb / 1024.0
        return f"{gb:.2f} GB"
    except Exception:
        return "Unknown size"

def extract_info(url):
    # ── Custom stream extractors (unsupported by yt-dlp) ──
    custom_result = try_custom_stream_extract(url)
    if custom_result is not None:
        return json.dumps(custom_result)

    # ── yt-dlp path for all other URLs ──
    if not yt_dlp:
        return json.dumps({"error": "yt-dlp is not installed on server"})

    clients_to_try = [
        ['ios'],
        ['tv_embedded'],
        ['mweb'],
        ['android_creator'],
        ['web', 'mweb']
    ]

    last_error = None
    info = None

    for client in clients_to_try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'check_formats': False,
            'socket_timeout': 15,
            'noplaylist': True,
            'extractor_args': {
                'youtube': {
                    'player_client': client,
                    'player_skip': ['webpage', 'configs', 'js']
                }
            },
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if info:
                    break
        except Exception as e:
            last_error = e
            continue

    if not info:
        return json.dumps({"success": False, "error": str(last_error) if last_error else "Extraction failed"})

    try:
        # If playlist/multi-video, pick first entry
        if 'entries' in info and info['entries']:
            entry = info['entries'][0]
            if entry:
                info = entry

            title = info.get('title') or "Video Download"
            
            # Select best thumbnail reliably across extractions
            thumbnails = info.get('thumbnails') or []
            if thumbnails:
                best_thumb = max(thumbnails, key=lambda t: (t.get('preference') or 0, t.get('height') or 0, t.get('width') or 0))
                thumbnail = best_thumb.get('url') or info.get('thumbnail') or ""
            else:
                thumbnail = info.get('thumbnail') or ""

            duration_raw = info.get('duration')
            uploader = info.get('uploader') or info.get('channel') or info.get('uploader_id') or "Unknown Creator"
            extractor = info.get('extractor') or info.get('extractor_key') or "video"
            platform = get_platform_name(extractor)

            # Filter formats
            formats_raw = info.get('formats') or []
            processed_formats = []

            # We want clean downloadable video/audio formats
            # Check for best combined format or video formats with heights
            seen_resolutions = set()

            # Pre-add MP3 / Audio Option
            audio_formats = [f for f in formats_raw if f.get('acodec') != 'none' and f.get('vcodec') == 'none']
            best_audio = max(audio_formats, key=lambda f: f.get('tbr') or f.get('filesize') or 0) if audio_formats else None
            
            # Sort formats by height descending
            video_formats = [f for f in formats_raw if f.get('height') or f.get('resolution')]
            video_formats.sort(key=lambda f: (f.get('height') or 0, f.get('tbr') or 0), reverse=True)

            for fmt in video_formats:
                height = fmt.get('height')
                if not height:
                    continue
                res_label = f"{height}p"
                if res_label not in seen_resolutions and height in [1080, 720, 480, 360, 240, 144, 2160, 1440]:
                    seen_resolutions.add(res_label)
                    size_str = format_bytes(fmt.get('filesize') or fmt.get('filesize_approx'))
                    ext = fmt.get('ext') or 'mp4'
                    format_id = fmt.get('format_id')
                    
                    processed_formats.append({
                        "format_id": format_id,
                        "quality": res_label,
                        "height": height,
                        "type": "video",
                        "ext": ext,
                        "size": size_str,
                        "url": fmt.get('url'),
                        "note": fmt.get('format_note') or res_label
                    })

            # If no specific heights found, fallback to best format
            if not processed_formats:
                best_fmt = info.get('url') or (formats_raw[-1].get('url') if formats_raw else url)
                processed_formats.append({
                    "format_id": "best",
                    "quality": "Best Quality (MP4)",
                    "height": 720,
                    "type": "video",
                    "ext": "mp4",
                    "size": format_bytes(info.get('filesize_approx')),
                    "url": best_fmt,
                    "note": "Standard High Quality"
                })

            # Add Audio Only format
            processed_formats.append({
                "format_id": "audio_mp3",
                "quality": "Audio Only (MP3)",
                "height": 0,
                "type": "audio",
                "ext": "mp3",
                "size": format_bytes(best_audio.get('filesize') if best_audio else None),
                "url": best_audio.get('url') if best_audio else None,
                "note": "Extracted High Quality Audio"
            })

            result = {
                "success": True,
                "title": title,
                "thumbnail": thumbnail,
                "duration": format_duration(duration_raw),
                "duration_seconds": duration_raw,
                "uploader": uploader,
                "platform": platform,
                "webpage_url": info.get('webpage_url') or url,
                "formats": processed_formats,
                "direct_stream_url": info.get('url') or (formats_raw[-1].get('url') if formats_raw else None)
            }
            return json.dumps(result)
            
    except Exception as e:
        # Fallback for direct MP4/WebM files
        if url.lower().endswith(('.mp4', '.webm', '.m3u8', '.mov', '.avi')):
            file_name = url.split('/')[-1].split('?')[0] or "Downloaded Video.mp4"
            return json.dumps({
                "success": True,
                "title": file_name,
                "thumbnail": "",
                "duration": "Direct Stream",
                "uploader": "Direct Link",
                "platform": "Direct File",
                "webpage_url": url,
                "formats": [{
                    "format_id": "direct",
                    "quality": "Direct Video (MP4)",
                    "height": 720,
                    "type": "video",
                    "ext": "mp4",
                    "size": "Direct Download",
                    "url": url,
                    "note": "Direct Media Link"
                }],
                "direct_stream_url": url
            })

        return json.dumps({
            "success": False,
            "error": str(e)
        })

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Invalid usage"}))
        sys.exit(1)
        
    cmd = sys.argv[1]
    target_url = sys.argv[2]
    
    if cmd == "info":
        res = extract_info(target_url)
        print(res)
    else:
        print(json.dumps({"error": "Unknown command"}))
