const normalize = value => value.normalize('NFKC').toLocaleLowerCase('zh-TW').replaceAll('臺', '台').replace(/\s+/g, ' ').trim();

export function findShopsByName(shops, query) {
  const keyword = normalize(query);
  const active = shops.filter(shop => shop.disabled !== true);
  if (!keyword) return active;
  const words = keyword.split(' ');
  const rank = name => name === keyword ? 0 : name.startsWith(keyword) ? 1 : 2;
  return active.filter(shop => words.every(word => normalize(shop.name).includes(word)))
    .sort((a, b) => rank(normalize(a.name)) - rank(normalize(b.name)));
}

export function createShopSearch({form, getShops, onSearch, onSelect}) {
  const input = form.querySelector('input');
  const submit = form.querySelector('button');
  const list = form.querySelector('[role="listbox"]');
  const status = form.querySelector('[role="status"]');
  let matches = [], activeIndex = -1, composing = false;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }
  function activate(index) {
    activeIndex = index;
    [...list.children].forEach((option, i) => option.setAttribute('aria-selected', String(i === index)));
    const option = list.children[index];
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({block:'nearest'});
  }
  function select(shop) {
    input.value = shop.name;
    close();
    status.textContent = `已選擇 ${shop.name}`;
    onSelect(shop);
  }
  function suggest() {
    close();
    list.replaceChildren();
    if (composing || !input.value.trim()) { status.textContent = ''; return; }
    matches = findShopsByName(getShops(), input.value).slice(0, 8);
    for (const [index, shop] of matches.entries()) {
      const option = document.createElement('li');
      option.id = `${list.id}-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const name = document.createElement('strong'), address = document.createElement('small');
      name.textContent = shop.name;
      address.textContent = shop.address;
      option.append(name, address);
      option.addEventListener('click', () => select(shop));
      list.append(option);
    }
    status.textContent = matches.length ? `有 ${matches.length} 個店名建議，可用上下方向鍵選擇。` : '找不到符合的店名。';
    list.hidden = !matches.length;
    input.setAttribute('aria-expanded', String(matches.length > 0));
  }
  input.addEventListener('input', () => {
    suggest();
    if (!composing && !input.value) onSearch('');
  });
  input.addEventListener('focus', suggest);
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; suggest(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') close();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) suggest();
      if (list.hidden) return;
      event.preventDefault();
      const next = activeIndex < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
        : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
      activate(next);
    }
    if (event.key === 'Enter' && !list.hidden && activeIndex >= 0) {
      event.preventDefault();
      select(matches[activeIndex]);
    }
  });
  // Keep focus on the input until a mouse selection is handled; touch can still scroll.
  list.addEventListener('mousedown', event => event.preventDefault());
  form.addEventListener('focusout', event => {
    if (!form.contains(event.relatedTarget)) close();
  });
  document.addEventListener('pointerdown', event => {
    if (!form.contains(event.target)) close();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (composing || input.disabled) return;
    close();
    const count = onSearch(input.value.trim());
    status.textContent = `找到 ${count} 家店家。`;
  });
  return {
    enable() { input.disabled = submit.disabled = false; },
    clear() { input.value = ''; status.textContent = ''; close(); }
  };
}
