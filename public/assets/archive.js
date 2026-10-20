// Refresh only the archive; the next gathering remains static HTML for SEO.
(() => {
  const list = document.querySelector('#archive .event-list');
  if (!list) return;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const card = event => `<article class="event-card" id="event-${escape(event.date)}">
    <div class="event-date"><time datetime="${escape(event.date)}">${escape(event.date.replaceAll('-', '.'))}</time><span class="event-status">歷次分享</span></div>
    <div class="event-body"><h3>${escape(event.title)}</h3><p>${escape(event.summary)}</p>
      <ul class="tags" aria-label="分享主題">${event.topics.map(topic => `<li>${escape(topic)}</li>`).join('')}</ul>
      <div class="event-actions">${event.slides && /^event\/\d{8}\/$/.test(event.slides) ? `<a class="button" data-ga-event="slides_click" data-content-id="${escape(event.date)}" data-placement="archive" href="${escape(event.slides)}" aria-label="閱讀 ${escape(event.title)} 簡報">閱讀簡報 <span aria-hidden="true">↗</span></a>` : ''}${event.registration && /^https:\/\//.test(event.registration) ? `<a class="text-link" href="${escape(event.registration)}">當場活動資訊（KKTIX） <span aria-hidden="true">↗</span></a>` : ''}<a class="text-link event-permalink" href="#event-${escape(event.date)}" aria-label="${escape(event.title)}的固定網址">活動網址 <span aria-hidden="true">#</span></a></div>
    </div>
  </article>`;
  fetch('data/events.json', { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw Error('Unable to load events');
      return response.json();
    })
    .then(events => {
      const past = events.filter(event => event.endsAt ? Date.parse(event.endsAt) <= Date.now() : event.status === 'past')
        .sort((a, b) => b.date.localeCompare(a.date));
      list.innerHTML = past.length ? past.map(card).join('\n') : '<p>歷次分享將收錄在這裡。</p>';
    })
    .catch(error => console.warn('保留既有歷次活動：', error));
})();
