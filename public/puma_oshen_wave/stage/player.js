// The YouTube API is only needed for continuous playback's ended event.
let youtubeReady;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeReady) return youtubeReady;
  youtubeReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    const previous = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(fail, 15000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      window.onYouTubeIframeAPIReady = previous;
      reject(new Error('YouTube API unavailable'));
    }
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      previous?.();
      resolve(window.YT);
    };
    script.onerror = fail;
    document.head.append(script);
  }).catch(error => { youtubeReady = null; throw error; });
  return youtubeReady;
}

export function mountPlayer(container, video, {
  title, continuous = false, onEnded = () => {}, onError = () => {}, onBlocked = () => {}, onPlaying = () => {},
} = {}) {
  let alive = true, youtube = null;
  const active = fn => (...args) => { if (alive) fn(...args); };
  let element;
  if (video.type === 'youtube') {
    element = document.createElement('iframe');
    element.title = title;
    element.referrerPolicy = 'strict-origin-when-cross-origin';
    element.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
    element.allowFullscreen = true;
    const url = new URL(video.embed);
    if (continuous) {
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('origin', location.origin);
    }
    element.src = url.href;
    container.append(element);
    if (continuous) loadYouTube().then(YT => {
      if (!alive) return;
      youtube = new YT.Player(element, { events: {
        onReady: active(event => event.target.playVideo()),
        onStateChange: active(event => {
          if (event.data === YT.PlayerState.ENDED) onEnded();
          if (event.data === YT.PlayerState.PLAYING) onPlaying();
        }),
        onError: active(onError),
        onAutoplayBlocked: active(onBlocked),
      } });
    }).catch(active(onError));
  } else {
    element = document.createElement('video');
    element.controls = true;
    element.playsInline = true;
    element.preload = 'metadata';
    element.src = video.url;
    element.addEventListener('error', active(onError));
    element.addEventListener('ended', active(onEnded));
    element.addEventListener('playing', active(onPlaying));
    container.append(element);
    if (continuous) element.play().catch(active(onBlocked));
  }
  return () => {
    alive = false;
    if (youtube) youtube.destroy();
    if (video.type === 'file') { element.pause(); element.removeAttribute('src'); element.load(); }
    element.remove();
  };
}
