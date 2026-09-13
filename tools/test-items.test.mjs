import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareItems} from './test-items.mjs';
const box=(id,name,description)=>({id,name,description:[description],classification:'explicit-custom-section'});
test('builds exact box contents from an agreed name and matching description',()=>{
 const r=prepareItems([box(32105,'10 Elunium Box','กล่องที่บรรจุ 10 Eluniuims เอาไว้')],new Set([985]),new Set([603]));
 assert.deepEqual(r.ready.map(i=>({id:i.id,content:i.content,amount:i.amount})),[{id:32105,content:985,amount:10}]);
});
test('contradictory Oridecon description is withheld',()=>{const r=prepareItems([box(32112,'10 Oridecon Box','กล่องที่บรรจุ 10 Eluniuims เอาไว้')],new Set([984,985]),new Set([603]));assert.equal(r.ready.length,0);assert.match(r.pending[0].reason,/contradictory/);});
test('existing ID collision never overwrites the server item',()=>assert.throws(()=>prepareItems([box(32105,'10 Elunium Box','10 Eluniuims')],new Set([985,32105]),new Set([603])),/collision/));
test('missing box contents or client icon prevent publication',()=>{assert.throws(()=>prepareItems([box(32105,'10 Elunium Box','10 Eluniuims')],new Set(),new Set([603])),/content/);assert.throws(()=>prepareItems([box(32105,'10 Elunium Box','10 Eluniuims')],new Set([985]),new Set()),/client/);});
test('unknown effects are withheld rather than made inert',()=>{const r=prepareItems([box(32007,'Protect Costume Ticket','Protect on upgrade')],new Set(),new Set());assert.equal(r.ready.length,0);assert.equal(r.pending.length,1);});
test('amounts must match description and stay bounded',()=>{for(const name of ['100000 Elunium Box','10 Elunium Box'])assert.equal(prepareItems([box(32105,name,'20 Eluniuims')],new Set([985]),new Set([603])).ready.length,0);});
