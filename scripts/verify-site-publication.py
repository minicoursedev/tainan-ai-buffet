"""Wait for Pages and verify changed JSON and images against the pushed commit."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

SITE = 'https://minicourse.dev/'
REPOSITORY = 'minicoursedev/tainan-ai-buffet'


def command(repo, *args):
    result = subprocess.run(args, cwd=repo, capture_output=True, timeout=60)
    if result.returncode:
        raise ValueError(f'{args[0]} {args[1]} failed; publication is not confirmed')
    return result.stdout


def expected_files(repo, commit, base):
    names = command(repo, 'git', 'diff', '--name-only', '--diff-filter=ACMR', '-z',
                    base, commit, '--', 'public/').decode().split('\0')
    return {name: command(repo, 'git', 'show', f'{commit}:{name}')
            for name in names if name and Path(name).suffix.lower() in {'.json', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.avif'}}


def fetch_public(path, content):
    relative = PurePosixPath(path).relative_to('public').as_posix()
    version = hashlib.sha256(content).hexdigest()[:16]
    url = SITE + quote(relative, safe='/') + '?v=' + version
    request = Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'Mozilla/5.0'})
    with urlopen(request, timeout=20) as response:
        return response.status == 200 and response.read() == content


def mismatches(expected, fetch=fetch_public):
    def check(item):
        path, content = item
        try:
            return None if fetch(path, content) else path
        except (OSError, ValueError):
            return path
    with ThreadPoolExecutor(max_workers=6) as pool:
        return [path for path in pool.map(check, expected.items()) if path]


def verify(repo, commit, base, timeout=1200, interval=10):
    expected = expected_files(repo, commit, base)
    if not expected:
        return {'status': 'no-public-changes', 'commit': commit, 'files': 0}
    deadline = time.monotonic() + timeout
    while True:
        runs = json.loads(command(repo, 'gh', 'run', 'list', '--repo', REPOSITORY,
                                  '--workflow', 'deploy.yml', '--commit', commit, '--limit', '20',
                                  '--json', 'status,conclusion,headSha,url'))
        matching = [run for run in runs if run['headSha'] == commit]
        completed = matching and matching[0]['status'] == 'completed'
        if completed and matching[0]['conclusion'] != 'success':
            raise ValueError('Pages deployment failed: ' + matching[0]['url'])
        # Do not cache the previous deployment under new image-version URLs.
        if completed:
            pending = mismatches(expected)
            if not pending:
                break
        else:
            pending = ['waiting for Pages deployment']
        if time.monotonic() >= deadline:
            raise ValueError('Site publication not verified: ' + ', '.join(pending[:8]))
        time.sleep(interval)
    return {'status': 'verified', 'commit': commit, 'files': len(expected), 'site': SITE}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--base', required=True)
    parser.add_argument('--timeout', type=int, default=1200)
    args = parser.parse_args()
    try:
        repo = Path(__file__).resolve().parents[1]
        commit = command(repo, 'git', 'rev-parse', args.commit).decode().strip()
        print(json.dumps(verify(repo, commit, args.base, args.timeout), ensure_ascii=False))
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        parser.exit(1, str(error) + '\n')
