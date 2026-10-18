// CSS trang /nv (số thợ + báo cáo cuối ngày) — nhúng inline (trang public, không qua AppShell). Brand giấy ngà / terracotta.
export const BT_CSS = `
.bt-body{color-scheme:light;position:fixed;inset:0;overflow-y:auto;background:#f5efe1;color:#2e140a;
  font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.bt-wrap{max-width:460px;margin:0 auto;padding:28px 16px 40px}
.bt-head{margin-bottom:18px}
.bt-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a3d1c;font-weight:600}
.bt-head h1{font-size:26px;margin:6px 0 2px;font-weight:700}
.bt-sub{font-size:14px;color:rgba(46,20,10,.6)}
.bt-card{background:#fbf7ec;border:1px solid rgba(46,20,10,.12);border-radius:12px;padding:6px 14px}
.bt-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0;
  border-bottom:1px solid rgba(46,20,10,.1)}
.bt-row:last-child{border-bottom:0}
.bt-name{min-width:0;font-size:16px;font-weight:500;overflow-wrap:anywhere}
.bt-step{display:flex;align-items:center;gap:6px;flex-shrink:0}
.bt-step button{width:42px;height:42px;border-radius:10px;border:1px solid rgba(46,20,10,.18);
  background:#f1e8d6;color:#2e140a;font-size:22px;line-height:1;cursor:pointer}
.bt-step input{width:64px;height:42px;text-align:center;font-size:20px;font-weight:700;border-radius:10px;
  border:1px solid rgba(46,20,10,.25);background:#fff;color:#2e140a}
.bt-step input:focus{outline:2px solid #e36122;outline-offset:1px}
.bt-total{display:flex;justify-content:space-between;padding:14px 4px 0;font-size:15px;color:rgba(46,20,10,.7)}
.bt-total b{color:#2e140a}
.bt-btn{width:100%;margin-top:16px;height:52px;border:0;border-radius:12px;background:#e36122;color:#fff;
  font-size:17px;font-weight:700;cursor:pointer}
.bt-btn:disabled{opacity:.55}
.bt-note{font-size:13px;color:rgba(46,20,10,.55);margin-top:10px;text-align:center}
.bt-err{margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(181,67,46,.1);color:#b5432e;font-size:14px}
.bt-banner{margin:10px 0 4px;padding:12px;border-radius:10px;font-weight:600;font-size:15px}
.bt-banner.ok{background:rgba(91,122,82,.14);color:#3f5a38}
.bt-banner.off{background:rgba(46,20,10,.07);color:rgba(46,20,10,.7)}
.eo-proj{background:#fbf7ec;border:1px solid rgba(46,20,10,.12);border-radius:12px;padding:14px;margin-bottom:14px}
.eo-proj h2{font-size:17px;margin:0 0 10px;font-weight:700;overflow-wrap:anywhere}
.eo-lbl{display:block;font-size:13px;font-weight:600;color:rgba(46,20,10,.7);margin:10px 0 4px}
.eo-lbl i{font-style:normal;font-weight:400;color:rgba(46,20,10,.45)}
.eo-ta{width:100%;box-sizing:border-box;min-height:84px;padding:10px;border-radius:10px;border:1px solid rgba(46,20,10,.25);
  background:#fff;color:#2e140a;font:inherit;font-size:16px;resize:vertical}
.eo-ta.sm{min-height:52px}
.eo-ta:focus{outline:2px solid #e36122;outline-offset:1px}
.eo-photos{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:4px}
.eo-ph{position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#e9dfca}
.eo-ph img{width:100%;height:100%;object-fit:cover;display:block}
.eo-ph button{position:absolute;top:3px;right:3px;width:24px;height:24px;border-radius:50%;border:0;
  background:rgba(46,20,10,.7);color:#fff;font-size:14px;line-height:1;cursor:pointer}
.eo-add{aspect-ratio:1;border-radius:8px;border:1.5px dashed rgba(138,61,28,.5);background:#f1e8d6;color:#8a3d1c;
  display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;font-weight:600;cursor:pointer;gap:2px}
.eo-add span{font-size:24px;line-height:1}
.eo-had{font-size:13px;color:#3f5a38;margin-top:6px}
.eo-lock{font-size:14px;color:rgba(46,20,10,.6)}
.eo-text{white-space:pre-wrap;font-size:15px;margin:0}
/* Ô nhập sáng theo brand — ép !important vì CSS chung app (nền tối) đè background/màu chữ input. */
.bt-step input,.eo-ta{background:#fffdf8 !important;color:#2e140a !important;-webkit-text-fill-color:#2e140a !important;
  border:1.5px solid rgba(138,61,28,.28) !important;box-shadow:none !important;opacity:1 !important}
.bt-step input:focus,.eo-ta:focus{border-color:#e36122 !important;outline:none !important;box-shadow:0 0 0 3px rgba(227,97,34,.15) !important}
.bt-step input::placeholder,.eo-ta::placeholder{color:rgba(46,20,10,.38) !important;-webkit-text-fill-color:rgba(46,20,10,.38) !important}
`;
