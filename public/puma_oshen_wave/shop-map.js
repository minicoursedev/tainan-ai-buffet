const station = {lat:22.997137,lng:120.21295};

// Coordinates and shop information remain on this website; only base tiles are remote.
export function createShopMap({container, status, onSelect, onPositionsReady = () => {}}) {
  let userMarker, starMarker;
  let map, selected = null, loading, visibleIds = null, largeServiceMarkers = false;
  const markers = new Map(), positions = new Map(), visuals = new Map(), iconFactories = new Map();
  const filter = (ids, category = '') => {
    const useLargeMarkers = category === '洋流服務站';
    const resize = largeServiceMarkers !== useLargeMarkers;
    largeServiceMarkers = useLargeMarkers;
    visibleIds = new Set(ids);
    if (!map) return;
    for (const [id, marker] of markers) {
      if (resize) marker.setIcon(iconFactories.get(id)());
      if (visibleIds.has(id)) marker.addTo(map);
      else marker.remove();
    }
  };
  const focus = (id, {recenter = true} = {}) => {
    selected = id;
    if (!map) return;
    map.invalidateSize();
    const position = id ? positions.get(id) : station;
    if (position && recenter) map.panTo(position);
    for (const [shopId, marker] of markers) {
      marker.setZIndexOffset(shopId === id ? 1000 : 0);
      visuals.get(shopId).classList.toggle('is-selected', shopId === id);
    }
  };
  const locate = ({lat, lng}) => {
    if (!map) return false;
    focus(null);
    const position = {lat, lng};
    if (userMarker) userMarker.setLatLng(position);
    else userMarker = L.circleMarker(position, {
      radius:8, color:'#fff', weight:3, fillColor:'#009a50', fillOpacity:1
    }).addTo(map).bindTooltip('我的位置');
    map.setView(position, 16);
    return true;
  };
  const clearStar = () => {starMarker?.remove(); starMarker = null;};
  const showStar = (star, shop) => {
    if (!map) return;
    clearStar();
    starMarker = L.marker(star.latlng, {
      title:shop ? `幸運星：${shop.name}` : '幸運星', alt:'幸運星', zIndexOffset:2000,
      icon:L.divIcon({html:'<div class="osm-shop-pin lucky-star-pin">●</div>', className:'osm-marker', iconSize:[30,38], iconAnchor:[15,38]})
    }).addTo(map);
    map.invalidateSize();
    if (shop) starMarker.on('click', () => onSelect(shop));
    else if (!star.shopId) starMarker.on('click', () => {
      const destination = encodeURIComponent(`${star.latlng.lat},${star.latlng.lng}`);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`, '_blank', 'noopener,noreferrer');
    });
    map.setView(star.latlng, 16);
  };
  async function load(shops) {
    if (loading) return loading;
    loading = Promise.resolve().then(() => {
      if (!window.L) throw new Error('Leaflet unavailable');
      container.hidden = false;
      map = L.map(container, {center:station, zoom:13, scrollWheelZoom:false});
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom:19,
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
      }).addTo(map);
      tiles.on('tileerror', () => {
        status.hidden = false;
        status.textContent = '部分底圖暫時無法載入，仍可查看店家資訊或使用導航連結。';
      });
      for (const shop of shops) {
        const match = JSON.stringify(shop.sources || []).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        const position = (Number.isFinite(shop.latlng?.lat) && Number.isFinite(shop.latlng?.lng) ? shop.latlng : shop.coordinates)
          ?? (match ? {lat:Number(match[1]),lng:Number(match[2])} : null);
        if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)
            || Math.abs(position.lat)>90 || Math.abs(position.lng)>180) continue;
        positions.set(shop.id, position);
        const markerArtwork = {
          'tsai-li-ching-guoan-haidian': {file:'tsai-li-ching-marker-1-type-v1.webp', label:'① 蔡麗青', type:'第6選區市議員', blankTypeFooter:true, width:120, height:169},
          'chen-ting-fei-campaign-headquarters': {file:'chen-ting-fei-marker-3-type-v1.webp', label:'③ 陳亭妃', type:'市長候選人', height:135},
          'zenolai-campaign-headquarters': {file:'lai-jui-lung-marker-5-type-v1.webp', label:'⑤ 賴瑞隆', type:'高雄市長', blankTypeFooter:true, height:135},
          'lin-yi-ting-service-office': {file:'lin-yi-ting-marker-2-pink-v2.webp', label:'② 林依婷', type:'第9選區市議員', blankTypeFooter:true, width:120, height:169},
          'wayonly-service-office': {file:'chou-chia-wei-marker-7-type-v1.webp', label:'⑦ 周嘉韋', type:'第8選區市議員', blankTypeFooter:true, width:120, height:169},
          'teamshenchennan-service-office': {file:'shen-chen-nan-marker-11-type-v1.webp', label:'⑪ 沈震南', type:'第8選區市議員', blankTypeFooter:true, width:120, height:169},
          'shen-chia-feng-service-office': {file:'shen-chia-feng-marker-4-type-v1.webp', label:'④ 沈家鳳', type:'第1選區市議員', blankTypeFooter:true, width:120, height:169},
          'wang-hsuan-mao-service-office': {file:'wang-hsuan-mao-marker-6-type-v1.webp', label:'⑥ 王宣貿', type:'第1選區市議員', blankTypeFooter:true, width:120, height:169},
          'lee-tsung-han-service-office': {file:'lee-tsung-han-marker-7-type-v1.webp', label:'⑦ 李宗翰', type:'第1選區市議員', blankTypeFooter:true, width:120, height:169},
          'tsai-chiu-lan-service-office': {file:'tsai-chiu-lan-marker-2-type-v1.webp', label:'② 蔡秋蘭', type:'第2選區市議員', blankTypeFooter:true, width:120, height:169},
          'tsai-su-chiu-chin-service-office': {file:'tsai-su-chiu-chin-marker-3-type-v1.webp', label:'③ 蔡蘇秋金', type:'第2選區市議員', blankTypeFooter:true, width:120, height:169},
          'hsieh-shu-fan-service-office': {file:'hsieh-shu-fan-marker-5-type-v1.webp', label:'⑤ 謝舒凡', type:'第2選區市議員', blankTypeFooter:true, width:120, height:169},
          'wu-tung-lung-service-office': {file:'wu-tung-lung-marker-1-type-v1.webp', label:'① 吳通龍', type:'第3選區市議員', blankTypeFooter:true, width:120, height:169},
          'chen-chiu-hung-service-office': {file:'chen-chiu-hung-marker-2-type-v1.webp', label:'② 陳秋宏', type:'第3選區市議員', blankTypeFooter:true, width:120, height:169},
          'lai-mao-ching-service-office': {file:'lai-mao-ching-marker-1-type-v1.webp', label:'① 賴懋慶', type:'第4選區市議員', blankTypeFooter:true, width:120, height:169},
          'chen-pi-yu-service-office': {file:'chen-pi-yu-marker-1-type-v1.webp', label:'① 陳碧玉', type:'第5選區市議員', blankTypeFooter:true, width:120, height:169},
          'lee-wei-chih-service-office': {file:'lee-wei-chih-marker-4-type-v1.webp', label:'④ 李偉智', type:'第5選區市議員', blankTypeFooter:true, width:120, height:169},
          'lin-chih-chan-service-office': {file:'lin-chih-chan-marker-5-type-v1.webp', label:'⑤ 林志展', type:'第5選區市議員', blankTypeFooter:true, width:120, height:169},
          'yu-chu-ching-service-office': {file:'yu-chu-ching-marker-6-type-v1.webp', label:'⑥ 余柷青', name:'余柷青', type:'第5選區市議員', blankTypeFooter:true, width:120, height:169},
          'kuo-pin-chen-service-office': {file:'kuo-pin-chen-marker-7-type-v1.webp', label:'⑦ 郭品辰', type:'第6選區市議員', blankTypeFooter:true, width:120, height:169},
          'chu-cheng-hsuan-service-office': {file:'chu-cheng-hsuan-marker-5-type-v1.webp', label:'⑤ 朱正軒', type:'第7選區市議員', blankTypeFooter:true, width:120, height:169},
          'chen-chiu-ping-service-office': {file:'chen-chiu-ping-marker-8-type-v1.webp', label:'⑧ 陳秋萍', type:'第7選區市議員', blankTypeFooter:true, width:120, height:169},
          'huang-chao-hui-service-office': {file:'huang-chao-hui-marker-9-type-v1.webp', label:'⑨ 黄肇輝', type:'第7選區市議員', blankTypeFooter:true, width:120, height:169},
          'chiu-li-li-service-office': {file:'chiu-li-li-marker-5-type-v1.webp', label:'⑤ 邱莉莉', type:'第8選區市議員', blankTypeFooter:true, width:120, height:169},
          'lin-chien-nan-service-office': {file:'lin-chien-nan-marker-9-type-v1.webp', label:'⑨ 林建南', type:'第8選區市議員', blankTypeFooter:true, width:120, height:169},
          'lee-chi-wei-service-office': {file:'lee-chi-wei-marker-5-type-v1.webp', label:'⑤ 李啟維', type:'第9選區市議員', blankTypeFooter:true, width:120, height:169},
          'chou-li-chin-service-office': {file:'chou-li-chin-marker-6-type-v1.webp', label:'⑥ 周麗津', type:'第9選區市議員', blankTypeFooter:true, width:120, height:169},
          'lu-wei-yin-service-office': {file:'lu-wei-yin-marker-8-type-v1.webp', label:'⑧ 呂維胤', type:'第9選區市議員', blankTypeFooter:true, width:120, height:169},
          'tsai-hsiao-wei-service-office': {file:'tsai-hsiao-wei-marker-1-type-v1.webp', label:'① 蔡筱薇', type:'第10選區市議員', blankTypeFooter:true, width:120, height:169},
          'chen-chin-chung-service-office': {file:'chen-chin-chung-marker-2-type-v1.webp', label:'② 陳金鐘', type:'第10選區市議員', blankTypeFooter:true, width:120, height:169},
          'chen-huang-yu-service-office': {file:'chen-huang-yu-marker-7-type-v1.webp', label:'⑦ 陳皇宇', type:'第11選區市議員', blankTypeFooter:true, width:120, height:169},
          'kuo-hung-yi-service-office': {file:'kuo-hung-yi-marker-8-type-v1.webp', label:'⑧ 郭鴻儀', type:'第11選區市議員', blankTypeFooter:true, width:120, height:169},
          'cheng-chia-hsin-service-office': {file:'cheng-chia-hsin-marker-9-type-v1.webp', label:'⑨ 鄭佳欣', type:'第11選區市議員', blankTypeFooter:true, width:120, height:169}
        }[shop.id];
        const useGeneratedMarker = Boolean(markerArtwork);
        const badge = document.createElement('div');
        badge.className = useGeneratedMarker ? 'osm-artwork-pin' : 'osm-shop-pin';
        if (shop.verification === false) badge.classList.add('is-unverified');
        const scale = (shop.category === '洋流服務站' ? 1.15 : 1)
          * (shop.id === 'hexin-pharmacy' ? 1.15 : 1);
        const fullWidth = useGeneratedMarker ? (markerArtwork.width ?? 96) : 24 * scale;
        const fullHeight = useGeneratedMarker ? (markerArtwork.height ?? 114) : 30 * scale;
        let type, name;
        if (useGeneratedMarker) {
          const artwork = document.createElement('img');
          artwork.src = new URL(`./assets/${markerArtwork.file}`, import.meta.url).href;
          artwork.alt = markerArtwork.label;
          badge.append(artwork);
          if (markerArtwork.name) {
            name = document.createElement('span');
            name.className = 'osm-artwork-name';
            name.textContent = markerArtwork.name;
            badge.append(name);
          }
          if (typeof markerArtwork.type === 'string') {
            // Keep the type editable inside the original artwork's connected footer.
            type = document.createElement('span');
            type.className = 'osm-artwork-type';
            type.textContent = markerArtwork.type;
            if (markerArtwork.blankTypeFooter) type.style.background = 'transparent';
            badge.append(type);
          }
        } else if (shop.mapMarker?.image && shop.mapMarker?.label) {
          badge.classList.add('osm-portrait-pin');
          const portrait = document.createElement('img');
          portrait.src = shop.mapMarker.image;
          portrait.alt = shop.mapMarker.label;
          badge.append(portrait);
        } else badge.textContent = '●';
        const createIcon = () => {
          // Keep artwork proportions and its click target within the normal 24 × 30 pin size.
          const sizeScale = largeServiceMarkers ? .56 : Math.min(1, 24 / fullWidth, 30 / fullHeight);
          const width = fullWidth * sizeScale, height = fullHeight * sizeScale;
          badge.style.width = `${width}px`;
          badge.style.height = `${height}px`;
          if (name) name.style.fontSize = `${width * .2}px`;
          if (type) type.style.fontSize = `${Math.min(width * .14, width * .74 / Math.max([...markerArtwork.type].length, 1))}px`;
          return L.divIcon({html:badge, className:'osm-marker', iconSize:[width,height],iconAnchor:[width/2,height]});
        };
        const marker = L.marker(position, {
          title:shop.name, alt:shop.name,
          icon:createIcon()
        });
        marker.on('click', () => onSelect(shop));
        if (!visibleIds || visibleIds.has(shop.id)) marker.addTo(map);
        markers.set(shop.id, marker);
        visuals.set(shop.id, badge);
        iconFactories.set(shop.id, createIcon);
      }
      // Recompute layout when the mobile map panel becomes visible.
      const observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(container);
      onPositionsReady(new Map(positions));
        focus(selected);
      return true;
    }).catch(() => {
      map?.remove();
      map = null;
      container.hidden = true;
      status.hidden = false;
      status.textContent = '多店地圖暫時無法載入，請使用店家導航連結。';
      return false;
    });
    return loading;
  }
  return {load, focus, filter, locate, showStar, clearStar, get active(){return Boolean(map);}};
}
