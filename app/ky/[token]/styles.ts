// CSS trang /ky (BB nghiệm thu ký online) — nhúng inline (trang public, không qua AppShell). Brand giấy ngà / terracotta.
export const KY_CSS = `
.ky-body{color-scheme:light;position:fixed;inset:0;overflow-y:auto;background:#f5efe1;color:#2e140a;
  font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.ky-wrap{max-width:640px;margin:0 auto;padding:22px 16px 120px}
.ky-eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8a3d1c;font-weight:600}
.ky-wrap h1{font-size:22px;line-height:1.3;margin:6px 0 4px;font-weight:700}
.ky-sub{font-size:14px;color:rgba(46,20,10,.62)}
.ky-info{margin:14px 0;background:#fbf7ec;border:1px solid rgba(46,20,10,.12);border-radius:12px;padding:10px 14px;font-size:14px}
.ky-info div{display:flex;gap:8px;padding:3px 0}
.ky-info span:first-child{color:rgba(46,20,10,.55);flex-shrink:0;min-width:96px}
.ky-info span:last-child{min-width:0;overflow-wrap:anywhere;font-weight:500}
.ky-banner{margin:12px 0;padding:12px 14px;border-radius:10px;font-weight:600;font-size:15px;line-height:1.45}
.ky-banner.ok{background:rgba(91,122,82,.14);color:#3f5a38}
.ky-banner.off{background:rgba(46,20,10,.07);color:rgba(46,20,10,.72)}
.ky-banner.warn{background:rgba(227,97,34,.12);color:#8a3d1c}
.ky-banner small{display:block;font-weight:400;margin-top:4px}
.ky-ct{background:#fbf7ec;border:1px solid rgba(46,20,10,.12);border-radius:12px;padding:14px;margin-bottom:12px}
.ky-ct h2{font-size:16.5px;margin:0 0 2px;font-weight:700;overflow-wrap:anywhere}
.ky-lv{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.05em;padding:1px 8px;border-radius:99px;
  background:rgba(138,61,28,.1);color:#8a3d1c;margin-bottom:6px}
.ky-ct details{font-size:14px;margin:6px 0;color:rgba(46,20,10,.8)}
.ky-ct summary{cursor:pointer;font-weight:600;color:#8a3d1c}
.ky-ct ul{margin:6px 0;padding-left:18px}
.ky-ct li{margin:3px 0}
.ky-kq{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.ky-kq button{height:46px;border-radius:10px;border:1px solid rgba(46,20,10,.2);background:#fff;color:#2e140a;
  font-size:15.5px;font-weight:600;cursor:pointer}
.ky-kq button.on-dat{background:#3f7a4f;border-color:#3f7a4f;color:#fff}
.ky-kq button.on-khong{background:#b5432e;border-color:#b5432e;color:#fff}
.ky-res{margin-top:8px;font-weight:700;font-size:15px}
.ky-res.dat{color:#3f7a4f}.ky-res.khong{color:#b5432e}
.ky-lbl{display:block;font-size:13px;font-weight:600;color:rgba(46,20,10,.65);margin:10px 0 4px}
.ky-in,.ky-ta{width:100%;box-sizing:border-box;border:1px solid rgba(46,20,10,.22);border-radius:10px;background:#fff;
  color:#2e140a;font:inherit;font-size:16px;padding:10px 12px}
.ky-ta{min-height:70px;resize:vertical}
.ky-in:focus,.ky-ta:focus{outline:2px solid #e36122;outline-offset:1px}
.ky-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
.ky-photo{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:#eadfca}
.ky-photo img{width:100%;height:100%;object-fit:cover;display:block}
.ky-photo button{position:absolute;top:4px;right:4px;width:28px;height:28px;border-radius:99px;border:0;
  background:rgba(0,0,0,.55);color:#fff;font-size:16px;cursor:pointer}
.ky-add{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:10px;border:2px dashed rgba(46,20,10,.25);
  color:#8a3d1c;font-weight:600;font-size:14px;cursor:pointer;text-align:center;padding:4px}
.ky-sec{font-size:15px;font-weight:700;margin:20px 0 6px}
.ky-pad{position:relative;background:#fff;border:1px solid rgba(46,20,10,.25);border-radius:12px;touch-action:none}
.ky-pad canvas{display:block;width:100%;height:min(48vh,380px);touch-action:none;cursor:crosshair}
.ky-pad .ky-pad-hint{position:absolute;left:0;right:0;bottom:44%;text-align:center;color:rgba(46,20,10,.25);
  font-size:15px;pointer-events:none}
.ky-pad .ky-pad-line{position:absolute;left:24px;right:24px;bottom:42px;border-bottom:1px dashed rgba(46,20,10,.25);pointer-events:none}
.ky-pad-clear{margin-top:6px;background:none;border:0;color:#8a3d1c;font-weight:600;font-size:14px;cursor:pointer;padding:4px 0}
.ky-btn{width:100%;margin-top:16px;height:54px;border:0;border-radius:12px;background:#e36122;color:#fff;
  font-size:17px;font-weight:700;cursor:pointer}
.ky-btn.sec{background:#fff;color:#b5432e;border:1px solid #b5432e;height:48px;font-size:16px}
.ky-btn.ok{background:#3f7a4f}
.ky-btn:disabled{opacity:.55}
.ky-a{display:block;text-align:center;text-decoration:none;line-height:54px}
.ky-err{margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(181,67,46,.1);color:#b5432e;font-size:14px}
.ky-note{font-size:13px;color:rgba(46,20,10,.55);margin-top:10px;text-align:center}
.ky-sigbox{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
.ky-sig{background:#fbf7ec;border:1px solid rgba(46,20,10,.12);border-radius:12px;padding:10px;text-align:center;font-size:13px}
.ky-sig b{display:block;font-size:12px;letter-spacing:.05em;color:rgba(46,20,10,.6)}
.ky-sig img{max-width:100%;height:70px;object-fit:contain;display:block;margin:4px auto}
.ky-sig .nm{font-weight:700;font-size:14px}
.ky-sig .tm{color:rgba(46,20,10,.55);font-size:12px}
.ky-bar{position:fixed;left:0;right:0;bottom:0;background:#fbf7ec;border-top:1px solid rgba(46,20,10,.14);
  padding:10px 16px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -4px 18px rgba(46,20,10,.08)}
.ky-bar .in{max-width:640px;margin:0 auto;display:grid;grid-template-columns:1fr 2fr;gap:8px}
.ky-bar .ky-btn{margin-top:0}
.ky-bar .in.one{display:block}
.ky-prog{font-size:13px;color:rgba(46,20,10,.6);text-align:center;margin-bottom:6px}
.ky-modal{position:fixed;inset:0;background:#f5efe1;z-index:50;overflow-y:auto}
.ky-modal .ky-wrap{padding-bottom:40px}
.ky-chk{display:flex;gap:10px;align-items:flex-start;margin-top:14px;font-size:15px;line-height:1.45}
.ky-chk input{width:22px;height:22px;flex-shrink:0;margin-top:1px;accent-color:#e36122}
/* Ô nhập sáng theo brand — ép !important vì CSS chung app (nền tối) đè background/màu chữ input (giống /nv). */
.ky-in,.ky-ta{background:#fffdf8 !important;color:#2e140a !important;-webkit-text-fill-color:#2e140a !important;
  border:1.5px solid rgba(138,61,28,.28) !important;box-shadow:none !important;opacity:1 !important}
.ky-in:focus,.ky-ta:focus{border-color:#e36122 !important;outline:none !important;box-shadow:0 0 0 3px rgba(227,97,34,.15) !important}
.ky-in::placeholder,.ky-ta::placeholder{color:rgba(46,20,10,.38) !important;-webkit-text-fill-color:rgba(46,20,10,.38) !important}
.ky-kq button,.ky-btn.sec{-webkit-text-fill-color:currentColor}
.ky-x{background:none;border:0;color:#8a3d1c;font-size:15px;font-weight:600;cursor:pointer;padding:0;margin-bottom:6px}

/* ── Tờ biên bản A4 (giống PDF), thu vừa màn hình bằng zoom, vuốt 2 ngón phóng to ── */
.ky-head{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;gap:8px;align-items:center;
  padding:9px 12px;background:#2e140a;color:#f5efe1;font-size:13px;font-weight:600}
.ky-head-hint{font-weight:400;opacity:.7;font-size:12px;white-space:nowrap}
.ky-top{max-width:640px;margin:0 auto;padding:4px 12px 0}
.ky-top .ky-btn{margin-top:4px}
.ky-hl{background:#fff1b8;outline:1.5px dashed #e36122;padding:0 4px;border-radius:3px;color:#8a3d1c}
.pp-stack{padding:8px 8px 150px;display:flex;flex-direction:column;align-items:center;gap:12px}
.ky-paper{width:794px;min-height:1123px;box-sizing:border-box;background:#fff;color:#2b2621;padding:56px 56px 70px;
  position:relative;box-shadow:0 2px 14px rgba(46,20,10,.18);font-family:"DejaVu Sans",Arial,Helvetica,sans-serif;
  font-size:13.3px;line-height:1.45;text-align:left}
.ky-paper hr{border:0;border-top:1px solid #d9d1c4;margin:12px 0}
.pp-co{text-align:center;font-weight:700;color:#b5542e;font-size:14px}
.pp-co-sub{text-align:center;color:#736859;font-size:11.3px}
.pp-qh{text-align:center;font-weight:700;font-size:13.3px;margin-top:12px}
.pp-qh2{text-align:center;font-size:12.7px}
.pp-title{text-align:center;font-weight:700;font-size:18.7px;margin-top:14px}
.pp-title2{text-align:center;font-weight:700;font-size:15.3px;color:#b5542e;margin:2px 0 10px}
.pp-kv{margin:1px 0}.pp-kv b{color:#736859}
.pp-ct{margin:10px 0 12px}
.pp-ct-h{font-weight:700;font-size:14.7px}
.pp-ind{margin-left:16px}
.pp-ct ul{margin:0 0 0 28px;padding-left:10px;font-size:12px}
.pp-ct li{margin:0}
.pp-b{font-weight:700;font-size:12px}
.pp-sm{font-size:11.3px}
.pp-mute{color:#8a7f72}
.pp-kq{margin-top:4px;font-weight:700;font-size:13.3px;padding:3px 6px}
.pp-kq .pp-note{font-weight:400;color:#2b2621;font-size:12.7px}
.pp-ok{color:#2e7d4f}.pp-no{color:#a33b29}
.pp-pre{white-space:pre-wrap;min-height:20px;padding:3px 6px}
.pp-fill{background:#fff6d1;outline:2px dashed #e36122;outline-offset:1px;border-radius:4px;cursor:pointer}
.pp-todo{color:#8a3d1c;animation:ppblink 1.6s ease-in-out infinite}
@keyframes ppblink{50%{background:#ffe48a}}
.pp-sigs{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:6px}
.pp-sig{text-align:center}
.pp-sig-l{font-weight:700;font-size:13.3px}
.pp-sig-box{height:110px;margin:6px auto 4px;width:260px;display:flex;align-items:center;justify-content:center}
.pp-sig-box img{max-width:240px;max-height:100px;object-fit:contain}
.pp-sig-cta{font-weight:700;color:#b5542e;font-size:18px;animation:ppblink 1.6s ease-in-out infinite}
.pp-sig-n{font-weight:700;font-size:14px;min-height:20px}
.pp-sig-t{color:#8a7f72;font-size:10.7px;min-height:15px}
.pp-sig-doi{text-align:left;padding-top:2px}
.ky-paper.pp-short{min-height:0;padding-bottom:80px}
.pp-photos{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pp-photos img{width:100%;height:290px;object-fit:contain;background:#f3efe8;display:block}
.pp-addph{margin-top:14px;padding:22px;text-align:center;font-weight:700;color:#8a3d1c;font-size:18px}
.pp-foot{position:absolute;left:56px;right:56px;bottom:26px;border-top:1px solid #d9d1c4;padding-top:5px;color:#8a7f72;font-size:10px}
`;
