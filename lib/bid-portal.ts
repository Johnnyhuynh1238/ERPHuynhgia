// Trang mời thầu nhân công cho nhà thầu: huynhgia6.com/moi-thau-<mã>.
// Một trang dài cuộn từ trên xuống (không menu ngang): Thông tin → Bản vẽ → Phối cảnh → Mô tả → HĐ thầu phụ.
// Chỉ xem — ảnh lấy từ cùng đường dẫn ?img=… (JPEG có dấu chìm), chặn chuột phải / kéo ảnh / in / sao chép.
// Không hiện tên chủ nhà, SĐT hay giá trị hợp đồng với chủ nhà.
// File này không import gì (sinh HTML thuần) để dựng xem trước ngoài Next được.

export type BidPortalFile = { id: string; title: string; pages: number };

export type BidPortalData = {
  name: string;
  address: string;
  areaM2: number | null;
  startDate: string | null; // dd/mm/yyyy
  endDate: string | null;
  note: string;
  drawings: BidPortalFile[];
  photos: { id: string; caption: string }[];
  docs: BidPortalFile[];
  hasDescription: boolean;
  preview: boolean; // admin xem trước khi link chưa mở
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CSS = `
*{box-sizing:border-box}
html,body{margin:0}
body{background:#f5efe1;color:#2e140a;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.45;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
img{-webkit-user-drag:none;user-drag:none;-webkit-touch-callout:none}
.top{background:#fbf7ec;border-bottom:1px solid rgba(46,20,10,.16)}
.in{max-width:1100px;margin:0 auto;padding:14px 20px 12px}
.brand{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a3d1c;font-weight:600}
h1{margin:2px 0 0;font-size:21px;font-weight:700}
section{scroll-margin-top:12px}
.sec{display:flex;align-items:baseline;gap:10px;font-size:18px;font-weight:700;margin:30px 0 12px;padding-bottom:8px;border-bottom:2px solid #e36122}
.sec small{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:13px;font-weight:500;color:rgba(46,20,10,.55)}
.totop{position:fixed;right:16px;bottom:16px;z-index:60;border:0;border-radius:22px;background:#2e140a;color:#fbf7ec;font:inherit;font-size:13px;font-weight:600;padding:9px 14px;box-shadow:0 2px 10px rgba(46,20,10,.25);cursor:pointer}
main{max-width:1100px;margin:0 auto;padding:16px 20px 48px}
.card{background:#fbf7ec;border:1px solid rgba(46,20,10,.14);border-radius:12px;padding:16px 18px;margin-bottom:14px}
.card h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a3d1c;margin:0 0 10px}
.kv{width:100%;border-collapse:collapse}
.kv th{text-align:left;font-weight:500;color:rgba(46,20,10,.6);padding:7px 12px 7px 0;width:38%;vertical-align:top;border-top:1px solid rgba(46,20,10,.08)}
.kv td{padding:7px 0;font-weight:600;border-top:1px solid rgba(46,20,10,.08)}
.kv tr:first-child th,.kv tr:first-child td{border-top:0}
.note{white-space:pre-wrap;margin:0}
.warn{background:#fff7d6;border:1px solid #e0c27a;color:#8a3d1c;border-radius:10px;padding:10px 14px;font-size:13.5px;margin-bottom:14px}
.prev{background:#2e140a;color:#fbf7ec;text-align:center;font-size:13px;padding:6px 10px}
.list{display:flex;flex-direction:column;gap:6px}
.list a{display:flex;align-items:center;justify-content:space-between;gap:10px;color:inherit;text-decoration:none;padding:9px 12px;border-radius:9px;background:#f5efe1;cursor:pointer}
.list a b{font-weight:600}
.list a span{color:rgba(46,20,10,.55);font-size:13px;white-space:nowrap}
.file{margin-bottom:22px}
.file h3{font-size:16px;margin:0 0 8px}
.file h3 small{font-weight:400;color:rgba(46,20,10,.55);font-size:13px;margin-left:6px}
.pg{position:relative;background:#fff;border:1px solid rgba(46,20,10,.14);border-radius:8px;overflow:hidden;margin-bottom:10px;cursor:zoom-in;min-height:120px}
.pg img{display:block;width:100%;height:auto}
.pg i{position:absolute;right:8px;bottom:8px;background:rgba(46,20,10,.7);color:#fff;font-style:normal;font-size:12px;padding:2px 8px;border-radius:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.grid .pg{margin:0}
.cap{font-size:13px;color:rgba(46,20,10,.6);padding:6px 10px;background:#fbf7ec}
.empty{border:1px dashed rgba(46,20,10,.2);border-radius:11px;background:#fbf7ec;padding:50px 20px;text-align:center;color:rgba(46,20,10,.55)}
.mota{border:1px solid rgba(46,20,10,.16);border-radius:11px;overflow:hidden;background:#fff}
.mota iframe{display:block;border:0;width:100%;height:900px;background:#fff}
.lb{position:fixed;inset:0;z-index:100;background:rgba(20,10,5,.94);overflow:auto;-webkit-overflow-scrolling:touch}
.lb img{display:block;margin:0 auto;max-width:100%;height:auto}
.lb.big img{max-width:none;width:220%}
.lbbar{position:fixed;top:0;left:0;right:0;z-index:101;display:flex;justify-content:flex-end;gap:8px;padding:10px}
.lbbar button{border:0;border-radius:20px;background:rgba(255,255,255,.92);color:#2e140a;font:inherit;font-weight:600;padding:7px 14px;cursor:pointer}
.foot{text-align:center;color:rgba(46,20,10,.5);font-size:12.5px;margin-top:20px}
[hidden]{display:none!important}
@media print{body>*{display:none!important}body:after{content:"Tài liệu mời thầu Huỳnh Gia — không cho phép in.";display:block;padding:40px;text-align:center}}
@media (max-width:700px){
.in{padding:12px 12px 10px}
h1{font-size:18px}
.sec{font-size:16.5px;margin-top:26px}
main{padding:12px 12px 40px}
.card{padding:14px}
.kv th{width:42%}
.grid{grid-template-columns:1fr}
.lb.big img{width:300%}
}
`;

// ES5 thuần (máy thợ cũ).
const JS = `
(function(){
function $(id){return document.getElementById(id)}
var fr=$("motafr");
function no(e){e.preventDefault();return false}
["contextmenu","copy","cut","dragstart","selectstart"].forEach(function(t){document.addEventListener(t,no,true)});
document.addEventListener("keydown",function(e){var k=(e.key||"").toLowerCase();
if((e.ctrlKey||e.metaKey)&&"pscau".indexOf(k)>=0||k==="printscreen")no(e);
if(k==="escape")close()},true);
var lb=$("lb"),lbi=$("lbi"),top=$("totop");
function open(src){lbi.src=src;lb.className="lb";lb.hidden=false;$("lbbar").hidden=false;$("zoom").textContent="Phóng to";document.body.style.overflow="hidden"}
function close(){lb.hidden=true;$("lbbar").hidden=true;lbi.removeAttribute("src");document.body.style.overflow=""}
document.addEventListener("click",function(e){var t=e.target;
while(t&&t!==document&&!(t.getAttribute&&(t.getAttribute("data-big")||t.getAttribute("data-go")||t.id==="close"||t.id==="zoom"||t.id==="totop")))t=t.parentNode;
if(!t||t===document)return;
if(t.id==="close")return close();
if(t.id==="totop")return window.scrollTo(0,0);
if(t.id==="zoom"){var b=lb.className.indexOf("big")<0;lb.className=b?"lb big":"lb";t.textContent=b?"Thu nhỏ":"Phóng to";return}
if(t.getAttribute("data-go")){e.preventDefault();var el=$(t.getAttribute("data-go"));if(el)el.scrollIntoView();return}
open(t.getAttribute("data-big"))});
window.addEventListener("scroll",function(){top.hidden=(window.pageYOffset||0)<600});
window.addEventListener("message",function(e){if(!fr||e.source!==fr.contentWindow)return;var d=e.data;
if(d&&d.type==="hg-mota-height"&&typeof d.h==="number")fr.style.height=Math.min(60000,Math.max(300,Math.ceil(d.h)))+"px"});
})();
`;

function pages(prefix: string, f: BidPortalFile) {
  let out = "";
  for (let p = 1; p <= f.pages; p++) {
    const src = `?img=${prefix}.${f.id}.${p}`;
    out += `<div class="pg" data-big="${src}&z=1"><img src="${src}" loading="lazy" alt="${esc(f.title)} trang ${p}">${
      f.pages > 1 ? `<i>${p}/${f.pages}</i>` : ""
    }</div>`;
  }
  return out;
}

// Mục lục dọc: bấm cuộn xuống đúng file / mục.
function fileList(prefix: string, files: BidPortalFile[]) {
  return files
    .map((f) => `<a data-go="${prefix}-${esc(f.id)}"><b>${esc(f.title)}</b><span>${f.pages} trang</span></a>`)
    .join("");
}

function secHead(title: string, count?: string) {
  return `<h2 class="sec">${title}${count ? `<small>${count}</small>` : ""}</h2>`;
}

export function renderBidPortal(d: BidPortalData): string {
  const rows: [string, string][] = [["Công trình", d.name]];
  if (d.address) rows.push(["Địa điểm", d.address]);
  if (d.areaM2) rows.push(["Diện tích xây dựng (quy đổi)", `${d.areaM2.toLocaleString("vi-VN")} m²`]);
  if (d.startDate) rows.push(["Khởi công dự kiến", d.startDate]);
  if (d.endDate) rows.push(["Hoàn thành dự kiến", d.endDate]);

  const drawingPages = d.drawings.reduce((s, f) => s + f.pages, 0);
  const toc =
    fileList("d", d.drawings) +
    (d.photos.length
      ? `<a data-go="s-phoi-canh"><b>Phối cảnh 3D</b><span>${d.photos.length} ảnh</span></a>`
      : "") +
    (d.hasDescription ? `<a data-go="s-mo-ta"><b>Mô tả công trình</b><span>xem</span></a>` : "") +
    fileList("c", d.docs);

  const sections: string[] = [];
  sections.push(`<section id="s-thong-tin">
<div class="warn">🔒 Tài liệu chỉ để nhà thầu xem và tính giá nhận thầu. Vui lòng không chụp, sao chép hay chia sẻ cho bên khác.</div>
<div class="card"><h2>Thông tin công trình</h2><table class="kv">${rows
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("")}</table></div>
${d.note.trim() ? `<div class="card"><h2>Phạm vi &amp; yêu cầu mời thầu</h2><p class="note">${esc(d.note.trim())}</p></div>` : ""}
${toc ? `<div class="card"><h2>Hồ sơ kèm theo</h2><div class="list">${toc}</div></div>` : ""}
</section>`);

  if (d.drawings.length)
    sections.push(
      `<section id="s-ban-ve">${secHead("Bản vẽ", `${drawingPages} trang`)}${d.drawings
        .map(
          (f) =>
            `<div class="file" id="d-${esc(f.id)}"><h3>${esc(f.title)}<small>${f.pages} trang · bấm để phóng to</small></h3>${pages("d", f)}</div>`,
        )
        .join("")}</section>`,
    );
  if (d.photos.length)
    sections.push(
      `<section id="s-phoi-canh">${secHead("Phối cảnh 3D", `${d.photos.length} ảnh`)}<div class="grid">${d.photos
        .map(
          (p) =>
            `<div class="pg" data-big="?img=p.${p.id}.1&z=1"><img src="?img=p.${p.id}.1" loading="lazy" alt="Phối cảnh">${
              p.caption ? `<div class="cap">${esc(p.caption)}</div>` : ""
            }</div>`,
        )
        .join("")}</div></section>`,
    );
  if (d.hasDescription)
    sections.push(
      `<section id="s-mo-ta">${secHead("Mô tả công trình")}<div class="mota"><iframe id="motafr" src="?doc=mo-ta&amp;embed=1" sandbox="allow-scripts" scrolling="no" loading="lazy" title="Mô tả công trình"></iframe></div></section>`,
    );
  if (d.docs.length)
    sections.push(
      `<section id="s-hop-dong">${secHead("HĐ thầu phụ mẫu")}<div class="warn">Hợp đồng giao khoán mẫu Huỳnh Gia áp dụng cho gói thầu này — giá trị và khối lượng chốt khi hai bên ký.</div>${d.docs
        .map(
          (f) =>
            `<div class="file" id="c-${esc(f.id)}"><h3>${esc(f.title)}<small>${f.pages} trang</small></h3>${pages("c", f)}</div>`,
        )
        .join("")}</section>`,
    );

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Mời thầu nhân công · ${esc(d.name)} · Huỳnh Gia</title>
<style>${CSS}</style>
</head>
<body>
${d.preview ? `<div class="prev">Xem trước (admin) — link đang ĐÓNG, nhà thầu chưa xem được</div>` : ""}
<header class="top"><div class="in">
<div class="brand">Huỳnh Gia · Mời thầu nhân công</div>
<h1>${esc(d.name)}</h1>
</div></header>
<main>
${sections.join("\n")}
<div class="foot">Công ty Huỳnh Gia · huynhgia6.com</div>
</main>
<button type="button" class="totop" id="totop" hidden>↑ Lên đầu</button>
<div class="lb" id="lb" hidden><img id="lbi" alt=""></div>
<div class="lbbar" id="lbbar" hidden><button type="button" id="zoom">Phóng to</button><button type="button" id="close">✕ Đóng</button></div>
<script>${JS}</script>
</body>
</html>`;
}
