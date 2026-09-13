import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEquipmentCatalog,equipmentShopPrice} from './equipment-catalog.mjs';
const item=(Id,Type,extra={})=>({Id,Name:'Equipment '+Id,Type,...extra});
test('weapon type and wear locations decide categories, not names',()=>{
 const r=buildEquipmentCatalog([item(1,'Weapon',{SubType:'Dagger'}),item(2,'Armor',{Locations:{Left_Hand:true}}),item(3,'Armor',{Locations:{Head_Top:true,Head_Mid:true}}),item(4,'Armor',{Locations:{Costume_Head_Top:true}})],new Set([1,2,3,4]));
 assert.deepEqual(r.groups.map(g=>[g.key,g.items.map(i=>i.Id)]),[['weapon_Dagger',[1]],['shield',[2]],['head_multi',[3]],['costume',[4]]]);
});
test('missing client items are disclosed and not offered',()=>{const r=buildEquipmentCatalog([item(1,'Weapon',{SubType:'Bow'})],new Set());assert.equal(r.groups.length,0);assert.deepEqual(r.missingClient.map(i=>i.Id),[1]);});
test('pages cover every offered ID exactly once at bounded size',()=>{const items=Array.from({length:121},(_,i)=>item(i+1,'Armor',{Locations:{Armor:true}}));const r=buildEquipmentCatalog(items,new Set(items.map(i=>i.Id)));assert.deepEqual(r.groups[0].pages.map(p=>p.length),[50,50,21]);assert.deepEqual(r.groups[0].pages.flat().map(i=>i.Id),items.map(i=>i.Id));});
test('pet eggs excluded but pet equipment included',()=>{const r=buildEquipmentCatalog([item(1,'Petegg'),item(2,'Petarmor')],new Set([1,2]));assert.deepEqual(r.groups[0].items.map(i=>i.Id),[2]);assert.equal(r.excluded.length,1);});
test('duplicate ID and unknown wearable category fail closed',()=>{assert.throws(()=>buildEquipmentCatalog([item(1,'Petarmor'),item(1,'Petarmor')],new Set([1])),/duplicate/);assert.throws(()=>buildEquipmentCatalog([item(2,'Armor',{Locations:{Unknown:true}})],new Set([2])),/unsupported/);});
test('false location flags do not cause multi-slot classification',()=>{const r=buildEquipmentCatalog([item(1,'Armor',{Locations:{Head_Top:true,Head_Mid:false}})],new Set([1]));assert.equal(r.groups[0].key,'head_top');});
test('unpriced equipment gets test price without changing regular prices',()=>{assert.equal(equipmentShopPrice({Buy:0}),100);assert.equal(equipmentShopPrice({}),100);assert.equal(equipmentShopPrice({Buy:2}),-1);assert.equal(equipmentShopPrice({Sell:500}),-1);});
