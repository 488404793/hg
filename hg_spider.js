// 黄果短剧 FongMi JS 源（自建精简版）
// 走 community Worker 转发，内置 HMAC-SHA256 签名
var API = 'https://huangguo-parser.13681235735.workers.dev';
var SITE = 'https://huangguoai.com';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var HG_SECRET = 'hg-dx150-2026-11-w7Qm4pLz';
var HG_ORIGIN = 'https://drdrdrrddrdr.github.io';
var HG_REFERER = 'https://drdrdrrddrdr.github.io/huangguo-web/';

function hgRotr(x, n) { return (x >>> n) | (x << (32 - n)); }

function hgUtf8Bytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0xD800 || c >= 0xE000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      i++;
      const c2 = s.charCodeAt(i);
      const cp = 0x10000 + ((c & 0x3FF) << 10) + (c2 & 0x3FF);
      out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
  }
  return out;
}

function hgSha256(bytes) {
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const msg = bytes.slice(0);
  const len = bytes.length;
  const bitLo = (len * 8) >>> 0;
  const bitHi = Math.floor(len / 536870912) >>> 0;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  msg.push((bitHi >>> 24) & 255, (bitHi >>> 16) & 255, (bitHi >>> 8) & 255, bitHi & 255);
  msg.push((bitLo >>> 24) & 255, (bitLo >>> 16) & 255, (bitLo >>> 8) & 255, bitLo & 255);

  const W = new Array(64);
  for (let off = 0; off < msg.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) | (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = hgRotr(W[i - 15], 7) ^ hgRotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = hgRotr(W[i - 2], 17) ^ hgRotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = hgRotr(e, 6) ^ hgRotr(e, 11) ^ hgRotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + HG_K[i] + W[i]) | 0;
      const S0 = hgRotr(a, 2) ^ hgRotr(a, 13) ^ hgRotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  const out = [];
  for (let i = 0; i < 8; i++) out.push((H[i] >>> 24) & 255, (H[i] >>> 16) & 255, (H[i] >>> 8) & 255, H[i] & 255);
  return out;
}

function hgHmacHex(keyStr, msgStr) {
  let key = hgUtf8Bytes(keyStr);
  if (key.length > 64) key = hgSha256(key);
  while (key.length < 64) key.push(0);
  const ipad = [], opad = [];
  for (let i = 0; i < 64; i++) { ipad.push(key[i] ^ 0x36); opad.push(key[i] ^ 0x5c); }
  const inner = hgSha256(ipad.concat(hgUtf8Bytes(msgStr)));
  const outer = hgSha256(opad.concat(inner));
  let hex = '';
  for (let i = 0; i < outer.length; i++) {
    const t = outer[i].toString(16);
    hex += t.length === 1 ? '0' + t : t;
  }
  return hex;
}


// 分类顺序大致对应网页端导航：全部剧集 → 排行榜 → 专辑专题 → 黄果吃瓜
const CLASSES = [
  { type_id: 'ai-duanju',   type_name: 'AI短剧' },
  { type_id: 'ai-manju',    type_name: 'AI漫剧' },
  // 换脸专区(ai-huanlian)、魔改专区(ai-mogai) 源站已 410「内容已下线」，先移除；
  // 恢复时把这两行加回来即可：
  //   { type_id: 'ai-huanlian', type_name: '换脸专区' },
  //   { type_id: 'ai-mogai',    type_name: '魔改专区' },
  { type_id: 'chigua',            type_name: '吃瓜·全部' },
  { type_id: 'chigua:remen',      type_name: '吃瓜·热门' },
  { type_id: 'chigua:yuanchuang', type_name: '吃瓜·AI原创' },
  { type_id: 'rank:hot',      type_name: '热播榜' },
  { type_id: 'rank:recommend', type_name: '推荐榜' },
  { type_id: 'rank:potential', type_name: '潜力榜' }
];


// ===== 请求封装 =====
function hgSign(path) {
  var win = Math.floor(Date.now() / 1000 / 300);
  return { ts: String(win * 300), sig: hgHmacHex(HG_SECRET, win + '\n' + path) };
}

function apiGet(path) {
  var s = hgSign(path);
  var r = null;
  try {
    r = req(API + path, {
      method: 'get',
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Origin': HG_ORIGIN,
        'Referer': HG_REFERER,
        'X-HG-Ts': s.ts,
        'X-HG-Sig': s.sig
      },
      timeout: 15000
    });
  } catch (e) { return null; }
  if (!r || !r.content) return null;
  try { return JSON.parse(String(r.content)); } catch (e) { return null; }
}

function fixPic(u) {
  u = String(u || '');
  if (!u) return '';
  if (u.indexOf('http') === 0) return API + '/media?url=' + encodeURIComponent(u);
  return API + u;
}

function toVod(x) {
  var tags = '';
  if (x.vod_tags && x.vod_tags.length) tags = x.vod_tags.join(' / ');
  return {
    vod_id: String(x.vod_id || x.id || ''),
    vod_name: String(x.vod_name || x.title || ''),
    vod_pic: fixPic(x.vod_pic || x.cover),
    vod_remarks: String(x.vod_remarks || ''),
    vod_year: String(x.vod_year || ''),
    vod_score: String(x.vod_score || ''),
    vod_content: String(x.vod_desc || ''),
    vod_actor: String(x.vod_author || ''),
    type_name: tags
  };
}

var CATS = [
  { type_id: 'ai-duanju', type_name: 'AI短剧' },
  { type_id: 'ai-manju', type_name: 'AI漫剧' },
  { type_id: 'ranks', type_name: '排行榜' },
  { type_id: 'chigua', type_name: '吃瓜' }
];

// ===== FongMi 入口 =====
function home() {
  return JSON.stringify({ class: CATS, filters: {} });
}

function homeVod() {
  var d = apiGet('/api/category/ai-duanju?page=1&size=20&sort=latest');
  var list = [];
  if (d && d.list) for (var i = 0; i < d.list.length; i++) list.push(toVod(d.list[i]));
  return JSON.stringify({ list: list });
}

function category(tid, pg, filter, extend) {
  var p = parseInt(pg || '1', 10) || 1;
  var path;
  if (String(tid) === 'chigua') {
    path = '/api/chigua?cate=all&page=' + p + '&size=20';
  } else if (String(tid) === 'ranks') {
    path = '/api/ranks/hot?page=' + p + '&size=20';
  } else {
    path = '/api/category/' + encodeURIComponent(tid) + '?page=' + p + '&size=20&sort=latest';
  }
  var d = apiGet(path);
  var list = [];
  if (d && d.list) for (var i = 0; i < d.list.length; i++) list.push(toVod(d.list[i]));
  var total = (d && d.total) ? Number(d.total) : list.length;
  return JSON.stringify({
    page: p,
    pagecount: Math.ceil(total / 20) || 1,
    total: total,
    list: list
  });
}

function detail(id) {
  var d = apiGet('/api/detail/' + encodeURIComponent(id));
  var v = null;
  if (d && d.list && d.list.length) v = d.list[0];
  if (!v) return JSON.stringify({ list: [] });
  var n = Number(v.vod_episode_count || 1);
  var urls = [];
  for (var i = 1; i <= n; i++) urls.push('第' + i + '集$' + id + '_' + i);
  var vod = toVod(v);
  vod.vod_play_from = 'huangguo';
  vod.vod_play_url = urls.join('#');
  return JSON.stringify({ list: [vod] });
}

function play(flag, id, flags) {
  var parts = String(id).split('_');
  var vid = parts[0];
  var ep = parts.length > 1 ? parts[1] : '1';
  var d = apiGet('/api/play?url=' + encodeURIComponent(vid) + '&ep=' + encodeURIComponent(ep));
  if (!d || !d.url) return JSON.stringify({ parse: 0, url: '' });
  return JSON.stringify({
    parse: 0,
    url: String(d.url),
    header: { 'User-Agent': UA, 'Referer': SITE + '/' },
    format: 'application/vnd.apple.mpegurl'
  });
}

function search(wd, quick) {
  var d = apiGet('/api/search/' + encodeURIComponent(wd) + '?page=1&size=20');
  var list = [];
  if (d && d.list) for (var i = 0; i < d.list.length; i++) list.push(toVod(d.list[i]));
  return JSON.stringify({ list: list });
}
