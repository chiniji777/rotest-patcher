dofile(assert(arg[1],"client iteminfo required"))
assert(tbl[501] and tbl[1101],"baseline controls missing")
for id,item in pairs(tbl) do
 if type(id)=="number" and type(item.identifiedDisplayName)=="string" and #item.identifiedDisplayName>0 and type(item.identifiedResourceName)=="string" and #item.identifiedResourceName>0 then print(id) end
end
