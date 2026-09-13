using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ROTest.Patcher.Core;

int passed=0, failed=0;
async Task Test(string name, Func<Fixture,Task> action)
{
    using var fixture=new Fixture();
    try { await action(fixture); Console.WriteLine("PASS "+name); passed++; }
    catch(Exception e) { Console.WriteLine("FAIL "+name+": "+e.Message); failed++; }
}
void Assert(bool condition) { if(!condition) throw new Exception("assertion failed"); }
async Task Reject(Func<Task> action) { try {await action();} catch(InvalidOperationException) {return;} catch(InvalidDataException) {return;} catch(CryptographicException) {return;} throw new Exception("expected rejection"); }

await Test("Thai update progress retains exact file path",f=>{Assert(ThaiText.Translate("Downloading data/clientinfo.xml")=="กำลังดาวน์โหลด data/clientinfo.xml");Assert(ThaiText.Translate("Installing System/itemInfo.lua")=="กำลังติดตั้ง System/itemInfo.lua");return Task.CompletedTask;});
await Test("Thai errors explain active game and leave unknown diagnostics intact",f=>{Assert(ThaiText.Translate("Close ROTest before updating or restoring files.")=="กรุณาปิด ROTest ก่อนอัปเดตหรือกู้คืนไฟล์");Assert(ThaiText.Translate("new diagnostic 123")=="new diagnostic 123");return Task.CompletedTask;});

await Test("signed update downloads only changed files and preserves other files",async f=>{
    f.Write("data/unchanged.txt","keep"); f.Write("data/clientinfo.xml","old");
    var envelope=f.Envelope(f.File("data/clientinfo.xml","new"),f.File("data/unchanged.txt","keep"));
    var result=await f.Updater().UpdateAsync(envelope);
    Assert(result.Changed==1 && f.Read("data/clientinfo.xml")=="new" && f.Read("data/unchanged.txt")=="keep" && f.Requests==1);
    var second=await f.Updater().UpdateAsync(envelope); Assert(second.Changed==0 && f.Requests==1);
});
await Test("client folder with trailing separator supports the normal launcher location",async f=>{
    var result=await f.Updater(f.Root+Path.DirectorySeparatorChar).UpdateAsync(f.Envelope(f.File("data/a.txt","new")));
    Assert(result.Changed==1&&f.Read("data/a.txt")=="new");
});
await Test("tampered signature cannot change client files",async f=>{
    f.Write("data/a.txt","old");var e=JsonSerializer.Deserialize<SignedEnvelope>(f.Envelope(f.File("data/a.txt","new")),Fixture.Json)!;
    var bytes=Convert.FromBase64String(e.Signature);bytes[0]^=1;
    await Reject(()=>f.Updater().UpdateAsync(JsonSerializer.SerializeToUtf8Bytes(e with {Signature=Convert.ToBase64String(bytes)},Fixture.Json)));
    Assert(f.Read("data/a.txt")=="old"&&f.Requests==0);
});
await Test("corrupt download changes no originals",async f=>{
    f.Write("data/a.txt","old-a");f.Write("data/b.txt","old-b");
    var a=f.File("data/a.txt","new-a");var b=f.File("data/b.txt","new-b");f.Assets[new Uri(b.Url).AbsolutePath]=Encoding.UTF8.GetBytes("wrong");
    await Reject(()=>f.Updater().UpdateAsync(f.Envelope(a,b)));
    Assert(f.Read("data/a.txt")=="old-a"&&f.Read("data/b.txt")=="old-b");
});
await Test("cancellation after the first replacement restores all original files",async f=>{
    f.Write("data/a.txt","old-a");f.Write("data/b.txt","old-b");using var cancel=new CancellationTokenSource();var u=f.Updater();u.Progress=s=>{if(s.StartsWith("Installing ",StringComparison.Ordinal))cancel.Cancel();};
    bool cancelled=false;try{await u.UpdateAsync(f.Envelope(f.File("data/a.txt","new-a"),f.File("data/b.txt","new-b")),cancellation:cancel.Token);}catch(OperationCanceledException){cancelled=true;}
    Assert(cancelled&&f.Read("data/a.txt")=="old-a"&&f.Read("data/b.txt")=="old-b");await f.Updater().RecoverAsync();Assert(f.Read("data/a.txt")=="old-a");
});
await Test("unsafe paths and Windows aliases are rejected before downloading",async f=>{
    foreach(var path in new[]{"../outside.txt","data/../../escape","data/CON.txt","data/a:stream","data/a.","data//a","data\\a","/data/a",".rotest-patcher/state.json","ROTest.exe"})
        await Reject(()=>f.Updater().UpdateAsync(f.Envelope(f.File(path,"x"))));
    Assert(f.Requests==0);
});
await Test("case-insensitive duplicate destinations fail closed",async f=>{
    await Reject(()=>f.Updater().UpdateAsync(f.Envelope(f.File("data/a.txt","a"),f.File("data/A.txt","b"))));Assert(f.Requests==0);
});
await Test("non repository URL is rejected",async f=>{
    var file=f.File("data/a.txt","x") with {Url="https://example.com/payload"};
    await Reject(()=>f.Updater().UpdateAsync(f.Envelope(file))); Assert(f.Requests==0);
});
await Test("running game blocks updates",async f=>{
    f.Running=true;f.Write("data/a.txt","old");await Reject(()=>f.Updater().UpdateAsync(f.Envelope(f.File("data/a.txt","new"))));Assert(f.Read("data/a.txt")=="old");
});
await Test("wrong executable fingerprint cannot patch another game",async f=>{
    f.Write("ROTest.exe","different");await Reject(()=>f.Updater().UpdateAsync(f.Envelope(f.File("data/a.txt","new"))));Assert(f.Requests==0);
});
await Test("rollback restores old files and pauses that release",async f=>{
    f.Write("data/a.txt","old");var envelope=f.Envelope(f.File("data/a.txt","new"),f.File("data/new.txt","added"));
    var updater=f.Updater();await updater.UpdateAsync(envelope);await updater.RollbackAsync();
    Assert(f.Read("data/a.txt")=="old"&&!File.Exists(Path.Combine(f.Root,"data/new.txt")));
    var paused=await updater.UpdateAsync(envelope);Assert(paused.Paused&&f.Read("data/a.txt")=="old");
});
await Test("manual edits made after patching are not overwritten by rollback",async f=>{
    f.Write("data/a.txt","old");var u=f.Updater();await u.UpdateAsync(f.Envelope(f.File("data/a.txt","new")));f.Write("data/a.txt","manual-edit");
    await Reject(()=>u.RollbackAsync());Assert(f.Read("data/a.txt")=="manual-edit");
});
await Test("interrupted transaction restores from a durable journal",async f=>{
    f.Write("data/a.txt","new");f.Write(".rotest-patcher/transactions/interrupted/files/data/a.txt","old");
    var journal=new {status="applying",sequence=1,version="1.0",previousSequence=0,previousVersion="",entries=new[]{new {path="data/a.txt",existed=true,originalHash=Fixture.Hash("old"),newHash=Fixture.Hash("new")}}};
    f.Write(".rotest-patcher/transactions/interrupted/journal.json",JsonSerializer.Serialize(journal,Fixture.Json));
    await f.Updater().RecoverAsync();Assert(f.Read("data/a.txt")=="old");
});
await Test("interrupted manual rollback finishes and preserves release pause",async f=>{
    f.Write("data/a.txt","old-a");f.Write("data/b.txt","new-b");
    f.Write(".rotest-patcher/transactions/interrupted-rollback/files/data/a.txt","old-a");f.Write(".rotest-patcher/transactions/interrupted-rollback/files/data/b.txt","old-b");
    var journal=new {status="rollingback",rollbackPause=true,sequence=1,version="1.1",previousSequence=0,previousVersion="",entries=new[]{new {path="data/a.txt",existed=true,originalHash=Fixture.Hash("old-a"),newHash=Fixture.Hash("new-a")},new {path="data/b.txt",existed=true,originalHash=Fixture.Hash("old-b"),newHash=Fixture.Hash("new-b")}}};
    f.Write(".rotest-patcher/transactions/interrupted-rollback/journal.json",JsonSerializer.Serialize(journal,Fixture.Json));
    await f.Updater().RecoverAsync();Assert(f.Read("data/a.txt")=="old-a"&&f.Read("data/b.txt")=="old-b");
    var result=await f.Updater().UpdateAsync(f.Envelope(f.File("data/a.txt","new-a")));Assert(result.Paused&&f.Requests==0);
});
await Test("committed journal repairs stale high-water metadata after restart",async f=>{
    f.Write("data/a.txt","new");
    var journal=new {status="committed",sequence=2,version="1.2",intendedState=new {sequence=2,highestSequence=2,pausedSequence=0,version="1.2",transactionId="finished",revision=2},entries=Array.Empty<object>()};
    f.Write(".rotest-patcher/transactions/finished/journal.json",JsonSerializer.Serialize(journal,Fixture.Json));
    await f.Updater().RecoverAsync();await Reject(()=>f.Updater().UpdateAsync(f.EnvelopeAt(1,f.File("data/a.txt","old"))));Assert(f.Read("data/a.txt")=="new");
});
await Test("rolled-back journal repairs lost pause metadata after restart",async f=>{
    f.Write("data/a.txt","old");f.Write(".rotest-patcher/state.json",JsonSerializer.Serialize(new {sequence=2,highestSequence=2,pausedSequence=0,version="1.2",transactionId="finished"},Fixture.Json));
    var journal=new {status="rolledback",sequence=2,version="1.2",intendedState=new {sequence=1,highestSequence=2,pausedSequence=2,version="1.1",transactionId="finished:rollback",revision=3},entries=Array.Empty<object>()};
    f.Write(".rotest-patcher/transactions/finished/journal.json",JsonSerializer.Serialize(journal,Fixture.Json));
    await f.Updater().RecoverAsync();var result=await f.Updater().UpdateAsync(f.EnvelopeAt(2,f.File("data/a.txt","new")));Assert(result.Paused&&f.Requests==0&&f.Read("data/a.txt")=="old");
});
await Test("rollback release is rejected when channel sequence goes backwards",async f=>{
    var file=f.File("data/a.txt","new");await f.Updater().UpdateAsync(f.EnvelopeAt(2,file));await Reject(()=>f.Updater().UpdateAsync(f.EnvelopeAt(1,file)));
});
await Test("two rollbacks followed by restart preserve the newest completed state",async f=>{
    f.Write("data/a.txt","original");var u=f.Updater();await u.UpdateAsync(f.EnvelopeAt(1,f.File("data/a.txt","one")));await u.UpdateAsync(f.EnvelopeAt(2,f.File("data/a.txt","two")));
    await u.RollbackAsync();await u.RollbackAsync();var before=f.Read(".rotest-patcher/state.json");
    await f.Updater().RecoverAsync();Assert(f.Read("data/a.txt")=="original"&&f.Read(".rotest-patcher/state.json")==before);
});
await Test("rollback order remains correct when Windows regional calendar changes",async f=>{
    var previous=System.Globalization.CultureInfo.CurrentCulture;
    try{f.Write("data/a.txt","original");var u=f.Updater();System.Globalization.CultureInfo.CurrentCulture=System.Globalization.CultureInfo.GetCultureInfo("th-TH");await u.UpdateAsync(f.EnvelopeAt(1,f.File("data/a.txt","one")));System.Globalization.CultureInfo.CurrentCulture=System.Globalization.CultureInfo.GetCultureInfo("en-US");await u.UpdateAsync(f.EnvelopeAt(2,f.File("data/a.txt","two")));await u.RollbackAsync();Assert(f.Read("data/a.txt")=="one");}finally{System.Globalization.CultureInfo.CurrentCulture=previous;}
});
await Test("symlink destination cannot escape client folder",async f=>{
    var outside=Path.Combine(f.Root,"outside");Directory.CreateDirectory(outside);Directory.CreateDirectory(Path.Combine(f.Root,"data"));
    Directory.CreateSymbolicLink(Path.Combine(f.Root,"data/link"),outside);
    await Reject(()=>f.Updater().UpdateAsync(f.Envelope(f.File("data/link/escape.txt","x"))));Assert(!File.Exists(Path.Combine(outside,"escape.txt")));
});
Console.WriteLine($"{passed} passed; {failed} failed");return failed==0?0:1;

sealed class Fixture:IDisposable
{
    public static JsonSerializerOptions Json {get;}=new(JsonSerializerDefaults.Web);
    public string Root {get;}=Path.Combine(Path.GetTempPath(),"rotest-patcher-test-"+Guid.NewGuid().ToString("N"));
    readonly RSA key=RSA.Create(2048); readonly TcpListener listener=new(IPAddress.Loopback,0); readonly HttpClient client=new();
    readonly CancellationTokenSource stop=new(); public Dictionary<string,byte[]> Assets {get;}=new();
    public bool Running; public int Requests;
    public Fixture(){Directory.CreateDirectory(Root);Write("ROTest.exe","synthetic-game");listener.Start();_=Serve();}
    public static string Hash(string text)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();
    public void Write(string path,string text){var f=Path.Combine(Root,path);Directory.CreateDirectory(Path.GetDirectoryName(f)!);System.IO.File.WriteAllText(f,text);}
    public string Read(string path)=>System.IO.File.ReadAllText(Path.Combine(Root,path));
    public PatchFile File(string path,string text){var url="https://github.com/chiniji777/rotest-patcher/releases/download/test/"+Guid.NewGuid().ToString("N");var b=Encoding.UTF8.GetBytes(text);Assets[new Uri(url).AbsolutePath]=b;return new(path,url,b.Length,Hash(text));}
    public byte[] Envelope(params PatchFile[] files)=>EnvelopeAt(1,files);
    public byte[] EnvelopeAt(long sequence,params PatchFile[] files){var bytes=JsonSerializer.SerializeToUtf8Bytes(new PatchManifest("ROTest-20211103",sequence,"1."+sequence,files),Json);return JsonSerializer.SerializeToUtf8Bytes(new SignedEnvelope(Convert.ToBase64String(bytes),Convert.ToBase64String(key.SignData(bytes,HashAlgorithmName.SHA256,RSASignaturePadding.Pss))),Json);}
    public Updater Updater(string? selectedRoot=null)=>new(selectedRoot??Root,key.ExportSubjectPublicKeyInfoPem(),Hash("synthetic-game"),(uri,ct)=>client.GetByteArrayAsync("http://127.0.0.1:"+((IPEndPoint)listener.LocalEndpoint).Port+uri.AbsolutePath,ct),()=>Running);
    async Task Serve(){try{while(!stop.IsCancellationRequested){using var connection=await listener.AcceptTcpClientAsync(stop.Token);await using var stream=connection.GetStream();using var reader=new StreamReader(stream,leaveOpen:true);var request=await reader.ReadLineAsync();while(!string.IsNullOrEmpty(await reader.ReadLineAsync())){}var path=request!.Split(' ')[1];var found=Assets.TryGetValue(path,out var bytes);bytes??=[];Interlocked.Increment(ref Requests);var header=Encoding.ASCII.GetBytes($"HTTP/1.1 {(found?200:404)} OK\r\nContent-Length: {bytes.Length}\r\nConnection: close\r\n\r\n");await stream.WriteAsync(header);await stream.WriteAsync(bytes);}}catch(OperationCanceledException){}catch(ObjectDisposedException){}}
    public void Dispose(){stop.Cancel();listener.Stop();client.Dispose();key.Dispose();stop.Dispose();}
}
