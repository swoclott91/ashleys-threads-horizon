const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Liquid } = require(process.env.LIQUIDJS_PATH || 'liquidjs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const stylesheet = name => read(name).match(/{% stylesheet %}([\s\S]*?){% endstylesheet %}/)[1];
const engine = new Liquid({ root: ['snippets', 'blocks', 'sections'].map(dir => path.join(root, dir)), extname: '.liquid' });
for (const name of ['doc', 'schema', 'stylesheet']) {
  engine.registerTag(name, {
    parse(token, tokens) {
      while (tokens.length) if (tokens.shift().name === `end${name}`) return;
      throw new Error(`Missing end${name}`);
    },
    render() { return ''; }
  });
}
engine.registerTag('content_for', { parse() {}, render() { return ''; } });
engine.registerFilter('asset_url', name => `/assets/${name}`);
engine.registerFilter('inline_asset_content', name => read(`assets/${name}`));
engine.registerFilter('t', key => ({'actions.close':'Close menu','actions.back':'Back','accessibility.menu':'Menu'})[key] || key);

const link = (title, links = []) => ({title, handle: title.toLowerCase().replace(/\W+/g, '-'), url:`/collections/${title.toLowerCase().replace(/\W+/g, '-')}`, links});
const category = link('T-Shirts', [link('Cotton'), link('Performance')]);
const brands = [link('Bella Canvas'),link('Gildan'),link('Next Level')];
const menu = [category,link('Sweatshirts'),link('Tank Tops'),link('Polos'),link('Activewear'),link('Hats'),link('Bags'),link('Brands'),link('Sale'), ...Array.from({length:16},(_,i)=>link(`Collection ${i+1}`))];
const linklists = {'at-categories':{links:[category]}, brands:{links:brands}};
const settings = {menu:{links:menu}, at_categories_menu:'at-categories', at_brands_menu:'brands', at_mobile_drawer_label:'Shop', at_products_nav_mode:'top_level'};
const tokens = [...read('snippets/theme-styles-variables.liquid').matchAll(/(--[\w-]+):\s*([^;{}]+);/g)].filter(([,name,value]) => !value.includes('settings.') && !value.includes('}}') && !name.startsWith('--color-')).map(([,name,value]) => `${name}:${value};`).join('\n');
const fixtureCSS = `:root {${tokens}
 --color-background:white;--color-foreground:#222;--color-foreground-rgb:34 34 34;
 --drawer-animation-speed:.15s;--animation-easing:ease;--font-heading--family:Arial;
 --style-border-drawer:1px solid #bbb;--font-paragraph--family:Arial;
} body {font-family:Arial}.announcement {height:38px;background:#243e34;color:white;text-align:center;padding:10px}
.fixture-header {padding-block:12px;background:white}.fixture-header.contained {transform:translateZ(0)}
.fixture-row {display:flex;align-items:center;padding-inline:var(--page-margin);height:52px}
.fixture-row .header__icon--summary {width:44px;height:44px;padding:0}
.fixture-logo {margin:auto;font-size:18px}.at-panel__list-item {font-weight:600}
.fixture-outside {height:1800px} .fixture-tall .fixture-row {height:92px}`;

async function main() {
  const markup = await engine.renderFile('_at-menu', {variant:'mobile', block:{id:'test-menu',settings}, linklists});
  const data = await engine.renderFile('at-menu-data', {section:{settings:{}},linklists});
  const css = read('assets/base.css') + stylesheet('blocks/_at-menu.liquid') + fixtureCSS;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style>
  <script type="importmap">${JSON.stringify({imports:{'@theme/component':'/assets/component.js','@theme/utilities':'/assets/utilities.js','@theme/focus':'/assets/focus.js'}})}</script>
  <div class="announcement">Bulk Savings Start at $150</div><header id="header-component" class="fixture-header page-width-normal">
  <div class="header__row fixture-row">${markup}<span class="fixture-logo">Ashley’s Threads</span></div></header><main class="fixture-outside">Page content</main>`;
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://localhost');
    if(url.searchParams.has('section_id')) {res.setHeader('Content-Type','text/html');res.end(data);return;}
    if(url.pathname.startsWith('/assets/')) {
      const name = path.basename(url.pathname);
      const file = path.join(root,'assets',name);
      if(!fs.existsSync(file)) {res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(file));return;
    }
    res.setHeader('Content-Type','text/html');res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch(process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE,headless:true} : {headless:true});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const close = page.locator('.at-panel__toolbar .at-panel__close');
    const summary = page.locator('#at-menu-drawer-container > summary');
    const view = name => page.locator(`.at-panel__views > [data-view="${name}"]`);
    async function checkAnchor(label) {
      const [trigger,control] = await Promise.all([summary.boundingBox(),close.boundingBox()]);
      for (const key of ['x','y','width','height']) assert.ok(Math.abs(trigger[key]-control[key])<1,`${label}: close ${key} ${JSON.stringify({trigger,control})}`);
      assert.equal(await page.locator('at-menu-panel .at-panel__close').count(),1,`${label}: one persistent close`);
    }
    for(const scenario of [
      {width:375,height:812,contained:false},
      {width:390,height:844,contained:true},
      {width:749,height:844,contained:false},
      {width:719,height:390,contained:true,safeArea:34},
    ]) {
      await page.setViewportSize({width:scenario.width,height:scenario.height});
      await page.goto(origin);
      await page.evaluate(async () => {await customElements.whenDefined('at-menu-panel');await customElements.whenDefined('header-drawer');});
      if(scenario.contained) await page.locator('header').evaluate(el=>el.classList.add('contained'));
      if(scenario.safeArea) await page.evaluate(v=>document.documentElement.style.setProperty('--safe-area-inset-left',`${v}px`),scenario.safeArea);
      await summary.click();
      await page.waitForFunction(()=>document.querySelector('#at-menu-drawer-container').classList.contains('menu-open'));
      await page.waitForTimeout(180);
      await checkAnchor(`${scenario.width}px main`);
      if(process.env.SCREENSHOT_DIR && scenario.width===390) await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'at-menu-main.png')});
      const gutter = await view('main').locator('.at-panel__item').first().evaluate(el=>getComputedStyle(el).paddingInlineStart);
      assert.equal(parseFloat(gutter),scenario.safeArea || 16,'theme page gutter');
      const body = view('main').locator('.at-panel__body');
      await body.evaluate(el=>el.scrollTop=el.scrollHeight);
      await checkAnchor('scrolled navigation');
      await body.evaluate(el=>el.scrollTop=0);
      await page.locator('[data-target="cat-t-shirts"]').click();
      await checkAnchor('during navigation');
      await page.waitForFunction(()=>document.querySelector('[data-view="main"]').hidden);
      await checkAnchor('category');
      if(process.env.SCREENSHOT_DIR && scenario.width===390) await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'at-menu-category.png')});
      assert.equal(await page.locator('.at-panel__views > [data-view="cat-t-shirts"]').count(),1,'lazy category mounts below toolbar');
      for (const selector of ['.at-products__columns','.at-products__featured']) {
        const padding = await view('cat-t-shirts').locator(selector).evaluate(el=>getComputedStyle(el).paddingInlineStart);
        assert.equal(padding,gutter,'category content uses the page gutter');
      }
      await view('cat-t-shirts').locator('.at-panel__back').click();
      await page.waitForFunction(()=>!document.querySelector('[data-view="main"]').hidden && document.querySelector('[data-view="cat-t-shirts"]').hidden);
      await page.locator('[data-target="brands"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-view="main"]').hidden);
      await checkAnchor('brands');
      const brandPadding = await view('brands').locator('.at-brands-dir__columns').evaluate(el=>getComputedStyle(el).paddingInlineStart);
      assert.equal(brandPadding,gutter,'brand directory uses the page gutter');
      if(process.env.SCREENSHOT_DIR && scenario.width===390) await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'at-menu-brands.png')});
      await page.locator('.at-panel__search').fill('Gildan');
      assert.equal(await view('brands').locator('.at-brands-dir__link:visible').count(),1,'brand filter');
      await page.locator('header').evaluate(el=>el.classList.add('fixture-tall'));
      await page.waitForTimeout(80);
      await checkAnchor('header resize');
      await page.setViewportSize({width:scenario.width-15,height:scenario.height-30});
      await page.waitForTimeout(80);
      await checkAnchor('viewport resize');
      const bounds = await page.locator('.menu-drawer').boundingBox();
      assert.ok(bounds.y+bounds.height<=scenario.height-29,'drawer fits available viewport');
      await close.click();
      await page.waitForFunction(()=>!document.querySelector('#at-menu-drawer-container').open);
      assert.equal(await summary.getAttribute('aria-expanded'),'false');
      await summary.click();
      await page.waitForTimeout(180);
      assert.equal(await view('main').isVisible(),true,'reopens on main view');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('#at-menu-drawer-container').open);
    }
    assert.deepEqual(errors,[],'no browser errors');
    console.log('PASS: mobile gutters, close-button anchoring, scroll, lazy category navigation, back, brands search, header/viewport resize, close/reopen and Escape in four viewport scenarios.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exit(1)});
