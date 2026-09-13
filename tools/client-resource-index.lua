dofile(assert(arg[1],"client iteminfo required"))
assert(tbl[501] and tbl[1101],"baseline controls missing")
for id,item in pairs(tbl) do
 local s=item.identifiedResourceName
 if type(id)=="number" and type(s)=="string" and #s>0 then
  local hex=s:gsub('.',function(c)return string.format('%02x',string.byte(c))end)
  print(id..'\t'..(item.ClassNum or 0)..'\t'..hex)
 end
end
