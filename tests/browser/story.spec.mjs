import {test,expect} from '@playwright/test';

test('a second outage withdraws the first alternative and stale evidence cannot draw a path',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button',{name:'2 Close elevator 717'}).click();
  await expect(page.locator('.status-badge')).toHaveText('Another entrance to review');
  await expect(page.locator('.path-box')).toHaveCount(1);
  await expect(page.locator('.path-box')).toContainText('Revolution Dr');
  await expect(page.locator('.path-box')).toContainText('Elevator 718');
  await expect(page.locator('.path-box')).toContainText('Elevator 719');
  await expect(page.locator('.replay-banner')).toContainText('every alert in this result is invented');
  await page.getByRole('button',{name:'3 Also close 719'}).click();
  await expect(page.locator('.status-badge')).toHaveText('Closure affects this path');
  await expect(page.locator('.path-box')).toHaveCount(0);
  await page.getByRole('button',{name:'4 Expire the feed'}).click();
  await expect(page.locator('.status-badge')).toHaveText('Could not verify this path');
  await expect(page.locator('.path-box')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('two station legs persist and one saved journey checks both; labels remain text',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'+ Add this check to a saved journey'}).click();
  await page.getByRole('combobox',{name:'Station',exact:true}).selectOption('place-state');
  await page.getByRole('button',{name:'+ Add this check to a saved journey'}).click();
  const name='<img src=x onerror=alert(1)> Example';
  await page.getByLabel('Journey name').fill(name);
  await page.getByRole('button',{name:'Save journey',exact:true}).click();
  await expect(page.locator('#saved-list')).toContainText(name);
  await expect(page.locator('#saved-list img')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:name+' 2 station checks',exact:true}).click();
  await expect(page.locator('.check-card')).toHaveCount(2);
  await expect(page.locator('.check-card').first()).toContainText('Assembly');
  await expect(page.locator('.check-card').last()).toContainText('State');
});

test('boarding and exit directions send different endpoints and evidence is downloadable',async({page})=>{
  await page.goto('/');
  await page.getByRole('radio',{name:'Exiting'}).check();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/mcp') && r.request().postDataJSON()?.params?.name==='check_station_path');
  await page.getByRole('button',{name:'Check current reports'}).click();
  const report=(await (await responsePromise).json()).result.structuredContent;
  expect(report.checks[0].leg.fromId).toBe('70278');
  expect(report.checks[0].leg.toId).toBe('door-astao-foley');
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download evidence'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^liftcheck-replay-.*\.json$/);
  await expect(page.locator('.check-endpoints')).toContainText('Forest Hills → Foley St');
});

test('current-looking results expire on screen rather than remaining positive forever',async({page})=>{
  await page.clock.install();
  await page.goto('/');
  await page.route('**/mcp',async route=>{
    if (route.request().postDataJSON()?.params?.name !== 'check_station_path') return route.continue();
    const response=await route.fetch(),envelope=await response.json(),report=envelope.result.structuredContent;
    const now=Date.now();
    report.source={...report.source,mode:'live',complete:true,fetchedAt:new Date(now).toISOString(),validUntil:new Date(now+300_000).toISOString()};
    await route.fulfill({json:envelope});
  });
  await page.getByRole('button',{name:'Check current reports'}).click();
  await expect(page.locator('#source-pill')).toContainText('MBTA REPORTS');
  await page.clock.fastForward(310_000);
  await expect(page.locator('#source-pill')).toContainText('unavailable');
  await expect(page.locator('#expired-message')).toBeVisible();
  await expect(page.locator('#results')).toHaveClass('is-expired');
});

test('phone layout keeps controls usable and has no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'2 Close elevator 717'}).click();
  await expect(page.locator('.path-box')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/mobile.png',fullPage:true});
});
