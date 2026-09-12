using System.Security.Cryptography;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace ROTest.Patcher.Core;
public record PatchFile(string Path, string Url, long Size, string Sha256);
public record PatchManifest(string Product, long Sequence, string Version, PatchFile[] Files);
public record SignedEnvelope(string Manifest, string Signature);
public record UpdateResult(string Version, int Changed, bool Paused = false);
public class Updater
{
    public const int MaxManifestBytes=262144, MaxFileBytes=16777216;
    static readonly JsonSerializerOptions Json=new(JsonSerializerDefaults.Web);
    readonly string root,publicKey,gameHash,store;
    readonly Func<Uri,CancellationToken,Task<byte[]>> fetch;
    readonly Func<bool> gameRunning;
    public Action<string>? Progress {get;set;}
    public Updater(string root, string publicKey, string expectedGameHash, Func<Uri,CancellationToken,Task<byte[]>> fetch, Func<bool> gameRunning)
    {
        this.root=Path.TrimEndingDirectorySeparator(Path.GetFullPath(root));this.publicKey=publicKey;gameHash=expectedGameHash;
        this.fetch=fetch;this.gameRunning=gameRunning;store=Path.Combine(this.root,".rotest-patcher");
    }
    public static string Hash(byte[] bytes)=>Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern bool MoveFileEx(string existing,string replacement,int flags);
    static void AtomicMove(string source,string target)
    {
        if(OperatingSystem.IsWindows())
        {if(!MoveFileEx(source,target,0x1|0x8))throw new Win32Exception(Marshal.GetLastWin32Error(),"Could not atomically replace an update file.");}
        else File.Move(source,target,true);
    }
    static void DurableCopy(string source,string target)
    {using var input=File.OpenRead(source);using var output=new FileStream(target,FileMode.CreateNew,FileAccess.Write,FileShare.None,32768,FileOptions.WriteThrough);input.CopyTo(output);output.Flush(true);}
    static async Task DurableWrite(string path,byte[] bytes,CancellationToken cancellation)
    {await using var stream=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None,32768,FileOptions.WriteThrough|FileOptions.Asynchronous);await stream.WriteAsync(bytes,cancellation).ConfigureAwait(false);stream.Flush(true);}
    static string FileHash(string file){using var s=File.OpenRead(file);return Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant();}
    void Busy(){if(gameRunning())throw new InvalidOperationException("Close ROTest before updating or restoring files.");}
    void NoLinks(string path)
    {
        for(var cursor=path;cursor.Length>=root.Length;cursor=Path.GetDirectoryName(cursor)??"")
        {
            try{if((File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked folders/files are not supported: "+cursor);}
            catch(FileNotFoundException){}catch(DirectoryNotFoundException){}
            if(cursor==root)break;
        }
    }
    FileStream Acquire()
    {
        Busy();NoLinks(root);var exe=Path.Combine(root,"ROTest.exe");NoLinks(exe);
        if(!File.Exists(exe)||!FileHash(exe).Equals(gameHash,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Choose the original ROTest client folder, not FINN or another game.");
        NoLinks(store);Directory.CreateDirectory(store);
        var lockFile=Path.Combine(store,"update.lock");NoLinks(lockFile);
        return new FileStream(lockFile,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
    }
    static void ValidateName(string name)
    {
        if(string.IsNullOrWhiteSpace(name)||name.Length>220||name.Contains('\\')||name.StartsWith('/'))throw new InvalidDataException("Unsafe patch path.");
        foreach(var part in name.Split('/'))
        {
            if(part.Length==0||part.StartsWith('.')||part.EndsWith('.')||part.Trim()!=part||part.Any(c=>c<32||"<>:\"|?*".Contains(c)))throw new InvalidDataException("Unsafe patch path.");
            if(Regex.IsMatch(part.Split('.')[0],"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$",RegexOptions.IgnoreCase))throw new InvalidDataException("Reserved Windows filename.");
        }
        if(!(name.StartsWith("data/",StringComparison.Ordinal)||name.StartsWith("System/",StringComparison.Ordinal)||name.StartsWith("SystemEN/",StringComparison.Ordinal)||name.StartsWith("graphics-setup-docs/",StringComparison.Ordinal)||name=="opensetupl.exe"))throw new InvalidDataException("File is outside the allowed ROTest patch scope.");
    }
    string Target(string name)
    {
        ValidateName(name);var full=Path.GetFullPath(Path.Combine(root,name.Replace('/',Path.DirectorySeparatorChar)));
        if(!full.StartsWith(root+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Patch path escapes the client folder.");
        NoLinks(full);if(Directory.Exists(full))throw new InvalidDataException("A folder blocks a patch file: "+name);return full;
    }
    PatchManifest Verify(byte[] bytes)
    {
        if(bytes.Length>MaxManifestBytes)throw new InvalidDataException("Update manifest is too large.");
        var envelope=JsonSerializer.Deserialize<SignedEnvelope>(bytes,Json)??throw new InvalidDataException("Missing update manifest.");
        var payload=Convert.FromBase64String(envelope.Manifest);using var rsa=RSA.Create();rsa.ImportFromPem(publicKey);
        if(!rsa.VerifyData(payload,Convert.FromBase64String(envelope.Signature),HashAlgorithmName.SHA256,RSASignaturePadding.Pss))throw new CryptographicException("Update signature is invalid. No files were installed.");
        var manifest=JsonSerializer.Deserialize<PatchManifest>(payload,Json)??throw new InvalidDataException("Invalid update manifest.");
        if(manifest.Product!="ROTest-20211103"||manifest.Sequence<1||string.IsNullOrWhiteSpace(manifest.Version)||manifest.Files is null||manifest.Files.Length>64)throw new InvalidDataException("Unsupported update manifest.");
        var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
        foreach(var file in manifest.Files)
        {
            Target(file.Path);
            if(!names.Add(file.Path)||file.Size<0||file.Size>MaxFileBytes||!Regex.IsMatch(file.Sha256??"","^[0-9a-fA-F]{64}$"))throw new InvalidDataException("Invalid or duplicate patch file.");
            total+=file.Size;if(total>67108864)throw new InvalidDataException("Patch exceeds its size limit.");
            if(!Uri.TryCreate(file.Url,UriKind.Absolute,out var uri)||uri.Scheme!="https"||uri.Host!="github.com"||!uri.IsDefaultPort||uri.UserInfo!=""||uri.Query!=""||uri.Fragment!=""||!uri.AbsolutePath.StartsWith("/chiniji777/rotest-patcher/releases/download/",StringComparison.Ordinal))throw new InvalidDataException("Update download is not from the approved release repository.");
        }
        return manifest;
    }
    void Save<T>(string path,T value)
    {
        NoLinks(path);Directory.CreateDirectory(Path.GetDirectoryName(path)!);var temp=path+"."+Guid.NewGuid().ToString("N")+".new";
        using(var stream=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough))
        {var bytes=JsonSerializer.SerializeToUtf8Bytes(value,Json);stream.Write(bytes);stream.Flush(true);}
        AtomicMove(temp,path);
    }
    T Read<T>(string path) where T:new()
    {NoLinks(path);if(!File.Exists(path))return new();if(new FileInfo(path).Length>MaxManifestBytes)throw new InvalidDataException("Local update record is too large.");return JsonSerializer.Deserialize<T>(File.ReadAllBytes(path),Json)??throw new InvalidDataException("Local update record is invalid.");}
    string StateFile=>Path.Combine(store,"state.json");
    string[] Transactions()
    {var dir=Path.Combine(store,"transactions");NoLinks(dir);return Directory.Exists(dir)?Directory.GetDirectories(dir).Order(StringComparer.Ordinal).ToArray():[];}
    string TxFile(string transaction,string kind,string name)
    {ValidateName(name);NoLinks(transaction);var file=Path.Combine(transaction,kind,name.Replace('/',Path.DirectorySeparatorChar));NoLinks(file);return file;}
    void Restore(string transaction,Journal journal,bool pause)
    {
        Busy();if(journal.Entries is null||journal.Entries.Length>64)throw new InvalidDataException("Invalid recovery journal.");
        foreach(var entry in journal.Entries)
        {
            var target=Target(entry.Path);
            if(File.Exists(target)){var hash=FileHash(target);if(hash!=entry.NewHash&&hash!=entry.OriginalHash)throw new InvalidDataException("Manual changes found; recovery stopped without overwriting them: "+entry.Path);}
            if(entry.Existed){var backup=TxFile(transaction,"files",entry.Path);if(!File.Exists(backup)||FileHash(backup)!=entry.OriginalHash)throw new InvalidDataException("Recovery backup is missing or damaged: "+entry.Path);}
        }
        var state=Read<InstalledState>(StateFile);
        var rollbackRevision=journal.Status=="rollingback"&&journal.IntendedState is not null?journal.IntendedState.Revision:Math.Max(state.Revision,journal.IntendedState?.Revision??0)+1;
        journal.RollbackPause=pause;
        journal.IntendedState=new InstalledState{Sequence=journal.PreviousSequence,Version=journal.PreviousVersion,HighestSequence=Math.Max(Math.Max(state.HighestSequence,journal.Sequence),journal.IntendedState?.HighestSequence??0),PausedSequence=pause?journal.Sequence:journal.PreviousPausedSequence,TransactionId=Path.GetFileName(transaction)+":rollback",Revision=rollbackRevision};
        journal.Status="rollingback";Save(Path.Combine(transaction,"journal.json"),journal);
        foreach(var entry in journal.Entries)
        {
            var target=Target(entry.Path);
            if(entry.Existed)
            {
                if(File.Exists(target)&&FileHash(target)==entry.OriginalHash)continue;
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);var temp=target+".restore-"+Guid.NewGuid().ToString("N");
                DurableCopy(TxFile(transaction,"files",entry.Path),temp);AtomicMove(temp,target);
            }
            else if(File.Exists(target))
            {var removed=TxFile(transaction,"removed",entry.Path);Directory.CreateDirectory(Path.GetDirectoryName(removed)!);AtomicMove(target,removed);}
        }
        Save(StateFile,journal.IntendedState);
        journal.Status="rolledback";Save(Path.Combine(transaction,"journal.json"),journal);
    }
    void RecoverInternal()
    {
        InstalledState? terminalState=null;
        foreach(var transaction in Transactions())
        {
            var journal=Read<Journal>(Path.Combine(transaction,"journal.json"));
            if(journal.Status is "prepared" or "applying" or "rollingback")
            {Progress?.Invoke("Recovering interrupted update...");Restore(transaction,journal,journal.Status=="rollingback"&&journal.RollbackPause);}
            if(journal.Status is "committed" or "rolledback" && journal.IntendedState is not null && (terminalState is null || journal.IntendedState.Revision>terminalState.Revision))terminalState=journal.IntendedState;
        }
        var state=Read<InstalledState>(StateFile);
        if(terminalState is not null&&terminalState.Revision>state.Revision)Save(StateFile,terminalState);
    }
    public Task RecoverAsync()
    {using var gate=Acquire();using var gameLock=new FileStream(Path.Combine(root,"ROTest.exe"),FileMode.Open,FileAccess.Read,FileShare.None);RecoverInternal();return Task.CompletedTask;}
    public Task RollbackAsync()
    {
        using var gate=Acquire();using var gameLock=new FileStream(Path.Combine(root,"ROTest.exe"),FileMode.Open,FileAccess.Read,FileShare.None);RecoverInternal();
        foreach(var transaction in Transactions().Reverse()){var journal=Read<Journal>(Path.Combine(transaction,"journal.json"));if(journal.Status=="committed"){Restore(transaction,journal,true);return Task.CompletedTask;}}
        throw new InvalidOperationException("No completed update is available to restore.");
    }
    public async Task<UpdateResult> UpdateAsync(byte[] envelope,bool force=false,CancellationToken cancellation=default)
    {
        using var gate=Acquire();using var gameLock=new FileStream(Path.Combine(root,"ROTest.exe"),FileMode.Open,FileAccess.Read,FileShare.None);RecoverInternal();
        var manifest=Verify(envelope);var state=Read<InstalledState>(StateFile);
        if(manifest.Sequence<state.HighestSequence)throw new InvalidDataException("An older release was offered. Update refused.");
        if(!force&&manifest.Sequence<=state.PausedSequence)return new(state.Version,0,true);
        var changed=manifest.Files.Where(f=>!File.Exists(Target(f.Path))||!FileHash(Target(f.Path)).Equals(f.Sha256,StringComparison.OrdinalIgnoreCase)).ToArray();
        if(changed.Length==0){Save(StateFile,new InstalledState{Sequence=manifest.Sequence,HighestSequence=Math.Max(state.HighestSequence,manifest.Sequence),Version=manifest.Version,TransactionId=state.TransactionId,Revision=state.Revision+1});return new(manifest.Version,0);}
        var transaction=Path.Combine(store,"transactions",DateTime.UtcNow.ToString("yyyyMMddHHmmssfff")+"-"+Guid.NewGuid().ToString("N"));NoLinks(transaction);Directory.CreateDirectory(transaction);
        var entries=new List<JournalEntry>();
        foreach(var file in changed)
        {
            cancellation.ThrowIfCancellationRequested();Progress?.Invoke("Downloading "+file.Path);
            var bytes=await fetch(new Uri(file.Url),cancellation).ConfigureAwait(false);
            if(bytes.LongLength!=file.Size||!Hash(bytes).Equals(file.Sha256,StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("Downloaded file failed verification: "+file.Path);
            var staged=TxFile(transaction,"staged",file.Path);Directory.CreateDirectory(Path.GetDirectoryName(staged)!);await DurableWrite(staged,bytes,cancellation).ConfigureAwait(false);
            var target=Target(file.Path);var existed=File.Exists(target);var original=existed?FileHash(target):"";
            if(existed){var backup=TxFile(transaction,"files",file.Path);Directory.CreateDirectory(Path.GetDirectoryName(backup)!);DurableCopy(target,backup);if(FileHash(backup)!=original)throw new InvalidDataException("Backup verification failed: "+file.Path);}
            entries.Add(new(){Path=file.Path,Existed=existed,OriginalHash=original,NewHash=file.Sha256.ToLowerInvariant()});
        }
        var journal=new Journal{Status="prepared",Sequence=manifest.Sequence,Version=manifest.Version,PreviousSequence=state.Sequence,PreviousVersion=state.Version,PreviousPausedSequence=state.PausedSequence,Entries=entries.ToArray(),IntendedState=new InstalledState{Sequence=manifest.Sequence,HighestSequence=Math.Max(state.HighestSequence,manifest.Sequence),Version=manifest.Version,TransactionId=Path.GetFileName(transaction),Revision=state.Revision+1}};
        Save(Path.Combine(transaction,"journal.json"),journal);
        bool committed=false;
        try
        {
            Busy();cancellation.ThrowIfCancellationRequested();journal.Status="applying";Save(Path.Combine(transaction,"journal.json"),journal);
            foreach(var entry in entries)
            {
                Busy();cancellation.ThrowIfCancellationRequested();var target=Target(entry.Path);
                if(File.Exists(target)?FileHash(target)!=entry.OriginalHash:entry.Existed)throw new InvalidDataException("Client file changed during update: "+entry.Path);
                Progress?.Invoke("Installing "+entry.Path);Directory.CreateDirectory(Path.GetDirectoryName(target)!);AtomicMove(TxFile(transaction,"staged",entry.Path),target);
            }
            Save(StateFile,journal.IntendedState);
            journal.Status="committed";Save(Path.Combine(transaction,"journal.json"),journal);
            committed=true;
            return new(manifest.Version,changed.Length);
        }
        catch
        {if(!committed)Restore(transaction,journal,false);throw;}
    }
    public sealed class InstalledState {public long Sequence{get;set;} public long HighestSequence{get;set;} public long PausedSequence{get;set;} public string Version{get;set;}="";public string TransactionId{get;set;}="";public long Revision{get;set;}}
    public sealed class Journal {public string Status{get;set;}="";public long Sequence{get;set;}public string Version{get;set;}="";public long PreviousSequence{get;set;}public string PreviousVersion{get;set;}="";public long PreviousPausedSequence{get;set;}public bool RollbackPause{get;set;}public InstalledState? IntendedState{get;set;}public JournalEntry[] Entries{get;set;}=[];}
    public sealed class JournalEntry {public string Path{get;set;}="";public bool Existed{get;set;}public string OriginalHash{get;set;}="";public string NewHash{get;set;}="";}
}
