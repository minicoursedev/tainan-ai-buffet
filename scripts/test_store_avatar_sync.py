import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image, ImageDraw, PngImagePlugin

spec = importlib.util.spec_from_file_location('avatar_sync', Path(__file__).with_name('store-avatar-sync.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def png(image, metadata=None):
    stream = io.BytesIO()
    image.save(stream, 'PNG', pnginfo=metadata)
    return stream.getvalue()


IMAGE_URL = 'https://scontent.cdninstagram.com/v/t51.2885-19/avatar.jpg?oh=first'
SOURCE = 'https://www.instagram.com/example_shop/'


def html(url=IMAGE_URL):
    return ('<meta property="og:type" content="profile">'
            '<meta property="og:url" content="' + SOURCE + '">'
            '<meta property="og:title" content="範例店 (@example_shop) • Instagram">'
            '<meta property="og:image" content="' + url + '">').encode()


class FakeClient:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    def get(self, url, validators=None, **kwargs):
        self.calls.append((url, validators))
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class AvatarTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.assets = Path(self.temp.name)
        self.store = {'id': 'example-shop', 'name': '範例店', 'address': '原地址',
                      'shopPhoto': {'url': IMAGE_URL, 'source': SOURCE, 'platform': 'instagram',
                                    'status': 'verified', 'checkedAt': '2026-10-19', 'note': '已確認'}}
        self.image = Image.new('RGBA', (120, 80), (255, 80, 0, 255))

    def migrate(self):
        client = FakeClient([(200, html(), {}, SOURCE), (200, png(self.image), {'etag': 'image-v1'}, IMAGE_URL)])
        return sync.sync_one(self.store, {}, client, self.assets)

    def test_dimensions_no_upscale_and_alpha(self):
        self.image.putpixel((0, 0), (0, 100, 0, 100))
        data, box = sync.render(self.image)
        result = sync.decode(data)
        self.assertEqual(result.size, (512, 512))
        self.assertEqual(box, [196, 216, 316, 296])
        self.assertEqual(result.getpixel((196, 216)), (0, 100, 0, 100))
        self.assertEqual(result.getpixel((0, 0))[3], 0)

    def test_large_wide_image_is_not_cropped(self):
        image = Image.new('RGBA', (1200, 600), 'red')
        ImageDraw.Draw(image).rectangle((0, 0, 100, 599), fill='blue')
        data, box = sync.render(image)
        self.assertEqual(box, [0, 128, 512, 384])
        self.assertEqual(sync.decode(data).getpixel((0, 256))[:3], (0, 0, 255))

    def test_metadata_and_transcoding_do_not_change_content(self):
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text('Comment', 'new metadata')
        self.assertTrue(sync.same_content(sync.decode(png(self.image)), sync.decode(png(self.image, metadata))))
        image = Image.new('RGB', (256, 256), (40, 100, 180))
        stream = io.BytesIO()
        image.save(stream, 'JPEG', quality=90)
        self.assertTrue(sync.same_content(image.convert('RGBA'), sync.decode(stream.getvalue())))
        changed = image.convert('RGBA')
        ImageDraw.Draw(changed).rectangle((80, 80, 110, 110), fill='white')
        self.assertFalse(sync.same_content(image.convert('RGBA'), changed))

    def test_signature_change_does_not_rewrite_file_or_url(self):
        state, proposed, _, _ = self.migrate()
        self.store['shopPhoto'] = proposed['after']
        path = self.assets / 'example-shop.png'
        mtime = path.stat().st_mtime_ns
        new_url = IMAGE_URL.replace('first', 'second')
        client = FakeClient([(200, html(new_url), {}, SOURCE), (200, png(self.image), {}, new_url)])
        updated, proposed, outcome, _ = sync.sync_one(self.store, state, client, self.assets)
        self.assertEqual(outcome, 'unchanged')
        self.assertIsNone(proposed)
        self.assertEqual(path.stat().st_mtime_ns, mtime)
        self.assertEqual(state['sha256'], updated['sha256'])
        self.assertIsNone(client.calls[1][1])

    def test_changed_avatar_overwrites_same_file_and_changes_version(self):
        state, first, _, _ = self.migrate()
        self.store['shopPhoto'] = first['after']
        changed = Image.new('RGBA', (120, 80), 'blue')
        client = FakeClient([(200, html(), {}, SOURCE), (200, png(changed), {}, IMAGE_URL)])
        updated, second, outcome, _ = sync.sync_one(self.store, state, client, self.assets)
        self.assertEqual(outcome, 'updated')
        self.assertEqual(list(self.assets.iterdir()), [self.assets / 'example-shop.png'])
        self.assertNotEqual(first['after']['url'], second['after']['url'])
        self.store['shopPhoto'] = second['after']
        client = FakeClient([(200, html(), {}, SOURCE), (200, png(changed), {}, IMAGE_URL)])
        _, third, outcome, _ = sync.sync_one(self.store, updated, client, self.assets)
        self.assertIsNone(third)
        self.assertEqual(outcome, 'unchanged')

    def test_conditional_request_preserves_image(self):
        state, proposed, _, _ = self.migrate()
        self.store['shopPhoto'] = proposed['after']
        client = FakeClient([(304, b'', {}, SOURCE), (304, b'', {}, IMAGE_URL)])
        _, proposed, outcome, _ = sync.sync_one(self.store, state, client, self.assets)
        self.assertEqual(client.calls[1][1], {'etag': 'image-v1'})
        self.assertIsNone(proposed)
        self.assertEqual(outcome, 'unchanged')

    def test_login_cover_and_wrong_account_are_rejected(self):
        for body, final in [(b'<title>Log in</title>', SOURCE),
                            (html().replace(b'example_shop', b'other_shop'), SOURCE),
                            (html(IMAGE_URL.replace('-19/', '-15/')), SOURCE),
                            (html(), 'https://www.instagram.com/accounts/login/')]:
            with self.subTest(body=body):
                with self.assertRaises(ValueError):
                    sync.discover(self.store['shopPhoto'], body, final)

    def test_username_only_instagram_title(self):
        body = html().replace('範例店 (@example_shop)'.encode(), b'example_shop')
        body += b'<meta property="og:description" content="Photos from @example_shop">'
        self.assertEqual(sync.discover(self.store['shopPhoto'], body, SOURCE)[0], IMAGE_URL)

    def test_facebook_legacy_redirect_requires_matching_store_name(self):
        source = 'https://www.facebook.com/森木廚房-106275088128265/'
        final = 'https://www.facebook.com/people/old-name/100063670073185/'
        image = 'https://scontent.fbcdn.net/v/t39.30808-1/avatar.jpg'
        body = ('<meta property="og:url" content="' + final + '">'
                '<meta property="og:title" content="森木廚房">'
                '<meta property="og:image" content="' + image + '">').encode()
        photo = {'source': source, 'platform': 'facebook'}
        self.assertEqual(sync.discover(photo, body, final, '森木廚房')[0], image)
        self.assertEqual(sync.discover(photo, body, final, '森木廚房 日式咖哩＆米食餐盒')[0], image)
        with self.assertRaises(ValueError):
            sync.discover(photo, body, final, '其他店')

    def test_reviewed_website_slot_ignores_cover_and_posts(self):
        source = 'https://www.zenolai.tw/'
        body = (b'<meta property="og:image" content="https://www.zenolai.tw/cover.jpg">'
                b'<div><img src="post.jpg"><div class="col-md-6 about_left">'
                b'<img src="/asset/types/zenolai/img/people.png"></div></div>')
        photo = {'source': source, 'platform': 'website'}
        self.assertEqual(sync.discover(photo, body, source)[0], source + 'asset/types/zenolai/img/people.png')
        with self.assertRaises(ValueError):
            sync.discover(photo, body.replace(b'about_left', b'other'), source)

    def test_errors_preserve_existing_asset_and_data(self):
        state, proposed, _, _ = self.migrate()
        self.store['shopPhoto'] = proposed['after']
        before = copy.deepcopy(self.store)
        original = (self.assets / 'example-shop.png').read_bytes()
        for failure in [ValueError('HTTP 403'), ValueError('HTTP 429'), ValueError('timeout')]:
            with self.assertRaises(ValueError):
                sync.sync_one(self.store, state, FakeClient([failure]), self.assets)
        client = FakeClient([(200, html(), {}, SOURCE), (200, b'<html>Login</html>', {}, IMAGE_URL)])
        with self.assertRaises(ValueError):
            sync.sync_one(self.store, state, client, self.assets)
        self.assertEqual(original, (self.assets / 'example-shop.png').read_bytes())
        self.assertEqual(before, self.store)

    def test_missing_source_is_pending_without_request(self):
        self.store.pop('shopPhoto')
        client = FakeClient([])
        _, proposed, outcome, _ = sync.sync_one(self.store, {}, client, self.assets)
        self.assertEqual(outcome, 'missing-source')
        self.assertIsNone(proposed)
        self.assertFalse(client.calls)

    def test_pages_to_raw_migration_keeps_asset_and_is_repeatable(self):
        state, proposed, _, _ = self.migrate()
        self.store['shopPhoto'] = proposed['after']
        self.store['shopPhoto']['url'] = ('https://minicourse.dev/puma_oshen_wave/assets/store-avatars/'
                                         'example-shop.png?v=' + state['sha256'][:16])
        path = self.assets / 'example-shop.png'
        original, mtime = path.read_bytes(), path.stat().st_mtime_ns
        client = FakeClient([(304, b'', {}, SOURCE), (304, b'', {}, IMAGE_URL)])
        _, migrated, outcome, _ = sync.sync_one(self.store, state, client, self.assets)
        self.assertEqual(outcome, 'unchanged')
        self.assertTrue(migrated['after']['url'].startswith(
            'https://raw.githubusercontent.com/minicoursedev/tainan-ai-buffet/main/public/'))
        self.assertTrue(migrated['after']['url'].endswith('example-shop.png?v=' + state['sha256'][:16]))
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(path.stat().st_mtime_ns, mtime)
        self.store['shopPhoto'] = migrated['after']
        _, repeat, _, _ = sync.sync_one(self.store, state,
            FakeClient([(304, b'', {}, SOURCE), (304, b'', {}, IMAGE_URL)]), self.assets)
        self.assertIsNone(repeat)

    def test_public_verification_rejects_pages_and_other_raw_repository(self):
        _, proposed, _, _ = self.migrate()
        data = (self.assets / 'example-shop.png').read_bytes()
        for final in ['https://minicourse.dev/puma_oshen_wave/assets/store-avatars/example-shop.png',
                      proposed['after']['url'].replace('/minicoursedev/', '/another-owner/')]:
            with self.subTest(final=final):
                with self.assertRaises(ValueError):
                    sync.verify_plan({'patches': [proposed]}, FakeClient([(200, data, {}, final)]), self.assets)

    def test_public_verification_requires_correct_bytes(self):
        _, proposed, _, _ = self.migrate()
        plan = {'patches': [proposed]}
        client = FakeClient([(200, png(Image.new('RGBA', (512, 512), 'green')), {}, proposed['after']['url'])])
        with self.assertRaises(ValueError):
            sync.verify_plan(plan, client, self.assets)
        data = (self.assets / 'example-shop.png').read_bytes()
        client = FakeClient([(200, data, {}, proposed['after']['url'])])
        self.assertEqual(sync.verify_plan(plan, client, self.assets)[0]['size'], [512, 512])

    def test_apply_failure_keeps_catalog_and_success_preserves_other_fields(self):
        _, proposed, _, _ = self.migrate()
        catalog = {'metadata': {'keep': True}, 'stores': [self.store]}
        plan = {'completedAt': sync.now(), 'partial': False, 'patches': [proposed],
                'catalogGuard': sync.catalog_guard(catalog)}
        path = self.assets / 'stores.json'
        sync.write_json(self.assets / 'plan.json', plan)
        catalog['stores'][0]['address'] = '使用者另行修改的地址'
        sync.write_json(path, catalog)
        original = path.read_bytes()
        args = SimpleNamespace(work_dir=self.assets, catalog=path, interval=0.1, timeout=2)
        with patch.object(sync, 'verify_plan', side_effect=ValueError('not deployed')):
            with self.assertRaises(ValueError):
                sync.apply(args)
        self.assertEqual(original, path.read_bytes())
        with patch.object(sync, 'verify_plan', return_value=[]):
            sync.apply(args)
        result = json.loads(path.read_text())
        self.assertEqual(result['stores'][0]['address'], '使用者另行修改的地址')
        self.assertEqual(result['metadata'], {'keep': True})
        self.assertEqual(result['stores'][0]['shopPhoto'], proposed['after'])

    def test_apply_rejects_partial_or_stale_plan(self):
        catalog = {'stores': [self.store]}
        path = self.assets / 'stores.json'
        sync.write_json(path, catalog)
        args = SimpleNamespace(work_dir=self.assets, catalog=path, interval=0.1, timeout=2)
        for plan in [{'completedAt': sync.now(), 'partial': True},
                     {'completedAt': sync.now(), 'partial': False, 'catalogGuard': {}}]:
            sync.write_json(self.assets / 'plan.json', plan)
            with self.assertRaises(ValueError):
                sync.apply(args)

    def test_retry_only_rechecks_failed_records(self):
        second = {**copy.deepcopy(self.store), 'id': 'second-shop'}
        catalog = {'stores': [self.store, second]}
        path = self.assets / 'stores.json'
        state = self.assets / 'state.json'
        sync.write_json(path, catalog)
        patch_one = {'id': self.store['id'], 'before': self.store['shopPhoto'], 'after': self.store['shopPhoto']}
        sync.write_json(self.assets / 'plan.json', {'completedAt': sync.now(), 'partial': False,
            'catalogGuard': sync.catalog_guard(catalog), 'patches': [patch_one],
            'results': [{'id': self.store['id'], 'result': 'unchanged'}, {'id': second['id'], 'result': 'failed'}]})
        args = SimpleNamespace(command='retry', work_dir=self.assets, catalog=path, state=state,
                               only=None, interval=0.1, timeout=2)
        with patch.object(sync, 'sync_one', return_value=({}, None, 'unchanged', 'same')) as check:
            sync.prepare(args)
        self.assertEqual(check.call_count, 1)
        self.assertEqual(check.call_args[0][0]['id'], second['id'])
        result = json.loads((self.assets / 'plan.json').read_text())
        self.assertEqual(result['patches'], [patch_one])
        self.assertEqual(result['counts'], {'unchanged': 2})
        self.assertEqual(json.loads(path.read_text()), catalog)


if __name__ == '__main__':
    unittest.main()
