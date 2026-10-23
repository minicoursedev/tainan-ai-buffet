// Deterministic first-level rules. Rendering, browser input and audio live in game.js.
export const WORLD = { width: 1536, height: 1024, ground: 746, speed: 255 };
export const STATIONS = [
  { id: 'orchard', x: 220, name: '果園', kind: 'mango', color: '#eaa642' },
  { id: 'fish', x: 570, name: '魚塭', kind: 'fish', color: '#46a8c1' },
  { id: 'cold', x: 1000, name: '預冷站', color: '#6bbdae' },
  { id: 'market', x: 1370, name: '市場', color: '#ed8674' },
];
export const OBSTACLES = [{ x: 402, width: 46, height: 35 }, { x: 1180, width: 46, height: 35 }];
export const CARGO_NAMES = { mango: '芒果', fish: '魚貨' };
export function createState() {
  return {
    status: 'ready', seconds: 150, x: 100, y: WORLD.ground, vy: 0, facing: 1,
    cargo: [], stock: { mango: 2, fish: 2 }, delivered: [], battery: 2,
    cooling: 0, energyUsed: 0, nextId: 1,
    message: '從果園或魚塭領貨，每次最多帶兩箱。', messageTime: 4,
    event: null, revision: 0, lossReason: '',
  };
}
export function restartState() { return createState(); }
export function start(state) {
  if (state.status === 'ready') { state.status = 'running'; state.revision++; }
}
export function togglePause(state) {
  if (state.status === 'running') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'running';
  state.revision++;
}
export function nearestStation(state) {
  if (Math.abs(state.y - WORLD.ground) > 10) return null;
  return STATIONS.find(station => Math.abs(state.x - station.x) < 94) || null;
}
function message(state, value, event = 'notice') {
  state.message = value; state.messageTime = 4; state.event = event; state.revision++;
}
export function actionHint(state) {
  if (state.cooling > 0) return `預冷中，還需 ${Math.ceil(state.cooling)} 秒`;
  const station = nearestStation(state);
  if (!station) return '靠近站點後按 E 互動';
  if (station.kind) {
    if (!state.stock[station.kind]) return `${station.name}貨物已領完`;
    if (state.cargo.length >= 2) return '背包已滿，先去市場交貨';
    return `領取一箱${CARGO_NAMES[station.kind]}（剩 ${state.stock[station.kind]} 箱）`;
  }
  if (station.id === 'cold') {
    if (!state.cargo.length) return '先領取貨物，再來預冷';
    if (state.cargo.every(c => c.cooled)) return '貨物已完成預冷';
    if (!state.battery) return '本關預冷電力已用完';
    return '預冷背包貨物（3 秒／1 格電力）';
  }
  return state.cargo.length ? `交付背包的 ${state.cargo.length} 箱貨物` : '市場等待你的貨物';
}
export function objective(state) {
  if (state.cooling > 0) return '預冷不會恢復鮮度，只會降低後續損耗。';
  if (state.cargo.length === 2) return state.cargo.some(c => !c.cooled) && state.battery ? '背包滿了 → 可先預冷，再送往市場。' : '背包滿了 → 前往最右側市場交貨。';
  if (state.stock.mango + state.stock.fish === 0) return '最後一趟 → 將剩餘貨物送到市場。';
  return '配送目標：芒果 2 箱＋魚貨 2 箱；背包最多 2 箱。';
}
export function interact(state) {
  if (state.status !== 'running' || state.cooling > 0) return;
  const station = nearestStation(state);
  if (!station) { message(state, '先走近站點，再按互動。'); return; }
  if (station.kind) {
    if (!state.stock[station.kind] || state.cargo.length >= 2) { message(state, actionHint(state)); return; }
    state.cargo.push({ id: state.nextId++, kind: station.kind, freshness: 100, cooled: false });
    state.stock[station.kind]--;
    message(state, `已領取一箱${CARGO_NAMES[station.kind]}。`, 'pickup');
  } else if (station.id === 'cold') {
    if (!state.cargo.length || state.cargo.every(c => c.cooled) || !state.battery) { message(state, actionHint(state)); return; }
    state.cooling = 3; state.battery--; state.energyUsed++;
    message(state, '預冷開始，請稍候 3 秒。', 'cool');
  } else if (state.cargo.length) {
    const count = state.cargo.length;
    state.delivered.push(...state.cargo.map(cargo => ({ ...cargo })));
    state.cargo = [];
    if (state.delivered.length === 4) {
      state.status = 'won'; message(state, '四箱貨物全部送達！', 'win');
    } else message(state, `已送達 ${count} 箱；回去領取剩餘貨物。`, 'deliver');
  } else message(state, '背包是空的，先到果園或魚塭領貨。');
}
export function tick(state, dt, input = {}) {
  if (state.status !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  // Respect exact cooling completion even when a test advances several seconds.
  const active = Math.min(dt, state.seconds);
  const wasCooling = state.cooling;
  state.seconds = Math.max(0, state.seconds - active);
  state.messageTime = Math.max(0, state.messageTime - active);
  for (const cargo of state.cargo) {
    const rate = cargo.kind === 'fish' ? 1.5 : 0.95;
    const uncooledSeconds = cargo.cooled ? 0 : Math.min(active, wasCooling > 0 ? wasCooling : active);
    const cooledSeconds = active - uncooledSeconds;
    cargo.freshness = Math.max(0, cargo.freshness - rate * (uncooledSeconds + cooledSeconds * 0.25));
  }
  if (state.cooling > 0) {
    state.cooling = Math.max(0, state.cooling - active);
    if (!state.cooling) {
      state.cargo.forEach(cargo => { cargo.cooled = true; });
      message(state, '預冷完成！後續鮮度損耗降為四分之一。', 'cooldone');
    }
  } else {
    const direction = Math.sign(input.move || 0);
    if (input.jump && state.y >= WORLD.ground) { state.vy = -620; state.event = 'jump'; }
    if (direction) state.facing = direction;
    const previousX = state.x;
    let nextX = Math.max(55, Math.min(WORLD.width - 55, state.x + direction * WORLD.speed * active));
    for (const obstacle of OBSTACLES) {
      if (state.y > WORLD.ground - obstacle.height) {
        const left = obstacle.x - 22, right = obstacle.x + obstacle.width + 22;
        if (previousX <= left && nextX > left) nextX = left;
        if (previousX >= right && nextX < right) nextX = right;
      }
    }
    state.x = nextX;
    state.vy += 1650 * active;
    state.y = Math.min(WORLD.ground, state.y + state.vy * active);
    if (state.y === WORLD.ground) state.vy = 0;
  }
  if (state.cargo.some(cargo => cargo.freshness <= 0)) {
    state.status = 'lost'; state.lossReason = '有貨物鮮度降到 0%。試試提早預冷，並縮短配送路線。';
    message(state, '貨物鮮度耗盡。', 'lose');
  } else if (state.seconds <= 0) {
    state.status = 'lost'; state.lossReason = '150 秒配送時間結束。善用每次兩箱的背包空間，再挑戰一次。';
    message(state, '配送時間結束。', 'lose');
  }
}
