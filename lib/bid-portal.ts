// Trang mời thầu nhân công cho nhà thầu: huynhgia6.com/moi-thau-<mã>.
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
.top{position:sticky;top:0;z-index:50;background:#fbf7ec;border-bottom:1px solid rgba(46,20,10,.16);box-shadow:0 1px 8px rgba(46,20,10,.06)}
.in{max-width:1100px;margin:0 auto;padding:10px 20px 0}
.brand{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a3d1c;font-weight:600}
h1{margin:1px 0 8px;font-size:20px;font-weight:700}
.tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs button{flex:none;border:0;border-bottom:3px solid transparent;background:none;font:inherit;font-weight:600;color:rgba(46,20,10,.6);padding:9px 14px;cursor:pointer;white-space:nowrap}
.tabs button.on{color:#e36122;border-bottom-color:#e36122}
.tabs small{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;opacity:.7;margin-left:3px}
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
.list a{display:flex;justify-content:space-between;gap:10px;color:inherit;text-decoration:none;padding:9px 12px;border-radius:9px;background:#f5efe1;cursor:pointer}
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
.in{padding:8px 12px 0}
h1{font-size:17px}
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
var TABS=__TABS__,cur=TABS[0],fr=null;
function $(id){return document.getElementById(id)}
function show(k,push){if(TABS.indexOf(k)<0)k=TABS[0];cur=k;
var bs=document.querySelectorAll("[data-t]"),i;
for(i=0;i<bs.length;i++)bs[i].className=bs[i].getAttribute("data-t")===k?"on":"";
for(i=0;i<TABS.length;i++)$("s-"+TABS[i]).hidden=TABS[i]!==k;
if(k==="mo-ta"&&!fr){fr=document.createElement("iframe");
fr.setAttribute("sandbox","allow-scripts");fr.setAttribute("scrolling","no");fr.title="Mô tả công trình";
fr.src=location.pathname+"?doc=mo-ta&embed=1";$("mota").appendChild(fr)}
if(push){try{history.replaceState(null,"","#"+k)}catch(e){}}}
function no(e){e.preventDefault();return false}
["contextmenu","copy","cut","dragstart","selectstart"].forEach(function(t){document.addEventListener(t,no,true)});
document.addEventListener("keydown",function(e){var k=(e.key||"").toLowerCase();
if((e.ctrlKey||e.metaKey)&&"pscau".indexOf(k)>=0||k==="printscreen")no(e);
if(k==="escape")close()},true);
var lb=$("lb"),lbi=$("lbi");
function open(src){lbi.src=src;lb.className="lb";lb.hidden=false;$("lbbar").hidden=false;$("zoom").textContent="Phóng to";document.body.style.overflow="hidden"}
function close(){lb.hidden=true;$("lbbar").hidden=true;lbi.removeAttribute("src");document.body.style.overflow=""}
document.addEventListener("click",function(e){var t=e.target;
while(t&&t!==document&&!(t.getAttribute&&(t.getAttribute("data-t")||t.getAttribute("data-big")||t.getAttribute("data-go")||t.id==="close"||t.id==="zoom")))t=t.parentNode;
if(!t||t===document)return;
if(t.id==="close")return close();
if(t.id==="zoom"){var b=lb.className.indexOf("big")<0;lb.className=b?"lb big":"lb";t.textContent=b?"Thu nhỏ":"Phóng to";return}
if(t.getAttribute("data-t"))return show(t.getAttribute("data-t"),true),window.scrollTo(0,0);
if(t.getAttribute("data-go")){e.preventDefault();show(t.getAttribute("data-go"),true);var el=$(t.getAttribute("data-el"));if(el)el.scrollIntoView();return}
open(t.getAttribute("data-big"))});
window.addEventListener("message",function(e){if(!fr||e.source!==fr.contentWindow)return;var d=e.data;
if(d&&d.type==="hg-mota-height"&&typeof d.h==="number")fr.style.height=Math.min(60000,Math.max(300,Math.ceil(d.h)))+"px"});
show((location.hash||"").slice(1)||TABS[0],false);
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

function fileList(tab: string, prefix: string, files: BidPortalFile[]) {
  return files
    .map(
      (f) =>
        `<a data-go="${tab}" data-el="${prefix}-${esc(f.id)}"><b>${esc(f.title)}</b><span>${f.pages} trang</span></a>`,
    )
    .join("");
}

export function renderBidPortal(d: BidPortalData): string {
  const tabs: { k: string; label: string; n?: number }[] = [{ k: "thong-tin", label: "Thông tin" }];
  if (d.drawings.length) tabs.push({ k: "ban-ve", label: "Bản vẽ", n: d.drawings.reduce((s, f) => s + f.pages, 0) });
  if (d.photos.length) tabs.push({ k: "phoi-canh", label: "Phối cảnh", n: d.photos.length });
  if (d.hasDescription) tabs.push({ k: "mo-ta", label: "Mô tả" });
  if (d.docs.length) tabs.push({ k: "hop-dong", label: "HĐ thầu phụ" });

  const rows: [string, string][] = [["Công trình", d.name]];
  if (d.address) rows.push(["Địa điểm", d.address]);
  if (d.areaM2) rows.push(["Diện tích xây dựng (quy đổi)", `${d.areaM2.toLocaleString("vi-VN")} m²`]);
  if (d.startDate) rows.push(["Khởi công dự kiến", d.startDate]);
  if (d.endDate) rows.push(["Hoàn thành dự kiến", d.endDate]);

  const sections: string[] = [];
  sections.push(`<section id="s-thong-tin">
<div class="warn">🔒 Tài liệu chỉ để nhà thầu xem và tính giá nhận thầu. Vui lòng không chụp, sao chép hay chia sẻ cho bên khác.</div>
<div class="card"><h2>Thông tin công trình</h2><table class="kv">${rows
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join("")}</table></div>
${d.note.trim() ? `<div class="card"><h2>Phạm vi &amp; yêu cầu mời thầu</h2><p class="note">${esc(d.note.trim())}</p></div>` : ""}
${
  d.drawings.length || d.docs.length
    ? `<div class="card"><h2>Hồ sơ kèm theo</h2><div class="list">${fileList("ban-ve", "d", d.drawings)}${
        d.photos.length
          ? `<a data-go="phoi-canh" data-el="s-phoi-canh"><b>Phối cảnh 3D</b><span>${d.photos.length} ảnh</span></a>`
          : ""
      }${d.hasDescription ? `<a data-go="mo-ta" data-el="s-mo-ta"><b>Mô tả công trình</b><span>xem</span></a>` : ""}${fileList(
        "hop-dong",
        "c",
        d.docs,
      )}</div></div>`
    : ""
}
</section>`);

  if (d.drawings.length)
    sections.push(
      `<section id="s-ban-ve" hidden>${d.drawings
        .map(
          (f) =>
            `<div class="file" id="d-${esc(f.id)}"><h3>${esc(f.title)}<small>${f.pages} trang · bấm để phóng to</small></h3>${pages("d", f)}</div>`,
        )
        .join("")}</section>`,
    );
  if (d.photos.length)
    sections.push(
      `<section id="s-phoi-canh" hidden><div class="grid">${d.photos
        .map(
          (p) =>
            `<div class="pg" data-big="?img=p.${p.id}.1&z=1"><img src="?img=p.${p.id}.1" loading="lazy" alt="Phối cảnh">${
              p.caption ? `<div class="cap">${esc(p.caption)}</div>` : ""
            }</div>`,
        )
        .join("")}</div></section>`,
    );
  if (d.hasDescription) sections.push(`<section id="s-mo-ta" hidden><div class="mota" id="mota"></div></section>`);
  if (d.docs.length)
    sections.push(
      `<section id="s-hop-dong" hidden><div class="warn">Hợp đồng giao khoán mẫu Huỳnh Gia áp dụng cho gói thầu này — giá trị và khối lượng chốt khi hai bên ký.</div>${d.docs
        .map(
          (f) =>
            `<div class="file" id="c-${esc(f.id)}"><h3>${esc(f.title)}<small>${f.pages} trang</small></h3>${pages("c", f)}</div>`,
        )
        .join("")}</section>`,
    );

  const tabsJson = JSON.stringify(tabs.map((t) => t.k));
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
<nav class="tabs">${tabs
    .map((t) => `<button type="button" data-t="${t.k}">${t.label}${t.n ? `<small>${t.n}</small>` : ""}</button>`)
    .join("")}</nav>
</div></header>
<main>
${sections.join("\n")}
<div class="foot">Công ty Huỳnh Gia · huynhgia6.com</div>
</main>
<div class="lb" id="lb" hidden><img id="lbi" alt=""></div>
<div class="lbbar" id="lbbar" hidden><button type="button" id="zoom">Phóng to</button><button type="button" id="close">✕ Đóng</button></div>
<script>${JS.replace("__TABS__", tabsJson.replace(/</g, "\\u003c"))}</script>
</body>
</html>`;
}
