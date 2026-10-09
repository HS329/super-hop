// 共有ビルド（dist）をサブパス配下で配信する最小の静的サーバー
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.argv[2] || 'share-test';
const port = Number(process.argv[3] || 5176);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // /dist/... で呼ばれたときも dist 直下として扱う（相対パスでどこに置いても動くことの確認）
  const rel = url.startsWith('/dist/') ? url.slice(5) : url;
  let file = normalize(join(root, rel));
  try {
    let body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(file, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('404');
    }
  }
}).listen(port, '127.0.0.1', () => console.log(`static server on http://127.0.0.1:${port}/`));
