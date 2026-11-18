'use strict';
const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(process.argv[2]||'_site');
const data=JSON.parse(fs.readFileSync(path.join(root,'trip/itinerary.json'),'utf8'));
const server=http.createServer((req,res)=>{
  try{
    let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(p.endsWith('/'))p+='index.html';
    let file=path.resolve(root,'.'+p);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    if(fs.statSync(file).isDirectory()){res.writeHead(302,{Location:p+'/'});return res.end();}
    const type=file.endsWith('.json')?'application/json':file.endsWith('.html')?'text/html; charset=utf-8':'text/plain';
    res.writeHead(200,{'Content-Type':type});fs.createReadStream(file).pipe(res);
  }catch(e){res.writeHead(404);res.end('Not found');}
});
const errors=[];
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
   const page=await browser.newPage({viewport});
   page.on('pageerror',e=>errors.push(e.message));
   await page.route(/^https?:\/\/(?!127\.0\.0\.1:)/,route=>{
    if(route.request().url().startsWith('https://api.open-meteo.com/')){
     const dates=[...new Set(data.days.flatMap(d=>[d.weather.date,d.weather.endDate]))];
     const n=dates.length;
     return route.fulfill({json:{daily:{time:dates,weather_code:Array(n).fill(0),temperature_2m_max:Array(n).fill(70),temperature_2m_min:Array(n).fill(52),precipitation_probability_max:Array(n).fill(10)}},headers:{'Access-Control-Allow-Origin':'*'}});
    }
    return route.abort();
   });
   let response=await page.goto(base+'/socal/');
   assert.equal(response.status(),200);
   await page.waitForURL('**/trip/');
   await page.locator('#day-view h2').waitFor();
   assert.equal(await page.getByRole('tab').count(),data.days.length);
   for(let i=0;i<data.days.length;i++){
    await page.getByRole('tab').nth(i).click();
    await page.waitForFunction(title=>document.querySelector('#day-view h2')?.textContent===title,data.days[i].title);
    await page.locator('#day-weather .weather-box').waitFor();
    assert.equal(await page.locator('#day-tabs [aria-selected="true"]').count(),1);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No page horizontal overflow for '+data.days[i].id);
    const food=page.locator('details.fold').filter({has:page.locator('summary',{hasText:'Food options'})});
    if(data.days[i].food.length){
     await food.locator('summary').click();
     assert.equal(await food.locator('.stop').count(),data.days[i].food.length);
     assert.ok(await food.locator('.review').count()>0,'Review rendered');
     assert.ok(await food.locator('.distance').count()>0,'Distance rendered');
    }
   }
   await page.locator('[data-page="driving"]').click();
   await page.locator('#driving').waitFor();
   assert.equal(await page.locator('#route-list details').count(),data.routes.length);
   await page.locator('[data-page="bookings"]').click();
   await page.locator('#bookings').waitFor();
   assert.equal(await page.locator('#booking-list input').count(),data.bookings.length);
   assert.equal(await page.locator('#cost-summary').count(),0,'No budget panel');
   assert.doesNotMatch(await page.locator('#bookings').innerText(),/\$\s*\d/,'No reservation prices');
   await page.locator('[data-page="areas"]').click();
   await page.locator('#areas').waitFor();
   await page.locator('[data-page="itinerary"]').click();
   await page.locator('#day-view').waitFor();
   await page.getByRole('tab').first().click();
   await page.waitForFunction(()=>document.querySelector('#day-weather')?.textContent.includes('Open-Meteo'));
   await page.close();
  }

  // Network failures: the embedded itinerary and saved forecast must still render.
  const offline=await browser.newPage({viewport:{width:390,height:844}});
  offline.on('pageerror',e=>errors.push(e.message));
  await offline.route('**/itinerary.json*',r=>r.abort());
  await offline.route('https://api.open-meteo.com/**',r=>r.abort());
  await offline.goto(base+'/trip/');
  await offline.locator('#day-view h2').waitFor();
  await offline.getByRole('tab').first().click();
  assert.equal(await offline.locator('#day-view h2').textContent(),data.days[0].title);
  await offline.waitForFunction(()=>document.querySelector('#day-weather')?.textContent.includes('NWS'));
  await offline.close();

  // Protect the existing Seattle homepage without relying on third-party assets.
  const home=await browser.newPage();
  await home.route(/^https?:\/\/(?!127\.0\.0\.1:)/,r=>r.abort());
  const res=await home.goto(base+'/');
  assert.equal(res.status(),200);
  assert.match(await home.title(),/Seattle/);
  await home.close();
  assert.deepEqual(errors,[],'No uncaught page errors');
  console.log('Mobile, desktop, route navigation, ratings, weather and fallback smoke tests passed.');
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
