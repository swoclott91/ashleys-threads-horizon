const mobile = window.matchMedia('(max-width: 749px)');
const observed = new WeakSet();

function fit(nav) {
  nav.removeAttribute('data-mobile-expanded');
  if (!mobile.matches || nav.dataset.mobileDisplay !== 'auto') return;

  const measurement = nav.cloneNode(true);
  measurement.setAttribute('aria-hidden', 'true');
  measurement.setAttribute('data-mobile-expanded', '');
  measurement.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:max-content';
  nav.before(measurement);
  const gap = parseFloat(getComputedStyle(measurement.querySelector('ol')).columnGap) || 0;
  const width = measurement.getBoundingClientRect().width;
  measurement.remove();
  if (width <= nav.clientWidth - gap) nav.setAttribute('data-mobile-expanded', '');
}

const observer = new ResizeObserver(entries => entries.forEach(({ target }) => fit(target)));
function connect() {
  document.querySelectorAll('.at-breadcrumbs').forEach(nav => {
    if (observed.has(nav)) return;
    observed.add(nav);
    observer.observe(nav);
    fit(nav);
  });
}

connect();
document.addEventListener('shopify:section:load', connect);
document.addEventListener('shopify:section:unload', event => {
  event.target.querySelectorAll('.at-breadcrumbs').forEach(nav => observer.unobserve(nav));
});
mobile.addEventListener('change', () => document.querySelectorAll('.at-breadcrumbs').forEach(fit));
document.fonts.ready.then(() => document.querySelectorAll('.at-breadcrumbs').forEach(fit));
