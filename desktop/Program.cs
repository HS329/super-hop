using System;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SuperHop
{
    // SUPER HOP をそのまま .exe で起動するための薄い皮。
    // Chromiumを同梱せず、Windowsに入っている WebView2 ランタイムを使う。
    // ES modules は file:// で読めないので、自分の小さなHTTPサーバー（127.0.0.1）から配る。
    // localhost は安全な起源なので、ゲームパッドも localStorage もそのまま動く。
    internal static class Program
    {
        private const string Title = "SUPER HOP — そらへのぼる町";

        // F11でフルスクリーン切り替え。ブラウザのキー操作を止めているので、このキーはページに届く
        private const string FullscreenScript = @"
window.addEventListener('keydown', function (e) {
  if (e.key === 'F11') {
    e.preventDefault();
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else { document.documentElement.requestFullscreen(); }
  }
}, true);";

        [STAThread]
        private static void Main(string[] args)
        {
            int port = 0;
            bool serveOnly = false;
            bool devtools = false;
            string root = null;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length) port = int.Parse(args[++i]);
                else if (args[i] == "--root" && i + 1 < args.Length) root = args[++i];
                else if (args[i] == "--serve-only") serveOnly = true;
                else if (args[i] == "--devtools") devtools = true;
            }

            var exeDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
            root = Path.GetFullPath(root ?? Path.Combine(exeDir, "web"));
            if (!File.Exists(Path.Combine(root, "index.html")))
            {
                Console.Error.WriteLine("webフォルダーが見つかりません: " + root);
                if (!serveOnly) MessageBox.Show("ゲーム本体（webフォルダー）が見つかりません。\r\n" + root, Title);
                return;
            }

            if (port == 0) port = FreePort();
            // http.sys（HttpListener）を使わず、ソケットに直接HTTPを話す。
            // HTTPサービスが無効なマシンでも動き、管理者権限もURL ACLも不要。
            var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            _ = Task.Run(() => ServeLoop(listener, root));
            Console.WriteLine("http://127.0.0.1:" + port + "/  <- " + root);

            if (serveOnly)
            {
                // サーバーだけ立てる（検査スクリプトからプロセスごと止める）
                System.Threading.Thread.Sleep(-1);
                return;
            }

            // EnableVisualStyles()は使いません。WinFormsのコントロールは置いておらず、
            // 呼ぶとテーマ用のマニフェストを一時ファイルに展開しに行く（%TEMP%が使えない環境で落ちる）
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);

            var form = new Form
            {
                Text = Title,
                ClientSize = new Size(1280, 720),
                StartPosition = FormStartPosition.CenterScreen,
                MinimumSize = new Size(640, 400),
                BackColor = Color.FromArgb(12, 16, 26),
            };
            var web = new WebView2 { Dock = DockStyle.Fill };
            form.Controls.Add(web);

            // WebView2はUIスレッド（STA）で初期化する必要がある。
            // Mainの中でawaitすると続行がスレッドプール（MTA）に移って COM が壊れるので、
            // ウィンドウが出てから（Loadで）初期化する。
            form.Load += async (sender, e) =>
            {
                try
                {
                    var env = await CoreWebView2Environment.CreateAsync(null, UserDataDir(exeDir), null);
                    await web.EnsureCoreWebView2Async(env);
                    var core = web.CoreWebView2;
                    // 右クリックメニューやF11/F12などをブラウザに取られないようにする（ゲームの操作に渡す）
                    core.Settings.AreDefaultContextMenusEnabled = devtools;
                    core.Settings.AreDevToolsEnabled = devtools;
                    core.Settings.AreBrowserAcceleratorKeysEnabled = devtools;
                    core.Settings.IsStatusBarEnabled = false;
                    core.Settings.IsZoomControlEnabled = false;
                    core.NewWindowRequested += (s, ev) => { ev.Handled = true; };
                    await core.AddScriptToExecuteOnDocumentCreatedAsync(FullscreenScript);
                    core.Navigate("http://127.0.0.1:" + port + "/index.html");
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("WebView2の起動に失敗しました: " + ex);
                    MessageBox.Show(
                        "WebView2を起動できませんでした。\r\n" + ex.Message +
                        "\r\n\r\nWindowsの [Microsoft Edge WebView2 実行時] が必要です。",
                        Title);
                    form.Close();
                }
            };

            Application.Run(form);
            listener.Stop();
            form.Dispose();
        }

        private static int FreePort()
        {
            var probe = new TcpListener(IPAddress.Loopback, 0);
            probe.Start();
            int p = ((IPEndPoint)probe.LocalEndpoint).Port;
            probe.Stop();
            return p;
        }

        // exeと同じ場所の data/ に保存する（言語設定などが残る）。書けない場所なら %LOCALAPPDATA% へ
        private static string UserDataDir(string exeDir)
        {
            var candidates = new[]
            {
                Path.Combine(exeDir, "data"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SUPER-HOP"),
            };
            foreach (var dir in candidates)
            {
                try
                {
                    Directory.CreateDirectory(dir);
                    var probe = Path.Combine(dir, ".writable");
                    File.WriteAllText(probe, "1");
                    File.Delete(probe);
                    return dir;
                }
                catch { }
            }
            return Path.GetTempPath();
        }

        private static async Task ServeLoop(TcpListener listener, string root)
        {
            var fullRoot = Path.GetFullPath(root) + Path.DirectorySeparatorChar;
            while (true)
            {
                TcpClient client;
                try { client = await listener.AcceptTcpClientAsync(); }
                catch { return; }
                _ = Task.Run(() => HandleClient(client, root, fullRoot));
            }
        }

        // 静的ファイルを1個返すだけのサーバー。ファイル数が少ないので keep-alive はしない
        private static async Task HandleClient(TcpClient client, string root, string fullRoot)
        {
            using (client)
            {
                var net = client.GetStream();
                var line = await ReadLineAsync(net);
                if (line == null) return;
                while (true)
                {
                    var header = await ReadLineAsync(net);
                    if (header == null || header.Length == 0) break;
                }
                var parts = line.Split(' ');
                if (parts.Length < 2) return;

                var target = parts[1];
                var cut = target.IndexOf('?');
                if (cut >= 0) target = target.Substring(0, cut);
                var rel = Uri.UnescapeDataString(target.TrimStart('/')).Replace('/', Path.DirectorySeparatorChar);
                if (rel.Length == 0) rel = "index.html";

                int status = 404;
                string statusText = "Not Found";
                string ctype = "text/plain; charset=utf-8";
                byte[] body = Array.Empty<byte>();
                var file = Path.GetFullPath(Path.Combine(root, rel));
                if (file.StartsWith(fullRoot, StringComparison.Ordinal) && File.Exists(file))
                {
                    status = 200;
                    statusText = "OK";
                    ctype = Mime(file);
                    try { body = await File.ReadAllBytesAsync(file); } catch { }
                }
                var head = "HTTP/1.1 " + status + " " + statusText + "\r\n"
                    + "Content-Type: " + ctype + "\r\n"
                    + "Content-Length: " + body.Length + "\r\n"
                    + "Cache-Control: no-cache\r\n"
                    + "Connection: close\r\n\r\n";
                await net.WriteAsync(System.Text.Encoding.UTF8.GetBytes(head));
                if (body.Length > 0) await net.WriteAsync(body);
                await net.FlushAsync();
            }
        }

        private static async Task<string> ReadLineAsync(Stream stream)
        {
            var sb = new System.Text.StringBuilder();
            var one = new byte[1];
            while (true)
            {
                int n;
                try { n = await stream.ReadAsync(one, 0, 1); }
                catch { return null; }
                if (n <= 0) return sb.Length == 0 ? null : sb.ToString();
                if (one[0] == (byte)'\n') return sb.ToString().TrimEnd('\r');
                sb.Append((char)one[0]);
                if (sb.Length > 8192) return sb.ToString();
            }
        }

        private static string Mime(string path)
        {
            switch (Path.GetExtension(path).ToLowerInvariant())
            {
                case ".html": return "text/html; charset=utf-8";
                case ".js": return "text/javascript; charset=utf-8";
                case ".mjs": return "text/javascript; charset=utf-8";
                case ".css": return "text/css; charset=utf-8";
                case ".json": return "application/json; charset=utf-8";
                case ".svg": return "image/svg+xml";
                case ".png": return "image/png";
                case ".jpg": return "image/jpeg";
                case ".ico": return "image/x-icon";
                case ".txt": return "text/plain; charset=utf-8";
                default: return "application/octet-stream";
            }
        }
    }
}
