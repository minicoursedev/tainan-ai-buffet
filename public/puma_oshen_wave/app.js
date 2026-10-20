import {createShopMap} from './shop-map.js?v=20261020-location';
const byId = id => document.getElementById(id);
const origin = '22.997137,120.21295';
let shops = [], category = '', selectedId = null;
const shopMap = createShopMap({container:byId('all-shops-map'),status:byId('map-status'),onSelect:selectShopFromMap,onPositionsReady:sortByStationDistance});
// Great-circle distance; independent of the selected shop and category.
function distanceFromStation({lat, lng}) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(lat - 22.997137), dLng = radians(lng - 120.21295);
  const a = Math.sin(dLat/2)**2 + Math.cos(radians(22.997137))*Math.cos(radians(lat))*Math.sin(dLng/2)**2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1,a)));
}
function sortByStationDistance(positions) {
  for (const shop of shops) shop.stationDistance = positions.has(shop.id)
    ? distanceFromStation(positions.get(shop.id)) : Infinity;
  shops.sort((a,b) => (a.stationDistance-b.stationDistance) || a.name.localeCompare(b.name,'zh-Hant'));
  renderShops();
}
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function externalLink(text, url, className) {
  const a = node('a', text, className);
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function showMap(name, query, center = false) {
  shopMap.focus(center ? null : selectedId);
  byId('location-name').textContent = name;
}
function shopUrl(id) {
  const url = new URL(location.href);
  if (category) url.searchParams.set("category", category);
  else url.searchParams.delete("category");
  if (id) url.searchParams.set("shop", id);
  else url.searchParams.delete("shop");
  return url;
}
function restoreLinkedShop() {
  const params = new URL(location.href).searchParams;
  category = params.get('category') || '';
  const shop = shops.find(shop => shop.id === params.get('shop'));
  resetMap();
  renderCategories();
  renderShops();
  if (shop && (!category || shop.category === category)) selectShop(shop);
}
function locateMe() {
  const button = byId('home-map'), status = byId('map-status');
  const report = text => { status.hidden = false; status.textContent = text; };
  if (!navigator.geolocation) {
    report('此瀏覽器不支援定位，請使用手機瀏覽器開啟 HTTPS 網站。');
    return;
  }
  button.disabled = true;
  button.textContent = '定位中…';
  report('正在取得你的位置…');
  const finish = () => { button.disabled = false; button.textContent = '我的位置'; };
  navigator.geolocation.getCurrentPosition(async ({coords}) => {
    try {
      if (!await shopMap.load(shops)) {
        report('地圖暫時無法載入，請重新整理後再試。');
        return;
      }
      resetMap();
      setView(true);
      shopMap.locate({lat:coords.latitude, lng:coords.longitude});
      byId('location-name').textContent = '我的位置';
      report(`已定位，精確度約 ${Math.round(coords.accuracy)} 公尺`);
    } finally { finish(); }
  }, error => {
    const messages = {
      1:'尚未允許定位，請在瀏覽器或手機設定中允許位置存取後再試。',
      2:'暫時無法取得位置，請確認手機定位服務已開啟後再試。',
      3:'定位逾時，請移到訊號較佳的位置後再試。'
    };
    report(messages[error.code] || '定位失敗，請稍後再試。');
    finish();
  }, {enableHighAccuracy:true, timeout:15000, maximumAge:0});
}
function resetMap() {
  history.replaceState(null, "", shopUrl(null));
  selectedId = null;
  showShopList(false);
  showMap('台南火車站', origin, true);
  const text = node('div');
  text.append(node('h2','台南洋流店家地圖與導航'),node('p','在地圖上選擇店家，查看地址並規劃前往路線。'));
  byId('shop-detail').replaceChildren(node('div','↗','start-icon'),text);
  document.querySelectorAll('.shop-card').forEach(card=>card.setAttribute('data-selected','false'));
}
function selectShopFromMap(shop) {
  if (category && category !== shop.category) {
    category = '';
    renderCategories();
    renderShops();
  }
  selectShop(shop);

}
function selectShop(shop, openDetail = true) {
  selectedId = shop.id;
  history.replaceState(null, "", shopUrl(shop.id));
  document.querySelectorAll('.shop-card').forEach(card=>card.setAttribute('data-selected',String(card.dataset.shopId === shop.id)));
  const query = `${shop.address} ${shop.name}`;
  showMap(shop.name, query);
  const content = node('div',undefined,'detail-content');
  const heading = node('div',undefined,'detail-heading');
  heading.append(node('h2',shop.name));
  const bottom = node('div',undefined,'detail-bottom');
  const social = node('div',undefined,'socials');
  for (const [field,label] of [['facebook','Facebook'],['instagram','Instagram'],['threads','Threads']]) {
    try {
      const url = new URL(shop.social?.[field]);
      if(url.protocol === 'https:') social.append(externalLink(label+' ↗',url.href));
    } catch { /* Missing social accounts are intentionally omitted. */ }
  }
  if (!social.childElementCount) social.append(node('span','尚未提供社群連結'));
  bottom.append(social,externalLink('導航帶我去 ↗',`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=walking`,'directions'));
  content.append(heading,node('p',shop.address));
  const hoursText = shop.openingHours?.text?.trim();
  const hoursStatus = shop.openingHours?.status;
  if (hoursText && !['unknown', 'unverified'].includes(hoursStatus) &&
      (hoursStatus !== 'appointment' || /\d{1,2}[:：]\d{2}/.test(hoursText))) {
    const hours = node('section',undefined,'business-hours');
    hours.append(node('h3','營業時間'),node('p',hoursText,'hours-schedule'));
    if (shop.openingHours?.note) hours.append(node('p',shop.openingHours.note,'hours-note'));
    const hoursMeta = node('div',undefined,'hours-meta');
    if (shop.openingHours?.checkedAt) hoursMeta.append(node('span',`查核：${shop.openingHours.checkedAt}`));
    try {
      const source = new URL(shop.openingHours?.sources?.[0]);
      if(source.protocol === 'https:') hoursMeta.append(externalLink('查看時間來源 ↗',source.href));
    } catch { /* No confirmed opening-hours source available. */ }
    hours.append(hoursMeta,node('p','臨時公休與假日調整，請以店家公告為準。','hours-note'));
    content.append(hours);
  }
  if (shop.visitNote) content.append(node('p',shop.visitNote));
  const share = node('div', undefined, 'shop-share');
  const permalink = node('a', '本站店家連結 ↗');
  permalink.href = shopUrl(shop.id).href;
  const copy = node('button', '複製連結');
  copy.type = 'button';
  const status = node('span');
  status.setAttribute('role', 'status');
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(permalink.href);
      status.textContent = '已複製';
    } catch {
      status.textContent = '請長按或右鍵「本站店家連結」複製網址。';
    }
  };
  share.append(permalink, copy, status);
  content.append(bottom, share);
  const back = node('button','← 返回店家清單','back-to-shops');
  back.type='button';back.onclick=()=>showShopList();
  const toolbar = node('div',undefined,'shop-detail-toolbar');
  toolbar.append(back);
  if (shop.shopPhoto?.status === 'verified') {
    try {
      const photoUrl = new URL(shop.shopPhoto.url);
      if (photoUrl.protocol === 'https:') {
        const photo = node('img',undefined,'shop-avatar');
        photo.width = 64; photo.height = 64;
        photo.alt = `${shop.name} 社群頭像`;
        photo.referrerPolicy = 'no-referrer';
        photo.decoding = 'async';
        photo.onerror = () => photo.remove();
        photo.src = photoUrl.href;
        toolbar.append(photo);
      }
    } catch { /* An unavailable or invalid photo leaves the corner empty. */ }
  }
  const mapButton = node('button','查看這家店的地圖 ↗','detail-show-map');
  mapButton.type='button';mapButton.onclick=()=>setView(true);
  byId('shop-detail').replaceChildren(toolbar,content,mapButton);
  if (openDetail) {
    byId('shop-detail').hidden = false;
    byId('shop-list').hidden = true;
    document.querySelector('.shop-info-note').hidden = true;
    setView(false);
    const panel=document.querySelector('.shop-panel');
    if(panel.getBoundingClientRect().top < 0) panel.scrollIntoView({block:'start'});
    back.focus({preventScroll:true});
  }
}
function showShopList(restoreFocus = true) {
  byId('shop-detail').hidden = true;
  byId('shop-list').hidden = false;
  document.querySelector('.shop-info-note').hidden = false;
  if (restoreFocus) {
    const card=[...byId('shop-list').children].find(c=>c.dataset.shopId===selectedId);
    card?.querySelector('button')?.focus({preventScroll:true});
  }

}
function setView(map) {
  byId('map-area').classList.toggle('show-map',map);
  byId('list-view').setAttribute('aria-pressed',String(!map));
  byId('map-view').setAttribute('aria-pressed',String(map));
  if(map) { void shopMap.load(shops); shopMap.focus(selectedId); }
}
function renderCategories() {
  byId('category-toggle').textContent = `店別：${category || '全部店家'} ▾`;
  const labels = ['',...new Set(['咖啡廳','正餐','小吃','甜點飲料','烘焙','花店','日常生活','3C 通訊',...shops.map(s=>s.category).filter(c=>c!=='其它'),'其它'])];
  byId('category-filters').replaceChildren(...labels.map(value=>{
    const button=node('button',value || '全部店家','category-button');
    button.type='button';button.setAttribute('aria-pressed',String(value===category));
    button.onclick=()=>{category=value;resetMap();renderCategories();renderShops();byId('category-toggle').setAttribute('aria-expanded','false');};return button;
  }));
}
function renderShops() {
  const results=shops.filter(s=>!category||s.category===category);
  shopMap.filter(results.map(shop=>shop.id));
  if(selectedId&&!results.some(s=>s.id===selectedId)) resetMap();
  byId('result-count').textContent=`${results.length} 間店家`;
  const list=byId('shop-list');
  list.replaceChildren();
  if(!results.length) {
    const empty=node('div',undefined,'empty-state');
    empty.append(node('strong',shops.length?'還沒找到符合的店家':'店家名單準備中'),node('p',shops.length?'試試其他店別。':'店家加入後，就會出現在這裡。'));
    if(shops.length){const clear=node('button','清除篩選');clear.type='button';clear.onclick=()=>{category='';resetMap();renderCategories();renderShops();};empty.append(clear);}
    list.append(empty);return;
  }
  for(const shop of results){
    const card=node('article',undefined,'shop-card');card.dataset.shopId=shop.id;card.setAttribute('data-selected',String(shop.id===selectedId));
    const top=node('div',undefined,'shop-card-top');top.append(node('span',shop.category,'type-tag'));
    const bottom=node('button','查看店家資訊 ↗','shop-card-bottom');bottom.type='button';bottom.setAttribute('aria-label',`查看 ${shop.name} 的店家資訊`);bottom.onclick=()=>selectShop(shop);
    const summary=node('div',undefined,'shop-card-summary');
    const text=node('div',undefined,'shop-card-text');
    text.append(top,node('h3',shop.name),node('p',shop.address,'shop-address'));
    summary.append(text);
    if(shop.shopPhoto?.status==='verified') {
      try {
        const url=new URL(shop.shopPhoto.url);
        if(url.protocol==='https:') {
          const logoBox=node('div',undefined,'shop-card-logo');
          const logo=node('img');
          logo.alt=`${shop.name} Logo`;logo.loading='lazy';logo.decoding='async';logo.referrerPolicy='no-referrer';
          logo.onerror=()=>{logoBox.remove();summary.classList.remove('has-logo');};
          logo.src=url.href;logoBox.append(logo);summary.append(logoBox);summary.classList.add('has-logo');
        }
      } catch { /* Keep the full text width when no valid logo is available. */ }
    }
    card.append(summary,bottom);list.append(card);
  }
}
async function init(){
  try{
    const response=await fetch('https://raw.githubusercontent.com/minicoursedev/tainan-ai-buffet/main/public/puma_oshen_wave/stores.json', {cache:'no-cache'});if(!response.ok)throw new Error('Could not load shops');
    const data=await response.json();const ids=new Set();
    if(!Array.isArray(data.stores))throw new Error('Invalid shop list');
    for(const shop of data.stores){
      if(!['id','name','address','category'].every(key=>typeof shop[key]==='string'&&shop[key].trim())||ids.has(shop.id))throw new Error('Invalid shop record');
      ids.add(shop.id);
    }
    shops=data.stores.filter(shop=>shop.disabled!==true);renderCategories();renderShops();
    restoreLinkedShop();
    window.addEventListener("popstate", restoreLinkedShop);
    void shopMap.load(shops);
    byId('category-toggle').onclick=()=>{const b=byId('category-toggle');b.setAttribute('aria-expanded',String(b.getAttribute('aria-expanded')!=='true'));};
    byId('list-view').onclick=()=>setView(false);
    byId('map-view').onclick=()=>setView(true);
    byId('home-map').addEventListener('click',locateMe);
  }catch{
    byId('result-count').textContent='載入失敗';
    const error=node('div',undefined,'empty-state');error.append(node('strong','店家資料暫時無法載入'),node('p','請重新整理頁面再試一次。'));
    const retry=node('button','重新載入');retry.onclick=()=>location.reload();error.append(retry);byId('shop-list').replaceChildren(error);
  }
}
const contactDialog = byId('contact-dialog');
byId('contact-open').addEventListener('click', () => contactDialog.showModal());
contactDialog.addEventListener('click', event => {
  const rect = contactDialog.getBoundingClientRect();
  if (event.target === contactDialog &&
      (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) contactDialog.close();
});
init();
