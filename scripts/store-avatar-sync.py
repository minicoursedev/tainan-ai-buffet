#!/usr/bin/env python3
"""Prepare official store avatars, then apply JSON only after public image verification."""
import argparse
import copy
import hashlib
import io
import json
import re
import subprocess
import tempfile
import time
from collections import Counter
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit
from zoneinfo import ZoneInfo

from PIL import Image, ImageChops, ImageOps, ImageStat, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / 'public/puma_oshen_wave/stores.json'
ASSETS = ROOT / 'public/puma_oshen_wave/assets/store-avatars'
PUBLIC_BASE = ('https://raw.githubusercontent.com/minicoursedev/tainan-ai-buffet/'
               'main/public/puma_oshen_wave/assets/store-avatars/')
STATE = ROOT / 'scripts/store-avatar-sync-state.json'
WORK = ROOT / '.avatar-sync'
Image.MAX_IMAGE_PIXELS = 25_000_000
DISCOVERY_VERSION = 3
TARGET_EDGE = 256
MIN_SOURCE_EDGE = 256
NAVIGATION_UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                 '(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36')


def now():
    return datetime.now(ZoneInfo('Asia/Taipei')).isoformat(timespec='seconds')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path, default=None):
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else copy.deepcopy(default)


def write_json(path, value):
    atomic_write(path, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode())


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == data:
        return
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as f:
        temporary = Path(f.name)
        f.write(data)
    temporary.replace(path)


def https_url(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError('來源或圖片必須是完整 HTTPS 網址')
    return quote(url, safe=':/?&=%+@,;~!$()*[]-_.#')


class Client:
    """Unauthenticated public requests only; bounded retries and downloads."""
    def __init__(self, interval=0.6, timeout=20):
        self.interval, self.timeout, self.last_request = interval, timeout, 0
        self.requests = 0
        self.downloaded = 0

    def get(self, url, validators=None, limit=10_000_000):
        url = https_url(url)
        for attempt in range(2):
            time.sleep(max(0, self.interval - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            with tempfile.TemporaryDirectory(prefix='oshen-avatar-') as directory:
                header, body = Path(directory) / 'headers', Path(directory) / 'body'
                args = ['curl', '--silent', '--show-error', '--location', '--compressed',
                        '--proto', '=https', '--proto-redir', '=https', '--max-redirs', '4',
                        '--max-time', str(self.timeout), '--max-filesize', str(limit),
                        '--user-agent', 'Mozilla/5.0', '--dump-header', str(header),
                        '--output', str(body), '--write-out', '%{http_code}\n%{url_effective}']
                if (urlsplit(url).hostname or '') in ('www.instagram.com', 'instagram.com',
                                                      'www.threads.com', 'www.threads.net'):
                    args += ['--user-agent', NAVIGATION_UA, '--header', 'Accept: text/html',
                             '--header', 'Sec-Fetch-Dest: document',
                             '--header', 'Sec-Fetch-Mode: navigate', '--header', 'Sec-Fetch-Site: none']
                for name, value in (validators or {}).items():
                    if name in ('etag', 'last-modified') and value and '\n' not in value and '\r' not in value:
                        key = 'If-None-Match' if name == 'etag' else 'If-Modified-Since'
                        args += ['--header', key + ': ' + value]
                self.requests += 1
                result = subprocess.run(args + [url], capture_output=True, text=True, timeout=self.timeout + 5)
                if result.returncode:
                    if attempt == 0 and result.returncode in (6, 7, 28, 52, 56):
                        time.sleep(1)
                        continue
                    raise ValueError('下載失敗：' + result.stderr.strip()[:180])
                status, final = result.stdout.split('\n', 1)
                status = int(status)
                if status in (502, 503, 504) and attempt == 0:
                    time.sleep(1)
                    continue
                if status not in (200, 304):
                    raise ValueError('HTTP ' + str(status))
                data = body.read_bytes() if body.exists() else b''
                if len(data) > limit:
                    raise ValueError('回應超過大小上限')
                self.downloaded += len(data)
                blocks = header.read_text(errors='replace').replace('\r\n', '\n').strip().split('\n\n')
                headers = {}
                for block in blocks:
                    if block.startswith('HTTP/'):
                        headers = {k.lower(): v.strip() for line in block.splitlines()[1:]
                                   if ':' in line for k, v in [line.split(':', 1)]}
                return status, data, headers, final


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.meta, self.images, self.div_classes, self.links = {}, [], [], []
        self.json_blocks, self.script_parts = [], None
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'application/json':
            self.script_parts = []
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'div':
            self.div_classes.append(attrs.get('class', ''))
        if tag == 'meta':
            key = attrs.get('property') or attrs.get('name')
            if key:
                self.meta.setdefault(key, []).append(attrs.get('content', ''))
        elif tag == 'img':
            attrs['_ancestorClasses'] = ' '.join(self.div_classes)
            self.images.append(attrs)

    def handle_endtag(self, tag):
        if tag == 'script' and self.script_parts is not None:
            try:
                self.json_blocks.append(json.loads(''.join(self.script_parts)))
            except (ValueError, RecursionError):
                pass
            self.script_parts = None
        if tag == 'div' and self.div_classes:
            self.div_classes.pop()

    def handle_data(self, data):
        if self.script_parts is not None:
            self.script_parts.append(data)

    def get(self, key):
        return next(iter(self.meta.get(key, [])), '')


def profile_key(url):
    parsed = urlsplit(url)
    path = unquote(parsed.path).strip('/').lower()
    if path == 'profile.php':
        return parse_qs(parsed.query).get('id', [''])[0]
    if path.startswith(('p/', 'people/')):
        return re.split(r'[-/]', path)[-1]
    return path.lstrip('@')


def discover(photo, body, final_url, expected_name=''):
    """Require the same official account AND avatar-specific markup, not just og:image."""
    page = Page(body.decode('utf-8', errors='replace'))
    source, platform = photo['source'], photo.get('platform')
    if platform == 'website':
        # This exact official profile slot was reviewed against the existing
        # verified shopPhoto; never treat a website's generic OG image as a logo.
        if source == final_url == 'https://www.zenolai.tw/':
            matches = [urljoin(final_url, image.get('src', '')) for image in page.images
                       if 'about_left' in image.get('_ancestorClasses', '').split()]
            if len(matches) == 1 and urlsplit(matches[0]).hostname == 'www.zenolai.tw':
                return https_url(matches[0]), '已確認官方網站「認識瑞隆」既有頭像位置 .about_left img'
        raise ValueError('官方網站尚無經確認的頭像選取規則，需人工確認')
    key = profile_key(source)
    final_key = profile_key(final_url)
    # Facebook migrated legacy slug-ID pages to people/profile IDs. Accept only
    # Meta's own redirect, matching canonical numeric ID and the exact store name.
    legacy_path = unquote(urlsplit(source).path).strip('/')
    title = page.get('og:title').strip()
    legacy_name = re.sub(r'-\d{8,}$', '', legacy_path).replace('-', ' ')
    matching_name = title and legacy_name == title and (expected_name == title or expected_name.startswith(title + ' '))
    legacy_fb = (platform == 'facebook' and re.fullmatch(r'[^/]+-\d{8,}', legacy_path)
                 and urlsplit(final_url).hostname in ('www.facebook.com', 'facebook.com')
                 and final_key.isdigit() and profile_key(page.get('og:url')) == final_key
                 and matching_name)
    if legacy_fb:
        key = final_key
    if not key or final_key != key:
        raise ValueError('官方來源轉至不同帳號或登入頁，需人工確認')
    if platform in ('instagram', 'threads', 'facebook'):
        hosts = {'instagram': ('instagram.com',), 'threads': ('threads.com', 'threads.net'),
                 'facebook': ('facebook.com',)}[platform]
        source_host, final_host = urlsplit(source).hostname or '', urlsplit(final_url).hostname or ''
        if not all(any(host == h or host.endswith('.' + h) for h in hosts) for host in (source_host, final_host)):
            raise ValueError('來源平台與網域不符')
        if profile_key(page.get('og:url')) != key:
            raise ValueError('頁面未提供相同官方帳號的 og:url，可能為登入頁')
        image = page.get('og:image')
        image_host = urlsplit(image).hostname or ''
        if not any(image_host == h or image_host.endswith('.' + h) for h in ('cdninstagram.com', 'fbcdn.net')):
            raise ValueError('圖片網址不是官方社群圖片網域')
        if not re.search(r'/t\d+(?:\.\d+)*-(?:19|1)/', urlsplit(image).path):
            raise ValueError('og:image 無法確認為個人頭像，未採用封面或貼文圖')
        if platform in ('instagram', 'threads'):
            title, description = page.get('og:title').lower(), page.get('og:description').lower()
            named_account = ('@' + key) in title or (title.startswith(key + ' •') and ('@' + key) in description)
            if 'profile' not in page.meta.get('og:type', []) or not named_account:
                raise ValueError('缺少相同帳號的 profile 類型與標題證據')
        elif not page.get('og:title') or page.get('og:title').strip().lower() == 'facebook':
            raise ValueError('Facebook 頁面沒有店家標題')
        return https_url(image), '官方帳號 og:url 相符；個人頭像 CDN 路徑；' + page.get('og:title')
    if platform == 'line':
        for image in page.images:
            if image.get('alt', '').lower() == 'show profile photo':
                url = urljoin(final_url, image.get('src', ''))
                if urlsplit(url).hostname == 'profile.line-scdn.net':
                    return https_url(url), '官方 LINE 頁面 img alt="Show profile photo"；' + page.get('og:title')
        raise ValueError('LINE 頁面未找到明確標記的帳號頭像')
    raise ValueError('官方網站尚無經確認的頭像選取規則，保留現有圖片待人工確認')


def validators(headers):
    return {key: headers[key] for key in ('etag', 'last-modified') if headers.get(key)}


def discover_candidates(photo, body, final_url, expected_name=''):
    """Use only URLs actually supplied by the verified profile, never rewrite CDN URLs."""
    fallback, evidence = discover(photo, body, final_url, expected_name)
    candidates = []
    if photo.get('platform') == 'line':
        page = Page(body.decode('utf-8', errors='replace'))
        for block in page.json_blocks:
            try:
                data = json.loads(block['props']['pageProps']['initialDataString'])
                original = data['profile']['profileImg']['original']
                if (data['requestedSearchId'].lstrip('@') == profile_key(photo['source'])
                        and urlsplit(original).hostname == 'profile.line-scdn.net'):
                    candidates.append((https_url(original), evidence + '；官方頁 profile.profileImg.original'))
            except (KeyError, TypeError, ValueError):
                continue
    if photo.get('platform') in ('instagram', 'threads'):
        page = Page(body.decode('utf-8', errors='replace'))
        stack = list(page.json_blocks)
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                stack.extend(value for value in node.values() if isinstance(value, (dict, list)))
                if str(node.get('username', '')).lower() != profile_key(photo['source']):
                    continue
                entries = [(node.get('profile_pic_url_hd'), 'profile_pic_url_hd')]
                info = node.get('hd_profile_pic_url_info')
                if isinstance(info, dict):
                    entries.append((info.get('url'), 'hd_profile_pic_url_info'))
                versions = node.get('hd_profile_pic_versions')
                if isinstance(versions, list):
                    entries.extend((version.get('url'), 'hd_profile_pic_versions')
                                   for version in versions if isinstance(version, dict))
                entries.append((node.get('profile_pic_url'), 'profile_pic_url'))
                for url, field in entries:
                    if not isinstance(url, str):
                        continue
                    host = urlsplit(url).hostname or ''
                    if (any(host == h or host.endswith('.' + h) for h in ('cdninstagram.com', 'fbcdn.net'))
                            and re.search(r'/t\d+(?:\.\d+)*-(?:19|1)/', urlsplit(url).path)):
                        candidates.append((https_url(url), evidence + '；相同帳號公開資料 ' + field))
            elif isinstance(node, list):
                stack.extend(node)
    candidates.append((fallback, evidence))
    candidates = list({url: (url, proof) for url, proof in candidates}.values())
    def priority(candidate):
        url, proof = candidate
        size = re.search(r'(?:s|p)(\d+)x(\d+)', url)
        edge = max(map(int, size.groups())) if size else None
        # URL hints only order downloads; decoded pixels decide acceptance.
        # Prefer the smallest sufficient version, not the biggest original.
        if edge is not None and edge >= MIN_SOURCE_EDGE:
            return (0, edge)
        if edge is None and any(key in proof for key in ('hd_profile_pic', 'profile_pic_url_hd', '.original')):
            return (1, 0)
        return (2, -edge) if edge is not None else (3, 0)
    return sorted(candidates, key=priority)


def official_sources(store):
    photo = store['shopPhoto']
    sources = [photo]
    # These are the catalog's reviewed official accounts, not guessed handles.
    for platform in ('threads', 'facebook', 'instagram'):
        source = (store.get('social') or {}).get(platform)
        if source and not any(row['source'] == source for row in sources):
            sources.append({**photo, 'source': source, 'platform': platform})
    return sources


def linked_official_sources(photo, body):
    """Follow the same account's explicit Threads link, not a guessed matching handle."""
    if photo.get('platform') != 'instagram':
        return []
    page = Page(body.decode('utf-8', errors='replace'))
    return [{**photo, 'source': url, 'platform': 'threads', 'linkedFrom': photo['source']}
            for url in page.links
            if urlsplit(url).scheme == 'https'
            and urlsplit(url).hostname in ('www.threads.com', 'www.threads.net', 'threads.com', 'threads.net')
            and profile_key(url) == profile_key(photo['source'])]


def decode(data):
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ('PNG', 'JPEG', 'WEBP', 'GIF'):
                raise ValueError('不支援的圖片格式')
            image.seek(0)
            image.load()
            return ImageOps.exif_transpose(image).convert('RGBA')
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as error:
        raise ValueError('圖片無法安全解碼') from error


def normalized(image):
    """Compare visible pixels over both backgrounds; ignore file metadata/encoding."""
    image = image.resize((128, 128), Image.Resampling.LANCZOS)
    return [Image.alpha_composite(Image.new('RGBA', image.size, color), image).convert('RGB')
            for color in ('white', 'black')]


def same_content(left, right):
    if abs(left.width / left.height - right.width / right.height) > 0.01:
        return False
    if left.size == right.size and left.tobytes() == right.tobytes():
        return True
    # Conservative tolerance for compression noise; localized edits remain changes.
    for a, b in zip(normalized(left), normalized(right)):
        delta = ImageChops.difference(a, b)
        if max(ImageStat.Stat(delta).mean) > 1.5:
            return False
        for channel in delta.split():
            histogram = channel.histogram()
            if sum(histogram[17:]) / (128 * 128) > 0.005:
                return False
    return True


def render(image):
    content = image.copy()
    content.thumbnail((TARGET_EDGE, TARGET_EDGE), Image.Resampling.LANCZOS)  # Never upscale.
    edge = max(content.size)
    canvas = Image.new('RGBA', (edge, edge), (0, 0, 0, 0))
    x, y = (edge - content.width) // 2, (edge - content.height) // 2
    canvas.paste(content, (x, y))
    stream = io.BytesIO()
    canvas.save(stream, format='PNG', optimize=True)
    return stream.getvalue(), [x, y, x + content.width, y + content.height]


def sync_one(store, previous, client, assets=ASSETS, reviewed=None):
    photo = store.get('shopPhoto') or {}
    if not photo.get('source'):
        return previous, None, 'missing-source', '沒有官方頭像來源'
    if photo.get('status') != 'verified':
        return previous, None, 'needs-review', '既有頭像未確認為官方頭像'
    path = assets / (store['id'] + '.png')
    old_valid = path.exists() and previous.get('sha256') == sha(path.read_bytes()) and previous.get('contentBox')
    attempts, selected = [], None
    sources = official_sources(store)
    if reviewed:
        if (reviewed.get('id') != store['id'] or reviewed.get('checkedAt') != now()[:10]
                or not reviewed.get('evidence') or not re.fullmatch(r'[a-f0-9]{64}', reviewed.get('sha256', ''))
                or reviewed.get('platform') not in ('instagram', 'threads', 'facebook', 'line', 'website')):
            raise ValueError('人工查證候選需有相同店家 ID、當日日期、官方頭像證據及原檔 SHA-256')
        https_url(reviewed['source'])
        https_url(reviewed['imageUrl'])
        sources.insert(0, {**photo, **reviewed, '_reviewed': True})
    for source_photo in sources:
        matching_source = previous.get('source') == source_photo['source']
        reusable = matching_source and previous.get('discoveryVersion') == DISCOVERY_VERSION
        source_validators = previous.get('sourceValidators') if reusable else None
        try:
            if source_photo.get('_reviewed'):
                status, headers = 200, {}
                candidates = [(source_photo['imageUrl'], source_photo['evidence'])]
            else:
                status, body, headers, final = client.get(source_photo['source'], source_validators)
            if source_photo.get('_reviewed'):
                pass
            elif status == 304:
                if not reusable or not previous.get('imageUrl'):
                    raise ValueError('來源回傳 304，但沒有目前版本已確認的頭像資訊')
                candidates = [(previous['imageUrl'], previous['evidence'])]
            else:
                candidates = discover_candidates(source_photo, body, final, store['name'])
                for linked in linked_official_sources(source_photo, body):
                    if not any(row['platform'] == linked['platform'] and
                               profile_key(row['source']) == profile_key(linked['source']) for row in sources):
                        sources.append(linked)
            for image_url, evidence in candidates:
                image_validators = (previous.get('imageValidators') if matching_source and old_valid
                                    and not source_photo.get('_reviewed')
                                    and image_url == previous.get('imageUrl') else None)
                try:
                    image_status, image_body, image_headers, _ = client.get(image_url, image_validators)
                    if image_status == 304:
                        if not old_valid:
                            raise ValueError('圖片回傳 304，但正式圖片不存在或指紋不符')
                        image, size = None, previous['sourceSize']
                    else:
                        if source_photo.get('_reviewed') and sha(image_body) != source_photo['sha256']:
                            raise ValueError('人工查證候選下載內容與已審核原圖指紋不符')
                        image = decode(image_body)
                        size = list(image.size)
                    attempts.append({'source': source_photo['source'], 'platform': source_photo['platform'],
                                     'imageUrl': image_url, 'size': size, 'evidence': evidence,
                                     'result': 'sufficient' if max(size) >= MIN_SOURCE_EDGE else 'low-resolution'})
                    if source_photo.get('linkedFrom'):
                        attempts[-1]['linkedFrom'] = source_photo['linkedFrom']
                    if max(size) >= MIN_SOURCE_EDGE:
                        selected = (source_photo, status, headers, image_url, evidence,
                                    image_status, image, image_headers)
                        break
                except (ValueError, OSError, subprocess.TimeoutExpired) as error:
                    attempts.append({'source': source_photo['source'], 'imageUrl': image_url,
                                     'result': 'failed', 'reason': str(error)})
            if selected:
                break
        except (ValueError, OSError, subprocess.TimeoutExpired) as error:
            attempts.append({'source': source_photo['source'], 'result': 'failed', 'reason': str(error)})
    record = copy.deepcopy(previous)
    record['qualityChecks'] = attempts
    if not selected:
        small = [row['size'] for row in attempts if row['result'] == 'low-resolution']
        reason = ('官方來源僅取得小圖（最大 ' + str(max(max(size) for size in small)) +
                  ' px），保留舊圖，待補足夠清晰的 Logo 來源' if small else '未取得可驗證的官方頭像，保留舊圖')
        return record, None, ('low-resolution' if small else 'failed'), reason
    source_photo, status, headers, image_url, evidence, image_status, image, image_headers = selected
    if image_status == 304:
        old = decode(path.read_bytes())
        content = old.crop(tuple(record['contentBox']))
        changed = old.size != (min(TARGET_EDGE, max(content.size)),) * 2
        if changed:
            data, box = render(content)
            atomic_write(path, data)
            record.update(sha256=sha(data), contentBox=box)
        reason = '依 Logo 尺寸縮小既有圖片' if changed else 'HTTP 304，內容未變'
    else:
        changed, upgrade, resize = True, False, False
        if old_valid:
            old = decode(path.read_bytes())
            old_image = old.crop(tuple(record['contentBox']))
            upgrade = max(old_image.size) < min(TARGET_EDGE, max(image.size))
            resize = old.size != (min(TARGET_EDGE, max(image.size)),) * 2
            changed = resize or upgrade or not same_content(old_image, image)
        if changed:
            data, box = render(image)
            atomic_write(path, data)
            record.update(sha256=sha(data), contentBox=box, sourceSize=list(image.size))
        reason = ('首次保存' if not old_valid else '取得較高解析度官方頭像' if upgrade else
                  '依 Logo 尺寸縮小既有圖片' if resize else
                  '來源頭像內容改變' if changed else '像素內容相同或僅有輕微轉碼差異')
        record['imageValidators'] = validators(image_headers)
    record.update(source=source_photo['source'], imageUrl=image_url, evidence=evidence,
                  filename=path.name, lastSuccess=now(), discoveryVersion=DISCOVERY_VERSION)
    if status != 304:
        record['sourceValidators'] = validators(headers)
    url = PUBLIC_BASE + path.name + '?v=' + record['sha256'][:16]
    updated = copy.deepcopy(photo)
    if photo.get('url') != url or photo['source'] != source_photo['source']:
        updated.update(url=url, source=source_photo['source'], platform=source_photo['platform'],
                       checkedAt=now()[:10],
                       note=evidence + '；本站 Logo 最長邊 256 px、完整置中、小圖不放大；來源尺寸 ' +
                       ' × '.join(map(str, record['sourceSize'])) + '。')
    patch = None if updated == photo else {'id': store['id'], 'before': photo, 'after': updated,
                                           'sha256': record['sha256'], 'filename': path.name}
    return record, patch, ('updated' if changed else 'unchanged'), reason


def catalog_guard(data):
    return {store['id']: {'disabled': store.get('disabled') is True,
                          'shopPhoto': store.get('shopPhoto')}
            for store in data['stores']}


def prepare(args):
    catalog = read_json(args.catalog)
    state = read_json(args.state, {'version': 1, 'stores': {}})
    stores = [store for store in catalog['stores'] if store.get('disabled') is not True]
    ids = [store['id'] for store in catalog['stores']]
    if len(ids) != len(set(ids)) or any(not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', key) for key in ids):
        raise ValueError('店家 ID 重複或不是安全檔名')
    selected = set(args.only.split(',')) if args.only else None
    if selected and not selected.issubset({store['id'] for store in stores}):
        raise ValueError('--only 必須是啟用店家的 ID')
    client = Client(args.interval, args.timeout)
    reviewed_rows = read_json(getattr(args, 'reviewed_sources', None), []) if getattr(args, 'reviewed_sources', None) else []
    reviewed = {row['id']: row for row in reviewed_rows}
    if len(reviewed) != len(reviewed_rows) or not set(reviewed).issubset(set(ids)):
        raise ValueError('人工查證候選含重複或不存在的店家 ID')
    if args.command == 'retry':
        report = read_json(args.work_dir / 'plan.json')
        if not report or report.get('partial') or not report.get('completedAt') or report['catalogGuard'] != catalog_guard(catalog):
            raise ValueError('retry 需要完整且店家頭像／啟用狀態未變更的檢查紀錄；否則重新 prepare')
        selected = {row['id'] for row in report['results'] if row['result'] in ('failed', 'low-resolution')}
        if not selected:
            print('沒有失敗項目需要重試。')
            return
        report['retriedAt'] = now()
        report.pop('completedAt', None)
    else:
        report = {'startedAt': now(), 'partial': selected is not None, 'results': [], 'patches': [],
                  'catalogGuard': catalog_guard(catalog)}
    for store in stores:
        if selected is not None and store['id'] not in selected:
            continue
        key = store['id']
        previous = state['stores'].get(key, {})
        report['results'] = [row for row in report['results'] if row['id'] != key]
        report['patches'] = [row for row in report['patches'] if row['id'] != key]
        try:
            record, patch, outcome, reason = sync_one(store, previous, client, reviewed=reviewed.get(key))
            if patch:
                report['patches'].append(patch)
        except (ValueError, OSError, subprocess.TimeoutExpired) as error:
            record, outcome, reason = previous, 'failed', str(error)
        record = {**record, 'lastAttempt': now(), 'result': outcome, 'reason': reason}
        state['stores'][key] = record
        report['results'].append({'id': key, 'name': store['name'], 'result': outcome, 'reason': reason})
        print(f'{len(report["results"]):3} {key}: {outcome} — {reason}', flush=True)
        # Interrupted runs retain completed checks and assets; JSON remains untouched.
        write_json(args.state, state)
        write_json(args.work_dir / 'plan.json', report)
    report.update(completedAt=now(), counts=dict(Counter(row['result'] for row in report['results'])),
                  requests=report.get('requests', 0) + client.requests,
                  downloadedBytes=report.get('downloadedBytes', 0) + client.downloaded)
    write_json(args.work_dir / 'plan.json', report)
    candidate = copy.deepcopy(catalog)
    patches = {patch['id']: patch for patch in report['patches']}
    for store in candidate['stores']:
        if store['id'] in patches:
            store['shopPhoto'] = patches[store['id']]['after']
    write_json(args.work_dir / 'stores.candidate.json', candidate)
    print(json.dumps({key: report[key] for key in ('counts', 'requests', 'downloadedBytes')}, ensure_ascii=False))
    print('正式 stores.json 未變更。先提交並推送 assets/store-avatars/，再執行 apply 驗證 GitHub Raw 圖片；無須部署網站。')


def verify_plan(plan, client, assets=ASSETS):
    evidence = []
    for patch in plan['patches']:
        filename = patch['id'] + '.png'
        if patch['filename'] != filename or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', patch['id']):
            raise ValueError('待發布圖片檔名無效')
        data = (assets / filename).read_bytes()
        if sha(data) != patch['sha256']:
            raise ValueError('本機圖片已變更，請重新 prepare：' + patch['id'])
        expected = PUBLIC_BASE + filename + '?v=' + patch['sha256'][:16]
        if patch['after']['url'] != expected:
            raise ValueError('待發布網址與指紋不符')
        status, body, _, final = client.get(expected)
        if (status != 200 or urlsplit(final)[:3] != urlsplit(expected)[:3]
                or sha(body) != patch['sha256']):
            raise ValueError('GitHub Raw 圖片尚未更新或內容不符，停止更新 JSON：' + patch['id'])
        dimensions = decode(body).size
        if dimensions[0] != dimensions[1] or not 1 <= dimensions[0] <= TARGET_EDGE:
            raise ValueError('公開圖片尺寸錯誤：' + patch['id'])
        evidence.append({'id': patch['id'], 'url': expected, 'httpStatus': status,
                         'sha256': sha(body), 'size': list(dimensions), 'bytes': len(body), 'verifiedAt': now()})
        print('公開圖片驗證通過：' + patch['id'], flush=True)
    return evidence


def apply(args):
    plan = read_json(args.work_dir / 'plan.json')
    if not plan or not plan.get('completedAt') or plan.get('partial'):
        raise ValueError('必須先完成全部啟用店家的 prepare，不能發布局部或中斷的檢查結果')
    current = read_json(args.catalog)
    if catalog_guard(current) != plan['catalogGuard']:
        raise ValueError('店家啟用狀態或頭像資料已變更，請重新 prepare；其他店家欄位會保留')
    evidence = verify_plan(plan, Client(args.interval, args.timeout))
    # Verify every proposed image before writing anything to the official catalog.
    latest = read_json(args.catalog)
    if latest != current:
        raise ValueError('公開驗證期間店家資料被修改，停止寫入以保留修改')
    patches = {patch['id']: patch for patch in plan['patches']}
    for store in latest['stores']:
        if store['id'] in patches:
            store['shopPhoto'] = patches[store['id']]['after']
    write_json(args.catalog, latest)
    plan.update(appliedAt=now(), publicVerification=evidence)
    write_json(args.work_dir / 'plan.json', plan)
    print('已更新 ' + str(len(patches)) + ' 家頭像欄位；請檢查差異，再提交與推送 JSON。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'retry', 'apply'))
    parser.add_argument('--catalog', type=Path, default=CATALOG)
    parser.add_argument('--state', type=Path, default=STATE)
    parser.add_argument('--work-dir', type=Path, default=WORK)
    parser.add_argument('--only', help='僅診斷指定 ID（逗號分隔）；局部結果不能 apply')
    parser.add_argument('--reviewed-sources', type=Path, help='當日已人工核對官方頭像的 JSON 候選清單')
    parser.add_argument('--interval', type=float, default=0.6)
    parser.add_argument('--timeout', type=int, default=20)
    args = parser.parse_args()
    if args.interval < 0.1 or not 1 <= args.timeout <= 60:
        parser.error('interval 至少 0.1 秒，timeout 為 1–60 秒')
    if args.command != 'prepare' and args.only:
        parser.error('只有 prepare 接受 --only')
    try:
        (apply if args.command == 'apply' else prepare)(args)
    except (ValueError, OSError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f'同步停止：{error}\n')


if __name__ == '__main__':
    main()
