// 休市 screen: shown instead of the market once the opening period is over.
import { visitedCount } from '../state.js';
import { lastOpenLabel } from '../schedule.js';

// the hall entrance with its shutter down, a 本場休市 sign, the owner bowing beside a 謝謝光臨 board
const SCENE = `
<svg class="cl-scene" viewBox="0 0 560 330" role="img" aria-label="會場的鐵捲門拉下來了，門口掛著本場休市的牌子，設計師在旁邊鞠躬">
  <defs>
    <pattern id="cl-tone" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="var(--ink)"/></pattern>
    <pattern id="cl-tone2" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.6" fill="var(--ink)"/></pattern>
  </defs>
  <g stroke="var(--ink)" stroke-opacity=".16" stroke-width="1.4">
    ${Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2, r0 = 92, r1 = 420;
      return `<line x1="${(280 + Math.cos(a) * r0).toFixed(1)}" y1="${(92 + Math.sin(a) * r0 * 0.6).toFixed(1)}" x2="${(280 + Math.cos(a) * r1).toFixed(1)}" y2="${(92 + Math.sin(a) * r1 * 0.6).toFixed(1)}"/>`;
    }).join('')}
  </g>
  <g fill="none" stroke="var(--ink)" stroke-linejoin="round" stroke-linecap="round">
    <rect x="50" y="36" width="460" height="244" fill="var(--paper)" stroke-width="3"/>
    <path d="M50 36h460M50 50h460" stroke-width="1.6"/>
    <path d="${Array.from({ length: 19 }, (_, i) => `M${50 + i * 24} 36l12 14l12-14`).join('')}" stroke-width="1.6"/>
    <rect x="104" y="104" width="352" height="176" fill="url(#cl-tone)" stroke-width="3"/>
    <path d="${Array.from({ length: 13 }, (_, i) => `M104 ${116 + i * 13}h352`).join('')}" stroke-width="1.6"/>
    <rect x="104" y="268" width="352" height="12" fill="var(--ink)"/>
    <rect x="262" y="250" width="36" height="10" rx="3" fill="var(--paper)" stroke-width="2"/>
    <path d="M220 50v26M340 50v26" stroke-width="1.8"/>
    <rect x="186" y="79" width="194" height="58" rx="10" fill="var(--ink)"/>
    <rect x="182" y="75" width="194" height="58" rx="10" fill="var(--pink-soft)" stroke-width="3"/>
    <path d="M20 280h520" stroke-width="3"/>
    <rect x="20" y="282" width="520" height="40" fill="url(#cl-tone2)" stroke="none"/>
    <path d="M68 278l14-58h44l14 58M82 220h44" stroke-width="2.4" fill="var(--paper)"/>
    <path d="M86 226h36v34H86z" fill="var(--paper)" stroke-width="2"/>
    <g transform="translate(472 278) rotate(-28)">
      <path d="M-6 0v-14M6 0v-14" stroke-width="2.4"/>
      <rect x="-13" y="-38" width="26" height="26" rx="7" fill="url(#cl-tone)" stroke-width="2.4"/>
      <rect x="-13" y="-38" width="26" height="26" rx="7" stroke-width="2.4"/>
      <circle cx="0" cy="-52" r="14" fill="var(--paper)" stroke-width="2.4"/>
      <path d="M-13.5 -53a13.5 13.5 0 0 1 27 0c-5 -1 -8 -4 -9 -7c-4 5 -11 7 -18 7z" fill="var(--ink)" stroke-width="1.5"/>
      <path d="M-5 -46q2 1.5 4 0M3 -46q2 1.5 4 0" stroke-width="1.6"/>
    </g>
    <path d="M492 226q6-8 2-16M500 232q9-10 4-22" stroke-width="1.6"/>
  </g>
  <g font-family="'Noto Sans TC', system-ui, sans-serif" fill="var(--ink)" text-anchor="middle">
    <text x="279" y="114" font-size="30" font-weight="900" letter-spacing="4">本場休市</text>
    <text x="104" y="240" font-size="11" font-weight="900">謝謝</text>
    <text x="104" y="254" font-size="11" font-weight="900">光臨</text>
  </g>
</svg>`;

export function showClosed() {
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  document.body.classList.add('is-closed');
  const n = visitedCount();
  const last = lastOpenLabel();
  let main = document.getElementById('stage-closed');
  if (!main) {
    main = document.createElement('main');
    main.id = 'stage-closed';
    main.className = 'closed';
    document.querySelector('.app').append(main);
  }
  main.innerHTML = `
    <div class="cl-wrap">
      ${SCENE}
      <h1 class="cl-title">本場已休市</h1>
      <p class="cl-text">${last ? `宜蘭暖流市集開到 ${last}，已經收攤了。` : '宜蘭暖流市集已經收攤了。'}謝謝你來逛。</p>
      ${n ? `<p class="cl-count">你這次一共逛了 <b>${n.toLocaleString('zh-TW')}</b> 攤。</p>` : ''}
    </div>`;
  for (const id of ['stage-walk', 'stage-list', 'stage-map']) { const el = document.getElementById(id); if (el) el.hidden = true; }
}
