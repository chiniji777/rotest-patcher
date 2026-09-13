dofile(assert(arg[1]))
local ids={63501,63503,63505,63506,63507,63508,63509,63510,63513,63514,63521,63526,63528}
for _,id in ipairs(ids) do
 local t=assert(tbl[id],"missing "..id)
 assert(t.identifiedDisplayName:find("[FINN Test]",1,true)==1,"missing test label")
 assert(#t.identifiedResourceName>0,"missing resource")
 assert(t.slotCount==1,"slot mismatch")
end
assert(tbl[63514].ClassNum==0)
assert(tbl[63505].ClassNum==638)
assert(tbl[32105].identifiedDisplayName=="10 Elunium Box","prior custom lost")
assert(tbl[501].identifiedDisplayName=="Red Potion","baseline lost")
print("PASS 13 FINN test wearables, labels, slots, view IDs, previous custom and baseline")
