(() => {
  const body = document.getElementById('friends-events');
  if (!body) return;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  fetch('/data/friends.json', { cache: 'no-cache' })
    .then(response => {
      if (!response.ok) throw Error('Loading failed');
      return response.json();
    })
    .then(events => {
      const visible = events
        .filter(event => !event.endsAt || Date.parse(event.endsAt) > Date.now())
        .sort((a, b) => Date.parse(b.sortDate) - Date.parse(a.sortDate));
      body.innerHTML = visible.map(event => `<tr>
        <td>${escape(event.organizer)}<span class="example-label">${escape(event.contact)}</span></td>
        <td><span class="format-tag${event.format === '線上' ? ' online' : ''}">${escape(event.format)}</span><span class="venue">${escape(event.location)}</span><span class="example-label">${escape(event.locationNote)}</span></td>
        <td>${event.dates.map(escape).join('<br>')}<span class="event-hours">${escape(event.hours)}</span><span class="example-label">${escape(event.note)}</span></td>
        <td><a class="friend-event-name" href="${escape(event.url)}">${escape(event.title)} ↗</a><span class="example-label">${escape(event.description)}</span></td>
      </tr>`).join('') || '<tr><td colspan="4">目前沒有近期活動。</td></tr>';
    })
    .catch(error => console.warn('保留建置時的友站活動：', error));
})();
