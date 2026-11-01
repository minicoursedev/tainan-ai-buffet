export function wireFloatingNav() {
  const menu = document.getElementById('floating-nav');
  menu.addEventListener('click', event => {
    if (event.target.closest('.modes button, .plaque, .link-btn')) menu.open = false;
  });
  menu.addEventListener('change', event => { if (event.target.matches('select')) menu.open = false; });
  document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
  });
}
