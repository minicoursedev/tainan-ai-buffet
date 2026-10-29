import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publication', Path(__file__).with_name('verify-site-publication.py'))
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


class PublicationTests(unittest.TestCase):
    def test_http_failure_and_stale_content_are_not_success(self):
        expected = {'public/a.json': b'new', 'public/image.webp': b'image'}
        self.assertEqual(publication.mismatches(expected, lambda p, b: p.endswith('.webp')), ['public/a.json'])
        def unavailable(path, content):
            raise OSError('offline')
        self.assertEqual(set(publication.mismatches(expected, unavailable)), set(expected))

    def test_already_published_files_do_not_require_another_deployment(self):
        with patch.object(publication, 'expected_files', return_value={'public/a.json': b'new'}), \
                patch.object(publication, 'mismatches', return_value=[]), \
                patch.object(publication, 'command') as command:
            self.assertEqual(publication.verify(Path('.'), 'sha', 'base')['status'], 'verified')
            command.assert_not_called()

    def test_failed_deployment_is_reported_without_claiming_publication(self):
        with patch.object(publication, 'expected_files', return_value={'public/a.json': b'new'}), \
                patch.object(publication, 'mismatches', return_value=['public/a.json']), \
                patch.object(publication, 'command', return_value=b'[{"headSha":"sha","status":"completed","conclusion":"failure","url":"https://github.com/run"}]'):
            with self.assertRaisesRegex(ValueError, 'deployment failed'):
                publication.verify(Path('.'), 'sha', 'base')

    def test_waits_for_real_content_after_successful_workflow(self):
        with patch.object(publication, 'expected_files', return_value={'public/a.json': b'new'}), \
                patch.object(publication, 'mismatches', side_effect=[['public/a.json'], []]), \
                patch.object(publication, 'command', return_value=b'[{"headSha":"sha","status":"completed","conclusion":"success","url":"https://github.com/run"}]'), \
                patch.object(publication.time, 'sleep'):
            self.assertEqual(publication.verify(Path('.'), 'sha', 'base')['status'], 'verified')


if __name__ == '__main__':
    unittest.main()
