import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appendCardDropEffects} from './card-drop-effects.mjs';

const base='Header:\n  Type: ITEM_DB\n  Version: 3\nBody:\n  - Id: 32000\n    Flags:\n      NoConsume: true\n    Script: |\n      itemheal 1,0;\n';
test('adds only drop presentation for all card types while preserving custom items',()=>{
 const items=[{Id:4001,Type:'Card',Script:'bonus bLuk,2;'},{Id:4147,Type:'Card',Script:'bonus bSplashRange,1;'},{Id:501,Type:'Healing'}];
 const before=structuredClone(items),out=appendCardDropEffects(base,items);
 assert.equal(out,base+'  - Id: 4001\n    Flags:\n      DropEffect: PURPLE_PILLAR\n  - Id: 4147\n    Flags:\n      DropEffect: PURPLE_PILLAR\n');
 assert.deepEqual(items,before);
});
test('rejects empty card inputs rather than silently publishing no effects',()=>assert.throws(()=>appendCardDropEffects(base,[{Id:501,Type:'Healing'}]),/no cards/));
test('rejects duplicates, malformed IDs and collisions with existing overrides',()=>{
 for(const items of [[{Id:4001,Type:'Card'},{Id:4001,Type:'Card'}],[{Id:'bad',Type:'Card'}],[{Id:32000,Type:'Card'}]])assert.throws(()=>appendCardDropEffects(base,items),/invalid or duplicate/);
});
