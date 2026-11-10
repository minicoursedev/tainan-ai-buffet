// Delegation covers both server-rendered work pages and dynamically opened booths.
const dialog = document.getElementById('work-share-dialog');
if (dialog) {
  const byId = id => document.getElementById(id);
  let generation = 0;
  let shareData = null;
  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-share-work]');
    if (!button) return;
    const url = new URL(button.dataset.shareWork, location.href);
    if (url.origin !== location.origin || !/^\/puma_oshen_wave\/designer\/profiles\/[^/]+\/works\/[^/]+\/$/.test(url.pathname)) return;
    const token = ++generation;
    shareData = { title: `${button.dataset.workDesigner} 設計師`, url: url.href };
    const facebook = new URL('https://www.facebook.com/sharer/sharer.php');
    facebook.searchParams.set('u', url.href);
    byId('work-share-facebook').href = facebook.href;
    const threads = new URL('https://www.threads.com/intent/post');
    threads.searchParams.set('text', `${shareData.title}\n${url.href}`);
    byId('work-share-threads').href = threads.href;
    byId('work-share-designer').textContent = shareData.title;
    const image = byId('work-share-image');
    image.src = button.dataset.workImage;
    image.alt = button.dataset.workLabel || '';
    image.hidden = !button.dataset.workImage;
    const link = byId('work-share-url');
    link.href = url.href;
    link.textContent = url.href;
    byId('work-share-status').textContent = '';
    byId('work-share-qr-status').textContent = '';
    byId('work-share-qr').hidden = true;
    byId('work-share-native').hidden = typeof navigator.share !== 'function';
    if (!dialog.open) dialog.showModal();
    byId('work-share-copy').focus();
    try {
      const { qrcode } = await import('../../vendor/qrcode-generator/qrcode-2.0.4.mjs');
      if (token !== generation || !dialog.open) return;
      const qr = qrcode(0, 'M');
      qr.addData(url.href);
      qr.make();
      byId('work-share-qr').src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true }));
      byId('work-share-qr').hidden = false;
    } catch {
      if (token === generation && dialog.open) byId('work-share-qr-status').textContent = 'QRCode 暫時無法產生，仍可複製下方連結。';
    }
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target.closest?.('.dlg-close')) dialog.close();
  });
  dialog.addEventListener('close', () => { generation++; });
  byId('work-share-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareData.url);
      byId('work-share-status').textContent = '已複製作品連結';
    } catch {
      byId('work-share-status').textContent = '請長按或右鍵上方網址複製連結。';
    }
  });
  byId('work-share-native').addEventListener('click', async () => {
    try { await navigator.share(shareData); }
    catch (error) {
      if (error.name !== 'AbortError') byId('work-share-status').textContent = '暫時無法開啟分享，請複製作品連結。';
    }
  });
}
