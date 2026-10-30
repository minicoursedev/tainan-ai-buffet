const station = {lat:22.997137,lng:120.21295};

// Coordinates and shop information remain on this website; only base tiles are remote.
export function createShopMap({container, status, onSelect, onPositionsReady = () => {}}) {
  let userMarker, starMarker, markerCluster, selectedMarker;
  let map, selected = null, loading, visibleIds = null, largeServiceMarkers = false;
  const markers = new Map(), positions = new Map(), visuals = new Map(), iconFactories = new Map();
  const serviceStationIds = new Set();
  const syncMarkers = () => {
    selectedMarker?.remove();
    selectedMarker = null;
    markerCluster.clearLayers();
    const clustered = [];
    for (const [id, marker] of markers) {
      if (visibleIds && !visibleIds.has(id)) continue;
      if (!largeServiceMarkers && serviceStationIds.has(id)) continue;
      // Keep the chosen shop visible without changing the user's zoom level.
      if (id === selected) selectedMarker = marker.addTo(map);
      else clustered.push(marker);
    }
    markerCluster.addLayers(clustered);
  };
  const filter = (ids, category = '') => {
    const useLargeMarkers = category === '洋流服務站';
    const resize = largeServiceMarkers !== useLargeMarkers;
    largeServiceMarkers = useLargeMarkers;
    visibleIds = new Set(ids);
    if (!map) return;
    if (resize) for (const [id, marker] of markers) marker.setIcon(iconFactories.get(id)());
    syncMarkers();
  };
  const focus = (id, {recenter = true} = {}) => {
    const changed = selected !== id;
    selected = id;
    if (!map) return;
    map.invalidateSize();
    if (changed) syncMarkers();
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
      markerCluster = L.markerClusterGroup({
        maxClusterRadius:45,
        showCoverageOnHover:false,
        spiderfyDistanceMultiplier:1.8,
        iconCreateFunction:cluster => {
          const count = cluster.getChildCount();
          const label = document.createElement('span');
          label.textContent = count;
          label.setAttribute('aria-label', `${count} 間店家，點擊展開`);
          label.title = `${count} 間店家，點擊展開`;
          return L.divIcon({html:label, className:'osm-cluster', iconSize:[44,44]});
        }
      }).addTo(map);
      for (const shop of shops) {
        const match = JSON.stringify(shop.sources || []).match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        const position = (Number.isFinite(shop.latlng?.lat) && Number.isFinite(shop.latlng?.lng) ? shop.latlng : shop.coordinates)
          ?? (match ? {lat:Number(match[1]),lng:Number(match[2])} : null);
        if (!position || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)
            || Math.abs(position.lat)>90 || Math.abs(position.lng)>180) continue;
        positions.set(shop.id, position);
        if (shop.category === '洋流服務站') serviceStationIds.add(shop.id);
        const markerArtwork = {
          'hsiao-chih-yuan-heshun-service-office': {file:'hexin-pharmacy-marker-1-green-v1.webp', label:'① 蕭智元', type:'和順里里長', blankTypeFooter:true, width:120, height:169},
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
          'cheng-chia-hsin-service-office': {file:'cheng-chia-hsin-marker-9-type-v1.webp', label:'⑨ 鄭佳欣', type:'第11選區市議員', blankTypeFooter:true, width:120, height:169},
          "taoyuan-yu-xin-xian-service-office": {"file":"taoyuan-yu-xin-xian-marker-2-type-v1.webp","label":"② 余信憲","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-huang-qiong-hui-service-office": {"file":"taoyuan-huang-qiong-hui-marker-7-type-v1.webp","label":"⑦ 黃瓊慧","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-huang-jia-qi-service-office": {"file":"taoyuan-huang-jia-qi-marker-10-type-v1.webp","label":"⑩ 黃家齊","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-li-guang-da-service-office": {"file":"taoyuan-li-guang-da-marker-15-type-v1.webp","label":"⑮ 李光達","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-li-zong-hao-service-office": {"file":"taoyuan-li-zong-hao-marker-3-type-v1.webp","label":"③ 李宗豪","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-chen-ya-lun-service-office": {"file":"taoyuan-chen-ya-lun-marker-9-type-v1.webp","label":"⑨ 陳雅倫","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-xu-jia-rui-service-office": {"file":"taoyuan-xu-jia-rui-marker-2-type-v1.webp","label":"② 許家睿","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-lu-lin-xiao-feng-service-office": {"file":"taoyuan-lu-lin-xiao-feng-marker-7-type-v1.webp","label":"⑦ 呂林小鳳","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-xu-qing-shun-service-office": {"file":"taoyuan-xu-qing-shun-marker-2-type-v1.webp","label":"② 許清順","type":"第4選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-you-wu-he-service-office": {"file":"taoyuan-you-wu-he-marker-1-type-v1.webp","label":"① 游吾和","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-chen-zhi-wen-service-office": {"file":"taoyuan-chen-zhi-wen-marker-2-type-v1.webp","label":"② 陳治文","type":"第6選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-peng-jun-hao-service-office": {"file":"taoyuan-peng-jun-hao-marker-1-type-v1.webp","label":"① 彭俊豪","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-wei-yun-service-office": {"file":"taoyuan-wei-yun-marker-4-type-v1.webp","label":"④ 魏筠","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-zhang-xiao-yun-service-office": {"file":"taoyuan-zhang-xiao-yun-marker-5-type-v1.webp","label":"⑤ 張曉昀","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-huang-chong-zhen-service-office": {"file":"taoyuan-huang-chong-zhen-marker-16-type-v1.webp","label":"⑯ 黃崇真","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-liu-ren-zhao-service-office": {"file":"taoyuan-liu-ren-zhao-marker-7-type-v1.webp","label":"⑦ 劉仁照","type":"第8選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-wang-pei-yu-service-office": {"file":"taoyuan-wang-pei-yu-marker-8-type-v1.webp","label":"⑧ 王珮毓","type":"第8選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-zheng-shu-fang-service-office": {"file":"taoyuan-zheng-shu-fang-marker-2-type-v1.webp","label":"② 鄭淑方","type":"第9選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-chen-rui-sheng-service-office": {"file":"taoyuan-chen-rui-sheng-marker-1-type-v1.webp","label":"① 陳睿生","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taoyuan-lin-zhi-qiang-service-office": {"file":"taoyuan-lin-zhi-qiang-marker-1-type-v1.webp","label":"① 林志強","type":"第13選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-shi-zhi-chang-service-office": {"file":"taichung-shi-zhi-chang-marker-4-type-v1.webp","label":"④ 施志昌","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-yang-dian-zhong-service-office": {"file":"taichung-yang-dian-zhong-marker-4-type-v1.webp","label":"④ 楊典忠","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-wang-li-ren-service-office": {"file":"taichung-wang-li-ren-marker-6-type-v1.webp","label":"⑥ 王立任","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-zhang-jia-an-service-office": {"file":"taichung-zhang-jia-an-marker-2-type-v1.webp","label":"② 張家銨","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-ceng-wei-service-office": {"file":"taichung-ceng-wei-marker-4-type-v1.webp","label":"④ 曾威","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-cai-yi-xuan-service-office": {"file":"taichung-cai-yi-xuan-marker-3-type-v1.webp","label":"③ 蔡怡萱","type":"第4選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-xie-zhi-zhong-service-office": {"file":"taichung-xie-zhi-zhong-marker-7-type-v1.webp","label":"⑦ 謝志忠","type":"第4選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-xiao-long-ze-service-office": {"file":"taichung-xiao-long-ze-marker-6-type-v1.webp","label":"⑥ 蕭隆澤","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-zhou-yong-hong-service-office": {"file":"taichung-zhou-yong-hong-marker-9-type-v1.webp","label":"⑨ 周永鴻","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-lin-qi-feng-service-office": {"file":"taichung-lin-qi-feng-marker-1-type-v1.webp","label":"① 林祈烽","type":"第6選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-chen-shu-hua-service-office": {"file":"taichung-chen-shu-hua-marker-3-type-v1.webp","label":"③ 陳淑華","type":"第6選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-zhang-yao-zhong-service-office": {"file":"taichung-zhang-yao-zhong-marker-2-type-v1.webp","label":"② 張耀中","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-he-wen-hai-service-office": {"file":"taichung-he-wen-hai-marker-3-type-v1.webp","label":"③ 何文海","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-xie-jia-yi-service-office": {"file":"taichung-xie-jia-yi-marker-8-type-v1.webp","label":"⑧ 謝家宜","type":"第8選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-chen-yu-rong-service-office": {"file":"taichung-chen-yu-rong-marker-4-type-v1.webp","label":"④ 陳俞融","type":"第9選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-huang-shou-da-service-office": {"file":"taichung-huang-shou-da-marker-1-type-v1.webp","label":"① 黃守達","type":"第10選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-jiang-zhao-guo-service-office": {"file":"taichung-jiang-zhao-guo-marker-4-type-v1.webp","label":"④ 江肇國","type":"第10選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-chen-ya-hui-service-office": {"file":"taichung-chen-ya-hui-marker-3-type-v1.webp","label":"③ 陳雅惠","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-zheng-gong-jin-service-office": {"file":"taichung-zheng-gong-jin-marker-5-type-v1.webp","label":"⑤ 鄭功進","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-he-yi-ling-service-office": {"file":"taichung-he-yi-ling-marker-6-type-v1.webp","label":"⑥ 何翊綾","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-cai-yao-xie-service-office": {"file":"taichung-cai-yao-xie-marker-1-type-v1.webp","label":"① 蔡耀頡","type":"第12選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-zhang-yu-yan-service-office": {"file":"taichung-zhang-yu-yan-marker-5-type-v1.webp","label":"⑤ 張玉嬿","type":"第12選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-li-tian-sheng-service-office": {"file":"taichung-li-tian-sheng-marker-1-type-v1.webp","label":"① 李天生","type":"第13選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-lin-de-yu-service-office": {"file":"taichung-lin-de-yu-marker-5-type-v1.webp","label":"⑤ 林德宇","type":"第13選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "taichung-zhang-fen-yu-service-office": {"file":"taichung-zhang-fen-yu-marker-9-type-v1.webp","label":"⑨ 張芬郁","type":"第13選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-lin-fu-bao-service-office": {"file":"kaohsiung-lin-fu-bao-marker-5-type-v1.webp","label":"⑤ 林富寶","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-huang-ming-tai-service-office": {"file":"kaohsiung-huang-ming-tai-marker-3-type-v1.webp","label":"③ 黃明太","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-chen-lin-jie-service-office": {"file":"kaohsiung-chen-lin-jie-marker-4-type-v1.webp","label":"④ 陳琳潔","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-huang-qiu-ying-service-office": {"file":"kaohsiung-huang-qiu-ying-marker-5-type-v1.webp","label":"⑤ 黃秋媖","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-lin-zhi-cheng-service-office": {"file":"kaohsiung-lin-zhi-cheng-marker-6-type-v1.webp","label":"⑥ 林志誠","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-huang-wen-zhi-service-office": {"file":"kaohsiung-huang-wen-zhi-marker-1-type-v1.webp","label":"① 黃文志","type":"第4選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-li-ya-hui-service-office": {"file":"kaohsiung-li-ya-hui-marker-6-type-v1.webp","label":"⑥ 李雅慧","type":"第4選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-huang-fei-feng-service-office": {"file":"kaohsiung-huang-fei-feng-marker-1-type-v1.webp","label":"① 黃飛鳳","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-zhang-sheng-fu-service-office": {"file":"kaohsiung-zhang-sheng-fu-marker-3-type-v1.webp","label":"③ 張勝富","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-jiang-rui-hong-service-office": {"file":"kaohsiung-jiang-rui-hong-marker-4-type-v1.webp","label":"④ 江瑞鴻","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-qiu-jun-xian-service-office": {"file":"kaohsiung-qiu-jun-xian-marker-5-type-v1.webp","label":"⑤ 邱俊憲","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-jian-huan-zong-service-office": {"file":"kaohsiung-jian-huan-zong-marker-1-type-v1.webp","label":"① 簡煥宗","type":"第6選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-li-qiao-ru-service-office": {"file":"kaohsiung-li-qiao-ru-marker-2-type-v1.webp","label":"② 李喬如","type":"第6選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-he-quan-feng-service-office": {"file":"kaohsiung-he-quan-feng-marker-1-type-v1.webp","label":"① 何權峰","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-kang-yu-cheng-service-office": {"file":"kaohsiung-kang-yu-cheng-marker-8-type-v1.webp","label":"⑧ 康裕成","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-zheng-meng-ru-service-office": {"file":"kaohsiung-zheng-meng-ru-marker-9-type-v1.webp","label":"⑨ 鄭孟洳","type":"第7選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-tang-yong-yu-service-office": {"file":"kaohsiung-tang-yong-yu-marker-4-type-v1.webp","label":"④ 湯詠瑜","type":"第8選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-huang-wen-yi-service-office": {"file":"kaohsiung-huang-wen-yi-marker-5-type-v1.webp","label":"⑤ 黃文益","type":"第8選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kuo-chien-meng-service-office": {"file":"kaohsiung-guo-jian-meng-marker-9-type-v1.webp","label":"⑨ 郭建盟","type":"第8選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-lin-zhi-hong-service-office": {"file":"kaohsiung-lin-zhi-hong-marker-1-type-v1.webp","label":"① 林智鴻","type":"第9選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-zhang-han-zhong-service-office": {"file":"kaohsiung-zhang-han-zhong-marker-2-type-v1.webp","label":"② 張漢忠","type":"第9選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-chen-hui-wen-service-office": {"file":"kaohsiung-chen-hui-wen-marker-5-type-v1.webp","label":"⑤ 陳慧文","type":"第9選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-zheng-guang-feng-service-office": {"file":"kaohsiung-zheng-guang-feng-marker-7-type-v1.webp","label":"⑦ 鄭光峰","type":"第10選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-li-yu-ting-service-office": {"file":"kaohsiung-li-yu-ting-marker-5-type-v1.webp","label":"⑤ 李雨庭","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-zhang-yao-zhong-service-office": {"file":"kaohsiung-zhang-yao-zhong-marker-6-type-v1.webp","label":"⑥ 張耀中","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "kaohsiung-zhang-yao-zhong-service-office-linyuan": {"file":"kaohsiung-zhang-yao-zhong-marker-6-type-v1.webp","label":"⑥ 張耀中","type":"第11選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "miaoli-xu-ying-ping-service-office": {"file":"miaoli-xu-ying-ping-marker-3-type-v1.webp","label":"③ 許櫻萍","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "miaoli-xu-xiao-jing-service-office": {"file":"miaoli-xu-xiao-jing-marker-5-type-v1.webp","label":"⑤ 徐筱菁","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "miaoli-luo-gui-xing-service-office": {"file":"miaoli-luo-gui-xing-marker-2-type-v1.webp","label":"② 羅貴星","type":"第2選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "miaoli-weng-jie-service-office": {"file":"miaoli-weng-jie-marker-1-type-v1.webp","label":"① 翁杰","type":"第3選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "miaoli-qiu-yu-xing-service-office": {"file":"miaoli-qiu-yu-xing-marker-6-type-v1.webp","label":"⑥ 邱毓興","type":"第4選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "miaoli-chen-guang-xuan-service-office": {"file":"miaoli-chen-guang-xuan-marker-6-type-v1.webp","label":"⑥ 陳光軒","type":"第5選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-huang-rong-jun-service-office": {"file":"chiayi-county-huang-rong-jun-marker-1-type-v1.webp","label":"① 黃榮俊","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-huang-rong-li-service-office": {"file":"chiayi-county-huang-rong-li-marker-2-type-v1.webp","label":"② 黃榮利","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-jiang-pei-ye-service-office": {"file":"chiayi-county-jiang-pei-ye-marker-4-type-v1.webp","label":"④ 江佩曄","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-huang-hui-ru-service-office": {"file":"chiayi-county-huang-hui-ru-marker-7-type-v1.webp","label":"⑦ 黃惠汝","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-lin-xiu-qin-service-office": {"file":"chiayi-county-lin-xiu-qin-marker-6-type-v1.webp","label":"⑥ 林秀琴","type":"第2選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-huang-qi-hao-service-office": {"file":"chiayi-county-huang-qi-hao-marker-9-type-v1.webp","label":"⑨ 黃啟豪","type":"第2選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-lin-shu-wan-service-office": {"file":"chiayi-county-lin-shu-wan-marker-14-type-v1.webp","label":"⑭ 林淑完","type":"第2選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-jiang-zhi-ming-service-office": {"file":"chiayi-county-jiang-zhi-ming-marker-3-type-v1.webp","label":"③ 江志明","type":"第3選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-zhuang-xin-zong-service-office": {"file":"chiayi-county-zhuang-xin-zong-marker-7-type-v1.webp","label":"⑦ 莊信宗","type":"第3選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-chen-yi-yue-service-office": {"file":"chiayi-county-chen-yi-yue-marker-6-type-v1.webp","label":"⑥ 陳怡岳","type":"第4選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-weng-cong-xian-service-office": {"file":"chiayi-county-weng-cong-xian-marker-1-type-v1.webp","label":"① 翁聰賢","type":"第5選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-chen-bai-lin-service-office": {"file":"chiayi-county-chen-bai-lin-marker-2-type-v1.webp","label":"② 陳柏麟","type":"第6選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-luo-shi-yang-service-office": {"file":"chiayi-county-luo-shi-yang-marker-5-type-v1.webp","label":"⑤ 羅士洋","type":"第6選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-county-jiang-ji-zhen-service-office": {"file":"chiayi-county-jiang-ji-zhen-marker-8-type-v1.webp","label":"⑧ 江季珍","type":"第6選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-li-shi-bin-service-office": {"file":"pingtung-li-shi-bin-marker-10-type-v1.webp","label":"⑩ 李世斌","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-fang-yi-xiang-service-office": {"file":"pingtung-fang-yi-xiang-marker-16-type-v1.webp","label":"⑯ 方一祥","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-huang-jian-yi-service-office": {"file":"pingtung-huang-jian-yi-marker-5-type-v1.webp","label":"⑤ 黃建溢","type":"第3選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-li-ba-kui-service-office": {"file":"pingtung-li-ba-kui-marker-6-type-v1.webp","label":"⑥ 利八魁","type":"第3選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-xu-zhan-wei-service-office": {"file":"pingtung-xu-zhan-wei-marker-3-type-v1.webp","label":"③ 許展維","type":"第4選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-liu-meng-jun-service-office": {"file":"pingtung-liu-meng-jun-marker-6-type-v1.webp","label":"⑥ 劉孟君","type":"第4選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-fang-wen-zheng-service-office": {"file":"pingtung-fang-wen-zheng-marker-8-type-v1.webp","label":"⑧ 方文正","type":"第4選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-luo-ping-dao-service-office": {"file":"pingtung-luo-ping-dao-marker-3-type-v1.webp","label":"③ 羅平道","type":"第5選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-zhou-bi-yun-service-office": {"file":"pingtung-zhou-bi-yun-marker-4-type-v1.webp","label":"④ 周碧雲","type":"第5選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "pingtung-pan-fang-quan-service-office": {"file":"pingtung-pan-fang-quan-marker-4-type-v1.webp","label":"④ 潘芳泉","type":"第6選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "yilan-lin-li-service-office": {"file":"yilan-lin-li-marker-4-type-v1.webp","label":"④ 林麗","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "yilan-lin-shi-ying-service-office": {"file":"yilan-lin-shi-ying-marker-3-type-v1.webp","label":"③ 林詩穎","type":"第2選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "yilan-xie-jia-lun-service-office": {"file":"yilan-xie-jia-lun-marker-3-type-v1.webp","label":"③ 謝家倫","type":"第6選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "yilan-lu-hui-qing-service-office": {"file":"yilan-lu-hui-qing-marker-4-type-v1.webp","label":"④ 呂惠卿","type":"第6選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "yilan-lin-pei-ying-service-office": {"file":"yilan-lin-pei-ying-marker-2-type-v1.webp","label":"② 林佩螢","type":"第8選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "taitung-huang-zhi-wei-service-office": {"file":"taitung-huang-zhi-wei-marker-2-type-v1.webp","label":"② 黃治維","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "taitung-jian-wei-guo-service-office": {"file":"taitung-jian-wei-guo-marker-13-type-v1.webp","label":"⑬ 簡維國","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "penghu-su-yu-de-service-office": {"file":"penghu-su-yu-de-marker-7-type-v1.webp","label":"⑦ 蘇育德","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "kinmen-cai-qi-yong-service-office": {"file":"kinmen-cai-qi-yong-marker-4-type-v1.webp","label":"④ 蔡其雍","type":"第1選區縣議員","blankTypeFooter":true,"width":120,"height":169},
          "hsinchu-zheng-mei-juan-service-office": {"file":"hsinchu-zheng-mei-juan-marker-13-type-v1.webp","label":"⑬ 鄭美娟","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "hsinchu-shi-nai-ru-service-office": {"file":"hsinchu-shi-nai-ru-marker-4-type-v1.webp","label":"④ 施乃如","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "hsinchu-chen-jian-ming-service-office": {"file":"hsinchu-chen-jian-ming-marker-1-type-v1.webp","label":"① 陳建名","type":"第3選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "hsinchu-yang-ling-yi-service-office": {"file":"hsinchu-yang-ling-yi-marker-7-type-v1.webp","label":"⑦ 楊玲宜","type":"第4選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "hsinchu-lin-ying-che-service-office": {"file":"hsinchu-lin-ying-che-marker-8-type-v1.webp","label":"⑧ 林盈徹","type":"第5選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-city-huang-lu-hui-service-office": {"file":"chiayi-city-huang-lu-hui-marker-3-type-v1.webp","label":"③ 黃露慧","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-city-huang-ying-zhi-service-office": {"file":"chiayi-city-huang-ying-zhi-marker-6-type-v1.webp","label":"⑥ 黃盈智","type":"第1選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-city-lin-wei-xuan-service-office": {"file":"chiayi-city-lin-wei-xuan-marker-4-type-v1.webp","label":"④ 林煒軒","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169},
          "chiayi-city-ceng-yi-hao-service-office": {"file":"chiayi-city-ceng-yi-hao-marker-15-type-v1.webp","label":"⑮ 曾奕豪","type":"第2選區市議員","blankTypeFooter":true,"width":120,"height":169}
        }[shop.id];
        const useGeneratedMarker = Boolean(markerArtwork);
        const badge = document.createElement('div');
        badge.className = useGeneratedMarker ? 'osm-artwork-pin' : 'osm-shop-pin';
        if (shop.verification === false) badge.classList.add('is-unverified');
        const scale = shop.category === '洋流服務站' ? 1.15 : 1;
        const legislatorMarker = ['wang-ting-yu-xinfeng-service-office', 'wang-ting-yu-east-service-office', 'letsgolin-service-office'].includes(shop.id);
        const fullWidth = useGeneratedMarker ? (markerArtwork.width ?? 96) : legislatorMarker ? 120 : 24 * scale;
        const fullHeight = useGeneratedMarker ? (markerArtwork.height ?? 114) : legislatorMarker ? 169 : 30 * scale;
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
        markers.set(shop.id, marker);
        visuals.set(shop.id, badge);
        iconFactories.set(shop.id, createIcon);
      }
      syncMarkers();
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
