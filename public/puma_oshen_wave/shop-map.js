const station = {lat:22.997137,lng:120.21295};

// Coordinates and shop information remain on this website; only base tiles are remote.
export function createShopMap({container, status, onSelect, onPositionsReady = () => {}}) {
  let userMarker, starMarker;
  let map, selected = null, loading, visibleIds = null;
  const markers = new Map(), positions = new Map(), visuals = new Map();
  const filter = ids => {
    visibleIds = new Set(ids);
    if (!map) return;
    for (const [id, marker] of markers) {
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
        const badge = document.createElement('div');
        badge.className = 'osm-shop-pin';
        if (shop.verification === false) badge.classList.add('is-unverified');
        const scale = shop.category === '洋流服務站' ? 1.15 : 1;
        const width = 24 * scale, height = 30 * scale;
        badge.style.width = `${width}px`;
        badge.style.height = `${height}px`;
        if (shop.mapMarker?.image && shop.mapMarker?.label) {
          badge.classList.add('osm-portrait-pin');
          const portrait = document.createElement('img');
          portrait.src = shop.mapMarker.image;
          portrait.alt = shop.mapMarker.label;
          badge.append(portrait);
        } else badge.textContent = '●';
        const marker = L.marker(position, {
          title:shop.name, alt:shop.name,
          icon:L.divIcon({html:badge, className:'osm-marker', iconSize:[width,height],iconAnchor:[width/2,height]})
        });
        marker.on('click', () => onSelect(shop));
        if (!visibleIds || visibleIds.has(shop.id)) marker.addTo(map);
        markers.set(shop.id, marker);
        visuals.set(shop.id, badge);
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
