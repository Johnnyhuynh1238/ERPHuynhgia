import type { CgItem, ConstructionGuide } from "@/lib/construction-guide";
import { PrintBar } from "./print-bar";
import "./hd-thi-cong.css";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("vi-VN") : "—");
const pad = (n: number) => String(n).padStart(2, "0");

type Props = {
  projectCode: string;
  projectName: string;
  customerName: string;
  address: string;
  signedAt: string | null;
  plSources: string[];
  guide: ConstructionGuide | null;
  backHref: string;
};

// Tài liệu A4: Bìa (thông tin + nhiệm vụ giám sát + mục lục) → từng hạng mục (vật tư + điểm dừng
// nghiệm thu dạng checklist tick tay) → phía sau: biên bản nghiệm thu đội thi công, mỗi điểm dừng 1 biên bản.
export function HdDoc(p: Props) {
  const g = p.guide;
  const total = g ? g.items.length : 0;
  const stageCount = g ? g.items.reduce((s, it) => s + it.stages.length, 0) : 0;
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <div className="cg-root">
      <PrintBar backHref={p.backHref} label={p.projectCode} />
      {!g ? (
        <div className="cg-sheet">
          <p>Dự án chưa gắn hợp đồng có báo giá / phụ lục vật tư — chưa lập được hướng dẫn thi công.</p>
        </div>
      ) : (
        <>
          {/* ── BÌA ── */}
          <section className="cg-sheet cg-cover">
            <div className="cg-brand">
              <b>XÂY DỰNG HUỲNH GIA</b>
              <span>Hotline 0931.316.513 · huynhgia6.com</span>
            </div>
            <div className="cg-title">
              <div className="cg-eyebrow">Tài liệu giám sát tại công trình</div>
              <h1>HƯỚNG DẪN THI CÔNG &amp; NGHIỆM THU</h1>
              <div className="cg-proj">{p.projectName}</div>
            </div>
            <table className="cg-info">
              <tbody>
                <tr>
                  <th>Chủ đầu tư</th>
                  <td>{p.customerName}</td>
                  <th>Mã dự án</th>
                  <td>{p.projectCode}</td>
                </tr>
                <tr>
                  <th>Địa chỉ</th>
                  <td colSpan={3}>{p.address}</td>
                </tr>
                <tr>
                  <th>Căn cứ</th>
                  <td colSpan={3}>
                    Hợp đồng thi công ký {fmtDate(p.signedAt)}
                    {p.plSources.length ? ` · ${p.plSources.join(" · ")}` : ""}
                  </td>
                </tr>
                <tr>
                  <th>Giám sát phụ trách</th>
                  <td className="cg-fill" />
                  <th>Ngày phát hành</th>
                  <td>{today}</td>
                </tr>
              </tbody>
            </table>

            <div className="cg-duty">
              <div className="cg-duty-h">Nhiệm vụ giám sát — kiểm soát đúng 2 việc</div>
              <ol>
                <li>
                  <b>Vật tư đúng HĐ.</b> Mọi vật tư đưa vào thi công phải đúng chủng loại, hãng, quy cách ở mục{" "}
                  <i>A. Vật tư sử dụng</i> của từng hạng mục. Sai → không nhận, không cho dùng, báo admin ngay.
                </li>
                <li>
                  <b>Nghiệm thu đúng tiêu chí.</b> Đến mỗi điểm dừng, kiểm tra đủ từng dòng ở mục{" "}
                  <i>B. Điểm dừng nghiệm thu</i>. Chỉ khi đạt hết mới ký biên bản cho đội thi công làm bước tiếp
                  theo. Không đạt → ghi tồn tại, đội sửa xong nghiệm thu lại.
                </li>
              </ol>
              <div className="cg-howto">
                Cách dùng: tick ☑ vào ô Đạt / Không đạt, ghi chú ngay trên giấy. Biên bản nghiệm thu từng điểm dừng
                nằm ở cuối tài liệu (số biên bản = số điểm dừng). Vật tư chủ nhà tự cấp: kiểm đếm, lập biên bản giao
                nhận với chủ nhà.
              </div>
            </div>

            <div className="cg-toc-h">
              Mục lục — {total} hạng mục · {stageCount} điểm dừng nghiệm thu
            </div>
            <table className="cg-toc">
              <thead>
                <tr>
                  <th className="n">STT</th>
                  <th>Hạng mục</th>
                  <th className="r">Điểm dừng / biên bản</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={it.no}>
                    <td className="n">{pad(it.no)}</td>
                    <td>{it.name}</td>
                    <td className="r">
                      {it.stages.length} · BB {it.stages[0]?.no}
                      {it.stages.length > 1 ? `–${it.stages[it.stages.length - 1].no}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {g.excluded.length > 0 && (
              <div className="cg-excl">
                <b>Không thuộc phạm vi HĐ</b> (chủ nhà tự làm — không thi công, không nghiệm thu):{" "}
                {g.excluded.map((x) => x.ten).join("; ")}.
              </div>
            )}
          </section>

          {/* ── TỪNG HẠNG MỤC ── */}
          {g.items.map((it) => (
            <HangMuc key={it.no} it={it} total={total} />
          ))}

          {/* ── BIÊN BẢN ── */}
          <section className="cg-sheet cg-bbcover">
            <div className="cg-eyebrow">Phần cuối</div>
            <h2>BIÊN BẢN NGHIỆM THU NỘI BỘ — ĐỘI THI CÔNG</h2>
            <p>
              Mỗi điểm dừng 1 biên bản. Giám sát chỉ ký khi đã kiểm đủ bảng tiêu chí tương ứng — ký xong đội thi
              công mới được làm bước tiếp theo.
            </p>
          </section>
          {g.items.flatMap((it) =>
            it.stages.map((s) => (
              <BienBan
                key={s.no}
                no={s.no}
                hangMuc={it.name}
                stage={s.title}
                count={s.items.length}
                projectName={p.projectName}
                customerName={p.customerName}
              />
            )),
          )}
        </>
      )}
    </div>
  );
}

function HangMuc({ it, total }: { it: CgItem; total: number }) {
  return (
    <section className="cg-sheet cg-hm">
      <header className="cg-hm-h">
        <span className="cg-hm-no">
          {pad(it.no)}
          <small>/{pad(total)}</small>
        </span>
        <div>
          <div className="cg-eyebrow">{it.kind === "tho" ? "Phần thô" : "Hoàn thiện"}</div>
          <h2>{it.name}</h2>
        </div>
      </header>

      {(it.scope.length > 0 || it.notes.length > 0) && (
        <div className="cg-scope">
          <b>Phạm vi theo HĐ:</b>
          {it.scope.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
          {it.notes.length > 0 && (
            <ul>
              {it.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h3>A. Vật tư sử dụng</h3>
      {it.vt.length === 0 ? (
        <p className="cg-muted">Theo phạm vi HĐ ở trên.</p>
      ) : (
        <table className="cg-tbl cg-vt">
          <colgroup>
            <col className="w1" />
            <col className="w2" />
            <col className="w3" />
            <col className="w0" />
          </colgroup>
          <thead>
            <tr>
              <th>Vật tư</th>
              <th>Chủng loại · quy cách theo HĐ</th>
              <th>Kiểm tra khi nhận</th>
              <th className="ck">Đạt</th>
            </tr>
          </thead>
          <tbody>
            {it.vt.map((v, i) => (
              <tr key={i} className={v.khachCap ? "kc" : ""}>
                <td>
                  <b>{v.ten}</b>
                  {v.src && <span className="cg-src">{v.khachCap ? `Chủ nhà cấp · ${v.src}` : `Đổi · ${v.src}`}</span>}
                </td>
                <td>
                  {v.loai && <span className="cg-brand2">{v.loai}</span>}
                  {v.quycach && <span className="cg-qc">{v.quycach}</span>}
                </td>
                <td>
                  {v.khachCap ? (
                    <span className="cg-qc">Chủ nhà cấp: kiểm đếm, lập biên bản giao nhận với chủ nhà</span>
                  ) : (
                    <ul className="cg-chk">
                      {v.check.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="ck">☐</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>B. Điểm dừng nghiệm thu</h3>
      {it.stages.map((s) => (
        <div key={s.no} className="cg-stage">
          <div className="cg-stage-h">
            <span className="cg-stage-no">{s.no}</span>
            <span className="cg-stage-t">{s.title}</span>
            <span className="cg-stage-bb">→ ký BB {s.no}</span>
          </div>
          {s.steps.length > 0 && (
            <p className="cg-steps">
              <b>Trình tự thi công:</b>{" "}
              {s.steps.map((x, i) => (
                <span key={i}>
                  {i + 1}) {x}
                  {i < s.steps.length - 1 ? "; " : "."}
                </span>
              ))}
            </p>
          )}
          {s.notes.length > 0 && (
            <p className="cg-steps">
              <b>Lưu ý:</b> {s.notes.join("; ")}
            </p>
          )}
          <table className="cg-tbl cg-crit">
            <colgroup>
              <col className="c0" />
              <col className="c1" />
              <col className="c2" />
              <col className="c3" />
              <col className="c3" />
              <col className="c4" />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>Nội dung kiểm tra</th>
                <th>Yêu cầu / sai số cho phép</th>
                <th className="ck">Đạt</th>
                <th className="ck">Không</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {s.items.map((c, i) => (
                <tr key={i}>
                  <td className="n">{i + 1}</td>
                  <td>
                    <b>{c.noi}</b>
                  </td>
                  <td>{c.yc}</td>
                  <td className="ck">☐</td>
                  <td className="ck">☐</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="cg-foot">
        Bản vẽ KC/KT của công trình là căn cứ cao nhất. Sai số tham khảo TCVN 4453:1995, TCVN 4085:2011, TCVN 9377.
      </p>
    </section>
  );
}

function BienBan(p: {
  no: string;
  hangMuc: string;
  stage: string;
  count: number;
  projectName: string;
  customerName: string;
}) {
  return (
    <section className="cg-bb">
      <div className="cg-bb-top">
        <span>XÂY DỰNG HUỲNH GIA</span>
        <span>
          Số: <b>{p.no}</b>
        </span>
      </div>
      <h3 className="cg-bb-title">BIÊN BẢN NGHIỆM THU NỘI BỘ</h3>
      <table className="cg-bb-info">
        <tbody>
          <tr>
            <th>Công trình</th>
            <td>
              {p.projectName} — CĐT {p.customerName}
            </td>
          </tr>
          <tr>
            <th>Hạng mục</th>
            <td>{p.hangMuc}</td>
          </tr>
          <tr>
            <th>Điểm dừng</th>
            <td>
              <b>
                {p.no}. {p.stage}
              </b>
            </td>
          </tr>
          <tr>
            <th>Thời gian</th>
            <td>....... giờ ....... ngày ....... / ....... / 20.......</td>
          </tr>
          <tr>
            <th>Đội thi công</th>
            <td>..................................................................................</td>
          </tr>
        </tbody>
      </table>
      <div className="cg-bb-res">
        Đã kiểm tra theo bảng tiêu chí <b>{p.no}</b>: đạt ......... / {p.count} mục.
      </div>
      <div className="cg-bb-lbl">Tồn tại cần khắc phục:</div>
      <div className="cg-lines">
        <i />
        <i />
        <i />
      </div>
      <div className="cg-bb-kl">
        <span>☐ ĐẠT — cho chuyển bước thi công tiếp theo</span>
        <span>☐ KHÔNG ĐẠT — khắc phục, nghiệm thu lại ngày ...... / ......</span>
      </div>
      <div className="cg-sign">
        <div>
          <b>ĐẠI DIỆN ĐỘI THI CÔNG</b>
          <span>(Ký, ghi rõ họ tên)</span>
        </div>
        <div>
          <b>GIÁM SÁT HUỲNH GIA</b>
          <span>(Ký, ghi rõ họ tên)</span>
        </div>
      </div>
    </section>
  );
}
