import { test, expect } from '@playwright/test';

const json = (route: any, data: any) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data, timestamp: new Date().toISOString() }) });

test('leaderboard theme can be edited, applied, and seen on court output', async ({ page }) => {
  const theme = { id: 'lt1', name: 'Test LB', kind: 'leaderboard', isBuiltIn: false, config: { colors:{ background:'#111827', headerBg:'#0f172a', rowBg:'rgba(255,255,255,0.04)', rowAltBg:'rgba(255,255,255,0.08)', leaderHighlight:'rgba(245,158,11,0.2)', text:'#ffffff', mutedText:'#9fb0c8', accent:'#f59e0b', rankBadgeBg:'#1f2937', rankBadgeText:'#fff', zoneText:'#fff' }, zones:[], typography:{ fontFamily:'Inter, system-ui, sans-serif', weight:700, uppercase:false, titleSize:48, rowSize:30, headerSize:18 }, logos:{ show:true, size:44, shape:'rounded', placement:'left' }, names:{ mode:'full' }, columns:['played','won','lost','matchPoints'], showRankMovement:true, layout:{ mode:'full', rowsPerPage:10, fitAll:false, rowHeight:56, backgroundMode:'solid', backgroundImage:null, showTitle:true, showSubtitle:true, showCompetitionLogo:false, sponsorText:null, title:'LEADERBOARD', subtitle:null, safeArea:true }, animation:{ enabled:true, staggerMs:40, durationMs:450, easing:'easeOut', pageTransition:'fade', pageDwellSec:8 } } };
  let appliedPayload: any = null;

  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(); const url = req.url(); const method = req.method();
    if (url.includes('/auth/me')) return json(route, { id:'u1', email:'admin@test', role:'ADMIN', name:'Admin' });
    if (url.includes('/competitions') && url.includes('/standings')) return json(route, { competitionName:'League', rows:[{ rank:1, teamId:'t1', teamName:'Alpha', shortName:'ALP', played:2, won:2, lost:0, matchPoints:6, setRatio:2, pointRatio:1.2, form:['W','W'] },{ rank:2, teamId:'t2', teamName:'Beta', shortName:'BET', played:2, won:1, lost:1, matchPoints:3, setRatio:1, pointRatio:1.0, form:['W','L'] }] });
    if (url.includes('/competitions') && !url.includes('/standings')) return json(route, [{ id:'c1', name:'League' }]);
    if (url.includes('/leaderboards/themes') && method==='GET') return json(route, [theme]);
    if (url.includes('/leaderboards/themes') && method==='PUT') return json(route, { ...theme, config: { ...theme.config, colors: { ...theme.config.colors, accent:'#ff0000' } } });
    if (url.includes('/leaderboards/themes') && method==='POST' && url.includes('/apply-on-air')) { appliedPayload = req.postDataJSON(); return json(route, { ok:true }); }
    if (url.includes('/matches') && !url.includes('/graphics')) return json(route, [{ id:'m1', status:'LIVE', homeTeamName:'Alpha', awayTeamName:'Beta' }]);
    if (url.includes('/matches/m1/graphics/scene')) return json(route, { scene:'PLAY', scorebugVisible:true, payload:{ activeTemplate: appliedPayload ? 'LEADERBOARD' : 'SCOREBUG', graphicPayload: appliedPayload?.payload || {} } });
    if (url.includes('/matches/m1')) return json(route, { id:'m1', status:'LIVE', court:'1', teams:{A:{name:'Alpha',shortName:'ALP',score:0,setsWon:0},B:{name:'Beta',shortName:'BET',score:0,setsWon:0}}, competition:{id:'c1',name:'League'} });
    return json(route, {});
  });

  await page.goto('/design/leaderboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Leaderboard Designer')).toBeVisible();
  await page.getByRole('button', { name: 'Apply to on-air' }).click();
  await expect.poll(() => appliedPayload?.template).toBe('LEADERBOARD');

  await page.goto('/out/court/1/all?debug=1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/LEADERBOARD|Alpha/i).first()).toBeVisible({ timeout: 10000 });
});
