'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || '_site');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const nonempty = (v,label) => assert.ok(typeof v==='string' && v.trim(),label);
const urls = (v,label) => { if (v) assert.ok(new URL(v).protocol==='https:',label); };
const html = read('trip/index.html');
const d = JSON.parse(read('trip/itinerary.json'));
for (const p of ['index.html','trip/index.html','socal/index.html']) {
  const source=read(p);
  assert.match(source, /<!doctype html>/i,p+' doctype');
  assert.match(source, /<title>[^<]+<\/title>/i,p+' title');
  if (p !== 'index.html') assert.match(source, /name=["']viewport["']/i,p+' viewport');
  for (const [i,m] of [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].entries()) {
    if (m[1].trim()) new vm.Script(m[1],{filename:p+':script'+i});
  }
}
assert.match(read('socal/index.html'), /url=\.\.\/trip\//i,'Shortcut points to trip');
const embedded=html.match(/const FALLBACK_DATA=([\s\S]*?);\s*const escapeHTML=/);
assert.ok(embedded,'Embedded offline data exists');
assert.deepEqual(JSON.parse(embedded[1]),d,'Fallback must match itinerary.json');
nonempty(d.title,'Title');
assert.ok(Array.isArray(d.days) && d.days.length>0,'At least one day');
assert.equal(new Set(d.days.map(x=>x.id)).size,d.days.length,'Unique day IDs');
for (const day of d.days) {
  const label=day.id;
  for (const key of ['id','date','title','overnight','hotel','hotelStatus']) nonempty(day[key],label+' '+key);
  for (const key of ['blocks','food','shopping','neighborhoods','shoppingStops','neighborhoodStops']) assert.ok(Array.isArray(day[key]),label+' '+key);
  if(day.hotelUrl) urls(day.hotelUrl,label+' hotel URL');
  assert.ok(day.weather && Number.isFinite(day.weather.lat) && Number.isFinite(day.weather.lon),label+' weather location');
  assert.match(day.weather.date,/^\d{4}-\d\d-\d\d$/);
  assert.match(day.weather.endDate,/^\d{4}-\d\d-\d\d$/);
  assert.ok(day.weather.date<=day.weather.endDate,label+' date range');
  for(const block of day.blocks) {nonempty(block.period,label+' period');assert.ok(Array.isArray(block.items));}
  for(const item of [...day.blocks.flatMap(x=>x.items),...day.food,...day.shoppingStops,...day.neighborhoodStops]) {
    nonempty(item.name,label+' stop name');
    if(item.map) nonempty(item.map,label+' map');
    if(item.url) urls(item.url,label+' stop URL');
    if(item.distance) {
      nonempty(item.distance.label,label+' distance');
      assert.ok(['published','estimate'].includes(item.distance.kind),label+' distance kind');
      nonempty(item.origin,label+' distance origin');nonempty(item.originLabel,label+' distance origin label');
      if(item.distance.source) urls(item.distance.source,label+' distance source');
    }
    if(item.review) {
      assert.ok(Number.isFinite(item.review.value) && item.review.value>0 && item.review.value<=5,label+' review');
      assert.ok(Number.isInteger(item.review.count) && item.review.count>=0,label+' review count');
      nonempty(item.review.source,label+' review source');urls(item.review.url,label+' review URL');
    }
  }
}
assert.ok(Array.isArray(d.routes)&&d.routes.length,'Routes');
for(const route of d.routes) {
  nonempty(route.day,'Route day');assert.ok(Array.isArray(route.legs)&&route.legs.length);
  for(const leg of route.legs) {
    for(const key of ['title','from','to']) nonempty(leg[key],'Route '+key);
    assert.ok(Array.isArray(leg.via),'Route waypoints');leg.via.forEach(x=>nonempty(x,'Waypoint'));
  }
}
assert.ok(Array.isArray(d.bookings)&&d.bookings.length,'Booking list');
assert.equal(new Set(d.bookings.map(x=>x.id)).size,d.bookings.length,'Unique booking IDs');
for(const b of d.bookings){nonempty(b.id,'Booking ID');nonempty(b.title,'Booking title');assert.ok(!Object.hasOwn(b,'price'),'Private reservation cost must not be published');}
assert.ok(!Object.hasOwn(d,'budget'),'Private budget must not be published');
for(const day of d.days){assert.ok(!Object.hasOwn(day,'price'),'Private hotel cost must not be published');for(const o of day.hotelOptions||[])assert.ok(!Object.hasOwn(o,'price'),'Hotel price must not be published');}
assert.doesNotMatch(JSON.stringify(d),/\$\s*\d/,'No monetary amounts in public itinerary');
assert.doesNotMatch(html,/cost-summary|function renderCosts\(/,'No budget UI');
for(const m of html.matchAll(/href="#([^"]+)"/g)) {
 if(m[1].includes('$'))continue;
 assert.ok(html.includes('id="'+m[1]+'"'),'Internal anchor #'+m[1]);
}
console.log('Static validation passed:',d.days.length,'days,',d.routes.length,'routes');
