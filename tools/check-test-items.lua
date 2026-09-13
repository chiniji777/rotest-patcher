local input=assert(arg[1],"iteminfo path required")
dofile(input)
local count=0
for id,item in pairs(tbl) do
 if id>=32105 and id<=32196 and not(id>=32112 and id<=32118) then
  assert(item.identifiedResourceName and #item.identifiedResourceName>0,"missing icon "..id)
  assert(item.identifiedDescriptionName[1]:find("Contains",1,true),"missing box description "..id)
  assert(item.identifiedDescriptionName[2]:find("not verified",1,true),"missing provenance "..id)
  count=count+1
 end
end
assert(count==85,"incorrect box count")
assert(tbl[32105].identifiedDisplayName=="10 Elunium Box")
assert(tbl[32105].identifiedDescriptionName[1]=="Contains 10 x Elunium.")
assert(tbl[32000].identifiedDescriptionName[1]=="Restores 325 HP / 0 SP. PVP maps only, not GVG.")
assert(tbl[32001].identifiedDescriptionName[1]=="Restores 0 HP / 60 SP. PVP maps only, not GVG.")
assert(tbl[501].identifiedDisplayName=="Red Potion","base item changed")
print("PASS 85 box definitions, 2 PVP potions, icons, provenance and preserved base item")
