(() => {
  if (window.minicourseAnalyticsLoaded) return;
  window.minicourseAnalyticsLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  const isOceanMap = /^\/puma_oshen_wave(?:\/|$)/.test(window.location.pathname);
  window.gtag('config', 'G-0NYJ6BX1XJ', {
    content_group: isOceanMap ? '台南洋流' : 'MiniCourse',
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-0NYJ6BX1XJ';
  document.head.appendChild(script);

  // Delegation also covers archive cards replaced after fetching current events.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[data-ga-event]');
    if (!link) return;
    const name = link.dataset.gaEvent;
    if (!['slides_click', 'skill_click', 'registration_click'].includes(name)) return;
    window.gtag('event', name, {
      content_id: link.dataset.contentId,
      placement: link.dataset.placement,
      transport_type: 'beacon',
    });
  });
})();
