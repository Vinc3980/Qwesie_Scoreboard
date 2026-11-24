import { chromium } from '@playwright/test';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const matchId = process.env.MATCH_ID || '';
const court = process.env.COURT || '1';
const urls = (process.env.URLS || [
  `/out/court/${court}/scorebug`,
  `/out/court/${court}/graphics`,
  '/overlay/scorebug',
  ...(matchId ? [`/broadcast/${matchId}/scorebug`, `/broadcast/${matchId}/graphics?debug=1`] : []),
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
for (const u of urls) {
  const errs = [];
  p.removeAllListeners('console');
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
  const target = u.startsWith('http') ? u : base.replace(/\/$/, '') + u;
  await p.goto(target, { waitUntil: 'domcontentloaded' }).catch(e => console.log('GOTO FAIL', target, e.message));
  await p.waitForTimeout(3500);
  const info = await p.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 240);
    const consoleNav = !!document.querySelector('aside, nav');
    const setMatch = (document.body.innerText.match(/SET\s+\d+/) || [])[0] || null;
    const debugChip = (document.body.innerText.match(/OFFLINE|STALE|LIVE r\d+/) || [])[0] || null;
    return { bodyClass: document.body.className, bg: getComputedStyle(document.body).backgroundColor, consoleNav, setMatch, debugChip, txt };
  });
  console.log('\n== ' + target);
  console.log(JSON.stringify(info));
  if (errs.length) console.log('errors:', errs.slice(0, 3));
}
await b.close();
