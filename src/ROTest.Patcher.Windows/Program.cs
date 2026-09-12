using System.Diagnostics;
using System.Reflection;
using ROTest.Patcher.Core;

namespace ROTest.Patcher.Windows;
static class Program
{
    [STAThread] static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new PatcherWindow());
    }
}
sealed class PatcherWindow:Form
{
    const string GameHash="3ea9aa7a923862162d649420a11120d729a9f222b25c7ed3370817afcaa643f7";
    const string Channel="https://github.com/chiniji777/rotest-patcher/releases/latest/download/channel.json";
    readonly string preferences=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ROTestPatcher");
    readonly TextBox folder=new(){Name="ClientFolder",ReadOnly=true,Dock=DockStyle.Fill};
    readonly Label version=new(){Name="InstalledVersion",Text="Version: not checked",AutoSize=true};
    readonly Label status=new(){Name="UpdateStatus",Text="Ready to check for updates",AutoSize=true,MaximumSize=new Size(580,0)};
    readonly TextBox log=new(){Name="UpdateLog",Multiline=true,ReadOnly=true,ScrollBars=ScrollBars.Vertical,Dock=DockStyle.Fill};
    readonly ProgressBar progress=new(){Dock=DockStyle.Fill,Height=12};
    readonly Button choose=new(){Name="ChooseFolder",Text="Choose folder",AutoSize=true};
    readonly Button update=new(){Name="CheckUpdate",Text="Check / Update",AutoSize=true};
    readonly Button play=new(){Name="StartGame",Text="Start game",AutoSize=true,Enabled=false};
    readonly Button graphics=new(){Name="GraphicsSetup",Text="Graphics setup",AutoSize=true,Enabled=false};
    readonly Button rollback=new(){Name="RollBack",Text="Restore previous",AutoSize=true};
    readonly Button cancel=new(){Name="CancelUpdate",Text="Cancel",AutoSize=true,Enabled=false};
    readonly HttpClient http=new(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(60)};
    CancellationTokenSource? operation;
    bool busy,ready;
    string publicKey;
    public PatcherWindow()
    {
        Text="ROTest Patcher 1.0.0";Name="ROTestPatcher";ClientSize=new Size(650,440);MinimumSize=new Size(610,420);StartPosition=FormStartPosition.CenterScreen;Font=new Font("Segoe UI",10);AutoScaleMode=AutoScaleMode.Dpi;
        var assembly=Assembly.GetExecutingAssembly();using var stream=assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(n=>n.EndsWith("release-public.pem",StringComparison.Ordinal)))!;using var reader=new StreamReader(stream);publicKey=reader.ReadToEnd();
        var layout=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(18),ColumnCount=1,RowCount=7};
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));layout.RowStyles.Add(new RowStyle(SizeType.Absolute,18));layout.RowStyles.Add(new RowStyle(SizeType.Percent,100));
        layout.Controls.Add(new Label{Text="ROTest Client Updates",AutoSize=true,Font=new Font("Segoe UI",17,FontStyle.Bold)},0,0);
        var folderRow=new TableLayoutPanel{Dock=DockStyle.Top,AutoSize=true,ColumnCount=2};folderRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));folderRow.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));folderRow.Controls.Add(folder,0,0);folderRow.Controls.Add(choose,1,0);layout.Controls.Add(folderRow,0,1);
        layout.Controls.Add(version,0,2);layout.Controls.Add(status,0,3);
        var buttons=new FlowLayoutPanel{Dock=DockStyle.Top,AutoSize=true};buttons.Controls.AddRange([update,play,graphics,rollback,cancel]);layout.Controls.Add(buttons,0,4);layout.Controls.Add(progress,0,5);layout.Controls.Add(log,0,6);Controls.Add(layout);
        Directory.CreateDirectory(preferences);var saved=Path.Combine(preferences,"folder.txt");
        folder.Text=File.Exists(Path.Combine(AppContext.BaseDirectory,"ROTest.exe"))?AppContext.BaseDirectory:File.Exists(saved)?File.ReadAllText(saved):@"C:\Games\ROTest-rAthena";
        http.DefaultRequestHeaders.UserAgent.ParseAdd("ROTest-Patcher/1.0.0");
        choose.Click+=(_,_)=>ChooseFolder();update.Click+=async(_,_)=>await RunUpdate(true);
        cancel.Click+=(_,_)=>operation?.Cancel();play.Click+=(_,_)=>Launch("ROTest.exe");graphics.Click+=(_,_)=>Launch("opensetupl.exe");rollback.Click+=async(_,_)=>await RollBack();
        Shown+=async(_,_)=>{if(File.Exists(Path.Combine(folder.Text,"ROTest.exe")))await RunUpdate(false);else SetStatus("Choose the ROTest folder containing ROTest.exe.",true);};
        FormClosing+=(_,e)=>{if(busy){e.Cancel=true;operation?.Cancel();SetStatus("Cancelling safely; close after the update has stopped.",false);}};
    }
    void ChooseFolder()
    {
        using var dialog=new FolderBrowserDialog{Description="Choose the folder containing ROTest.exe (not FINN)",UseDescriptionForTitle=true,SelectedPath=folder.Text};
        if(dialog.ShowDialog(this)!=DialogResult.OK)return;
        folder.Text=dialog.SelectedPath;File.WriteAllText(Path.Combine(preferences,"folder.txt"),folder.Text);ready=false;play.Enabled=graphics.Enabled=false;version.Text="Version: not checked";SetStatus("Press Check / Update before starting the game.",false);
    }
    static bool GameRunning(){try{return Process.GetProcessesByName("ROTest").Length>0;}catch{return true;}}
    Updater Engine()
    {
        var u=new Updater(folder.Text,publicKey,GameHash,(uri,ct)=>Download(uri,Updater.MaxFileBytes,ct),GameRunning);
        u.Progress=text=>{if(!IsDisposed&&IsHandleCreated)BeginInvoke(()=>SetStatus(text,false));};return u;
    }
    async Task<byte[]> Download(Uri address,int limit,CancellationToken ct)
    {
        for(int redirects=0;redirects<6;redirects++)
        {
            if(address.Scheme!="https"||!new[]{"github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"}.Contains(address.Host))throw new InvalidDataException("Untrusted download redirect was blocked.");
            using var response=await http.GetAsync(address,HttpCompletionOption.ResponseHeadersRead,ct).ConfigureAwait(false);
            if((int)response.StatusCode is 301 or 302 or 303 or 307 or 308){address=response.Headers.Location is {IsAbsoluteUri:true} absolute?absolute:new Uri(address,response.Headers.Location??throw new InvalidDataException("Missing redirect address."));continue;}
            if(!response.IsSuccessStatusCode)throw new InvalidDataException("Update server returned HTTP "+(int)response.StatusCode+". Please retry later.");
            if(response.Content.Headers.ContentLength>limit)throw new InvalidDataException("Download is larger than allowed.");
            await using var input=await response.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);using var output=new MemoryStream();var buffer=new byte[32768];
            while(true){int n=await input.ReadAsync(buffer,ct).ConfigureAwait(false);if(n==0)break;if(output.Length+n>limit)throw new InvalidDataException("Download exceeded its size limit.");output.Write(buffer,0,n);}
            return output.ToArray();
        }
        throw new InvalidDataException("Too many download redirects.");
    }
    void SetBusy(bool value)
    {busy=value;choose.Enabled=update.Enabled=rollback.Enabled=!value;play.Enabled=graphics.Enabled=!value&&ready;cancel.Enabled=value;progress.Style=value?ProgressBarStyle.Marquee:ProgressBarStyle.Blocks;}
    void SetStatus(string text,bool error)
    {
        status.Text=text;status.ForeColor=error?Color.Firebrick:Color.DarkSlateGray;
        var line=DateTime.Now.ToString("HH:mm:ss")+" "+text;log.AppendText(line+Environment.NewLine);
        try{var file=Path.Combine(preferences,"patcher.log");if(File.Exists(file)&&new FileInfo(file).Length>2_000_000)File.Move(file,file+".previous",true);File.AppendAllText(file,line+Environment.NewLine);}catch(IOException){}catch(UnauthorizedAccessException){}
    }
    async Task RunUpdate(bool force)
    {
        if(busy)return;ready=false;SetBusy(true);operation=new();
        try
        {
            SetStatus("Checking signed update manifest...",false);var root=folder.Text;var engine=Engine();
            await Task.Run(()=>engine.RecoverAsync());
            var envelope=await Download(new Uri(Channel),Updater.MaxManifestBytes,operation.Token);
            var result=await Task.Run(()=>engine.UpdateAsync(envelope,force,operation.Token));ready=true;version.Text="Version: "+(string.IsNullOrEmpty(result.Version)?"original client":result.Version);
            SetStatus(result.Paused?"Previous files restored. This release is paused; Check / Update retries it.":result.Changed==0?"Up to date. Ready to start.":$"Update complete: {result.Changed} file(s). Ready to start.",false);
            File.WriteAllText(Path.Combine(preferences,"folder.txt"),root);
        }
        catch(OperationCanceledException){SetStatus("Update cancelled. Verified originals/recovery data were preserved.",true);}
        catch(Exception e){SetStatus("Update stopped: "+e.Message,true);}
        finally{operation.Dispose();operation=null;SetBusy(false);}
    }
    async Task RollBack()
    {
        if(busy)return;if(MessageBox.Show(this,"Restore files from the previous update? Manual edits will not be overwritten.","Restore previous",MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes)return;
        SetBusy(true);ready=false;
        try{var u=Engine();await Task.Run(()=>u.RollbackAsync());ready=true;version.Text="Version: restored previous files";SetStatus("Restored. Automatic installation of that release is paused.",false);}catch(Exception e){SetStatus("Restore stopped: "+e.Message,true);}finally{SetBusy(false);}
    }
    void Launch(string name)
    {
        if(busy)return;if(!ready){SetStatus("Run Check / Update first.",true);return;}if(GameRunning()){SetStatus("Close ROTest before launching again or changing graphics settings.",true);return;}
        var file=Path.Combine(folder.Text,name);if(!File.Exists(file)){SetStatus("Run Check / Update first; "+name+" is missing.",true);return;}
        try{Process.Start(new ProcessStartInfo(file){WorkingDirectory=folder.Text,UseShellExecute=true});}catch(Exception e){SetStatus("Could not start: "+e.Message,true);}
    }
    protected override void Dispose(bool disposing){if(disposing){http.Dispose();operation?.Dispose();}base.Dispose(disposing);}
}
