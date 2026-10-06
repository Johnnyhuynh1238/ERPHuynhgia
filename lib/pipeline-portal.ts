// Trang cổng dự án cho khách: 1 link huynhgia6.com/<slug> chứa mọi phiên bản mô tả + báo giá
// (+ tab Hợp đồng khi admin đã chốt gửi khách — 1 file, không theo phiên bản).
// Trang mô tả / báo giá (HTML admin tải lên) nằm trong khung sandbox, lấy từ cùng đường dẫn kèm ?doc=&v=.
// File này không import gì (sinh HTML thuần) để dựng xem trước ngoài Next được.

export type PortalVersion = {
  no: number;
  date: string; // dd/mm
  hasDescription: boolean;
  hasQuote: boolean;
};

export type PortalData = {
  name: string;
  customerName: string;
  hasContract: boolean;
  versions: PortalVersion[];
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PORTAL_CSS = `
*{box-sizing:border-box}
html,body{margin:0}
body{background:#f5efe1;color:#2e140a;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.4}
.top{position:sticky;top:0;z-index:50;background:#fbf7ec;border-bottom:1px solid rgba(46,20,10,.16);box-shadow:0 1px 8px rgba(46,20,10,.06)}
.in{max-width:1200px;margin:0 auto;padding:10px 20px;display:flex;gap:10px 20px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.ttl{min-width:0}
.brand{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8a3d1c;font-weight:600}
h1{margin:1px 0 0;font-size:19px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cus{font-size:13px;color:rgba(46,20,10,.55)}
.ctl{display:flex;gap:10px 14px;align-items:center;flex-wrap:wrap}
.tabs{display:flex;border:1px solid rgba(46,20,10,.16);border-radius:10px;overflow:hidden;background:#f5efe1}
.tabs button{border:0;background:none;font:inherit;font-weight:600;color:rgba(46,20,10,.6);padding:9px 20px;cursor:pointer}
.tabs button.on{background:#e36122;color:#fff}
.vers{display:flex;gap:6px;align-items:center;overflow-x:auto}
.vers .lb{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:rgba(46,20,10,.55);font-weight:600;white-space:nowrap}
.vers button{flex:none;border:1px solid rgba(46,20,10,.16);background:#fbf7ec;color:#2e140a;border-radius:9px;font:inherit;padding:5px 11px;cursor:pointer;text-align:left;line-height:1.15}
.vers button b{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:14px}
.vers button small{display:block;font-size:10.5px;color:rgba(46,20,10,.55)}
.vers button.on{border-color:#e36122;background:rgba(227,97,34,.1)}
.vers button.on b{color:#e36122}
main{max-width:1200px;margin:0 auto;padding:14px 20px 40px}
.old{background:#fff7d6;border:1px dashed #b8934a;color:#8a3d1c;border-radius:9px;padding:8px 12px;font-size:13px;margin-bottom:12px}
.old a{color:#e36122;font-weight:600;cursor:pointer;text-decoration:underline}
.pvw{border:1px solid rgba(46,20,10,.16);border-radius:11px;overflow:hidden;background:#fff}
.pvw iframe{display:block;border:0;width:100%;background:#fff}
.empty{border:1px dashed rgba(46,20,10,.2);border-radius:11px;background:#fbf7ec;padding:70px 20px;text-align:center;color:rgba(46,20,10,.55)}
.empty b{display:block;font-size:18px;color:#2e140a;margin-bottom:4px}
.full{text-align:right;margin:0 0 8px;font-size:13px}
.full a{color:#e36122;font-weight:600}
[hidden]{display:none!important}
@media (max-width:700px){
.in{padding:8px 12px}
h1{font-size:17px}
.ctl{width:100%}
.tabs{flex:1 0 100%}
.tabs button{flex:1;padding:9px 8px;white-space:nowrap}
.vers{flex:1 0 100%}
main{padding:10px 0 30px}
.old{margin:0 12px 10px}
.pvw{border-left:0;border-right:0;border-radius:0}
.empty{margin:0 12px}
.full{margin:0 12px 8px}
}
`;

// ES5 thuần (chạy trên máy khách cũ). __DATA__ được thay bằng JSON phiên bản.
const PORTAL_JS = `
(function(){
var V=__DATA__,HC=__HC__,KN={"mo-ta":"Bản mô tả","bao-gia":"Báo giá","hop-dong":"Hợp đồng"};
var latest=V[V.length-1].no,kind=HC?"hop-dong":"mo-ta",ver=latest,fr=null;
for(var i=V.length-1;i>=0;i--){if(V[i].d||V[i].q){ver=V[i].no;break}}
function find(n){for(var i=0;i<V.length;i++)if(V[i].no===n)return V[i];return null}
function $(id){return document.getElementById(id)}
function readHash(){var m=/^#(mo-ta|bao-gia|hop-dong)?-?(?:v(\\d+))?$/.exec(location.hash||"");if(!m)return;
if(m[1]&&(m[1]!=="hop-dong"||HC))kind=m[1];if(m[2]&&find(+m[2]))ver=+m[2]}
function render(push){
var bs=document.querySelectorAll("[data-k]"),i;
for(i=0;i<bs.length;i++)bs[i].className=bs[i].getAttribute("data-k")===kind?"on":"";
bs=document.querySelectorAll("[data-v]");
for(i=0;i<bs.length;i++)bs[i].className=+bs[i].getAttribute("data-v")===ver?"on":"";
var hd=kind==="hop-dong",v=find(ver),has=hd?HC:kind==="bao-gia"?v.q:v.d,box=$("pvw"),em=$("empty"),old=$("old"),vb=$("vers");
old.hidden=hd||ver===latest;if(ver!==latest)$("oldn").textContent="V"+ver;
if(vb)vb.hidden=hd;$("full").hidden=!hd;
box.innerHTML="";fr=null;box.hidden=!has;em.hidden=!!has;
if(has){fr=document.createElement("iframe");
fr.setAttribute("sandbox","allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation");
fr.setAttribute("scrolling","no");fr.title=KN[kind]+" V"+ver;fr.style.height="900px";
fr.src=location.pathname+"?doc="+kind+(hd?"":"&v="+ver)+"&embed=1";box.appendChild(fr)}
else{$("emt").textContent=KN[kind]+(V.length>1?" V"+ver:"")+" đang được chuẩn bị"}
if(push){try{history.replaceState(null,"","#"+kind+(hd?"":"-v"+ver))}catch(e){}}
}
window.addEventListener("message",function(e){
if(!fr||e.source!==fr.contentWindow)return;var d=e.data;
if(!d||d.type!=="hg-mota-height"||typeof d.h!=="number")return;
fr.style.height=Math.min(60000,Math.max(300,Math.ceil(d.h)))+"px"});
document.addEventListener("click",function(e){
var t=e.target;while(t&&t!==document&&!(t.getAttribute&&(t.getAttribute("data-k")||t.getAttribute("data-v")||t.id==="tolatest")))t=t.parentNode;
if(!t||t===document)return;
if(t.id==="tolatest")ver=latest;else if(t.getAttribute("data-k"))kind=t.getAttribute("data-k");else ver=+t.getAttribute("data-v");
render(true);window.scrollTo(0,0)});
window.addEventListener("hashchange",function(){readHash();render(false)});
readHash();render(false);
})();
`;

export function renderPipelinePortal(data: PortalData): string {
  const versions = data.versions;
  const latestNo = versions[versions.length - 1].no;
  const json = JSON.stringify(
    versions.map((v) => ({
      no: v.no,
      d: v.hasDescription ? 1 : 0,
      q: v.hasQuote ? 1 : 0,
    })),
  ).replace(/</g, "\\u003c");

  const versionBar =
    versions.length > 1
      ? `<div class="vers" id="vers"><span class="lb">Phiên bản</span>${versions
          .map(
            (v) =>
              `<button type="button" data-v="${v.no}"><b>V${v.no}</b><small>${esc(v.date)}${
                v.no === latestNo ? " · mới nhất" : ""
              }</small></button>`,
          )
          .join("")}</div>`
      : "";

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(data.name)} · Huỳnh Gia</title>
<style>${PORTAL_CSS}</style>
</head>
<body>
<header class="top"><div class="in">
<div class="ttl"><div class="brand">Huỳnh Gia · Hồ sơ dự án</div><h1>${esc(data.name)}</h1><div class="cus">${esc(
    data.customerName,
  )}</div></div>
<div class="ctl">
<div class="tabs"><button type="button" data-k="mo-ta">Mô tả</button><button type="button" data-k="bao-gia">Báo giá</button>${
    data.hasContract
      ? `<button type="button" data-k="hop-dong">Hợp đồng</button>`
      : ""
  }</div>
${versionBar}
</div>
</div></header>
<main>
<div class="old" id="old" hidden>Anh/chị đang xem bản cũ <b id="oldn"></b>. <a id="tolatest">Xem bản mới nhất V${latestNo}</a></div>
<div class="full" id="full" hidden><a href="?doc=hop-dong" target="_blank" rel="noopener">Mở toàn trang để in / lưu PDF ↗</a></div>
<div class="pvw" id="pvw" hidden></div>
<div class="empty" id="empty" hidden><b id="emt"></b>Huỳnh Gia sẽ cập nhật tại đây khi hoàn tất.</div>
</main>
<script>${PORTAL_JS.replace("__DATA__", json).replace(
    "__HC__",
    data.hasContract ? "1" : "0",
  )}</script>
</body>
</html>`;
}
