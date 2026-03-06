import { useState, useRef } from "react";

interface VFile { name: string; file: File; size: number; path: string; }
interface Row   { id: number; files: VFile[]; qty: number; selected: VFile[]; folderName: string; }

const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|flv|m4v|wmv|ts|mts|3gp|mxf)$/i;
const isVideo   = (n: string) => VIDEO_EXT.test(n);
const fmtMB     = (b: number) => (b / 1048576).toFixed(1) + " MB";
const shuffle   = <T,>(a: T[]) => [...a].sort(() => Math.random() - .5);
let   _id       = 0;
const mkRow     = (): Row => ({ id: ++_id, files: [], qty: 1, selected: [], folderName: "" });

export default function App() {
  const [rows,    setRows]    = useState<Row[]>([mkRow(), mkRow()]);
  const [outName, setOutName] = useState("video_ghep.mp4");
  const [done,    setDone]    = useState(false);
  const [dlBat,   setDlBat]   = useState<string | null>(null);
  const [dlSh,    setDlSh]    = useState<string | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const pickId    = useRef<number | null>(null);

  const addRow    = () => setRows(r => [...r, mkRow()]);
  const deleteRow = (id: number) => setRows(r => r.filter(x => x.id !== id));
  const clearAll  = () => {
    setRows(r => r.map(x => ({ ...x, files: [], selected: [], folderName: "" })));
    [dlBat, dlSh].forEach(u => u && URL.revokeObjectURL(u));
    setDlBat(null); setDlSh(null); setDone(false);
  };

  const openPicker = (id: number) => { pickId.current = id; pickerRef.current?.click(); };
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = pickId.current; if (id === null) return;
    const files = Array.from(e.target.files ?? []).filter(f => isVideo(f.name));
    if (!files.length) { e.target.value = ""; return; }
    const vf: VFile[] = files.map(f => ({
      name: f.name, file: f, size: f.size,
      path: (f as any).webkitRelativePath || f.name,
    }));
    const folderName = ((files[0] as any).webkitRelativePath ?? "").split("/")[0] || "Thư mục";
    setRows(r => r.map(row => {
      if (row.id !== id) return row;
      return { ...row, files: vf, folderName, selected: shuffle(vf).slice(0, Math.min(row.qty, vf.length)) };
    }));
    e.target.value = ""; pickId.current = null;
  };

  const changeQty = (id: number, d: number) => setRows(r => r.map(row => {
    if (row.id !== id) return row;
    const qty = Math.max(1, row.qty + d);
    return { ...row, qty, selected: row.files.length ? shuffle(row.files).slice(0, Math.min(qty, row.files.length)) : row.selected };
  }));
  const inputQty = (id: number, v: string) => setRows(r => r.map(row => {
    if (row.id !== id) return row;
    const qty = Math.max(1, parseInt(v) || 1);
    return { ...row, qty, selected: row.files.length ? shuffle(row.files).slice(0, Math.min(qty, row.files.length)) : row.selected };
  }));

  const randRow = (id: number) => setRows(r => r.map(row =>
    row.id !== id || !row.files.length ? row
    : { ...row, selected: shuffle(row.files).slice(0, Math.min(row.qty, row.files.length)) }
  ));
  const randAll = () => setRows(r => r.map(row =>
    !row.files.length ? row
    : { ...row, selected: shuffle(row.files).slice(0, Math.min(row.qty, row.files.length)) }
  ));

  const allSel   = rows.flatMap(r => r.selected);
  const totalSel = allSel.length;
  const totalSz  = allSel.reduce((s, v) => s + v.size, 0);

  const doGenerate = () => {
    if (!totalSel) return;
    const vids = shuffle(allSel);
    const name = outName.trim() || "video_ghep.mp4";

    // Windows .bat — dùng đường dẫn tương đối từ webkitRelativePath
    const batLines = vids.map(v => `  echo file '${v.path.replace(/\\/g, "/").replace(/'/g, "'")}'`).join("\r\n");
    const bat =
      `@echo off\r\nchcp 65001 > nul\r\necho === Ghep Video Pro ===\r\nset OUT=${name}\r\n` +
      `(\r\n${batLines}\r\n) > filelist.txt\r\n` +
      `ffmpeg -f concat -safe 0 -i filelist.txt -c copy "%OUT%"\r\n` +
      `if %errorlevel%==0 (\r\n  echo.\r\n  echo Hoan tat! File: %OUT%\r\n) else (\r\n  echo.\r\n  echo LOI! Hay cai FFmpeg tai: https://www.gyan.dev/ffmpeg/builds/\r\n)\r\npause\r\n`;

    // Mac/Linux .sh
    const shLines = vids.map(v => `printf "file '%s'\\n" "${v.path.replace(/'/g, "\\'")}"`).join("\n");
    const sh =
      `#!/bin/bash\nOUT="${name}"\nprintf "" > filelist.txt\n${shLines} >> filelist.txt\n` +
      `ffmpeg -f concat -safe 0 -i filelist.txt -c copy "$OUT"\n` +
      `if [ $? -eq 0 ]; then echo "Hoan tat! $OUT"; else echo "Loi! Cai FFmpeg: https://ffmpeg.org/download.html"; fi\n`;

    [dlBat, dlSh].forEach(u => u && URL.revokeObjectURL(u));
    setDlBat(URL.createObjectURL(new Blob([bat], { type: "application/octet-stream" })));
    setDlSh (URL.createObjectURL(new Blob([sh],  { type: "application/octet-stream" })));
    setDone(true);
  };

  return (
    <div style={S.root}>
      <input ref={pickerRef} type="file" multiple style={{ display:"none" }} onChange={onFiles}
        {...{ webkitdirectory:"", directory:"" } as any} />

      <div style={S.wrap}>
        {/* HEADER */}
        <div style={S.hdr}>
          <div>
            <div style={S.title}><span style={S.dot} />Trộn Video &amp; Random</div>
            <div style={S.sub}>// chọn thư mục · random · tạo lệnh ghép 1-click</div>
          </div>
          <div style={S.hBtns}>
            <Btn v="red"   onClick={clearAll}>🗑 Xóa tất cả</Btn>
            <Btn v="ghost" onClick={randAll}>🎲 Random tất cả</Btn>
            <Btn v={totalSel > 0 ? "green" : "dim"} onClick={doGenerate}>
              ▶ Tạo lệnh ghép
            </Btn>
          </div>
        </div>

        {/* ROWS */}
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:8 }}>
          {rows.map((row, i) => (
            <RowCard key={row.id} row={row} idx={i+1}
              onPick={()=>openPicker(row.id)} onDel={()=>deleteRow(row.id)}
              onRand={()=>randRow(row.id)} onQtyD={d=>changeQty(row.id,d)} onQtyInp={v=>inputQty(row.id,v)} />
          ))}
        </div>

        <button style={S.addBtn} onClick={addRow}>＋ &nbsp;Thêm nhóm video mới</button>

        {/* OUTPUT */}
        <div style={S.outBar}>
          <span style={S.outLbl}>💾 TÊN FILE XUẤT:</span>
          <input style={S.outInp} value={outName} onChange={e=>setOutName(e.target.value)} placeholder="video_ghep.mp4" />
        </div>

        {/* STATS */}
        <div style={S.stats}>
          {([["Nhóm",rows.length],["Video chọn",totalSel],["Dung lượng nguồn",fmtMB(totalSz)]] as [string,any][]).map(([l,v])=>(
            <div key={l} style={{ display:"flex", gap:5, fontSize:".68rem", fontFamily:"monospace" }}>
              <span style={{ color:"#2e3340" }}>{l}:</span>
              <span style={{ color:"#22d67a" }}>{v}</span>
            </div>
          ))}
        </div>

        {/* DONE PANEL */}
        {done && dlBat && dlSh && (
          <div style={S.done}>
            <div style={{ fontSize:"2rem", marginBottom:8 }}>🎬</div>
            <div style={S.doneTitle}>Sẵn sàng ghép!</div>
            <div style={S.doneSub}>
              <b style={{ color:"#22d67a" }}>{totalSel} video</b> đã xếp ngẫu nhiên
              &nbsp;·&nbsp; Tổng nguồn: <b style={{ color:"#22d67a" }}>{fmtMB(totalSz)}</b>
            </div>

            <div style={S.dlRow}>
              <a href={dlBat} download="ghep_video.bat" style={S.dlGreen}>
                ⬇ &nbsp;.bat — Windows
              </a>
              <a href={dlSh} download="ghep_video.sh" style={S.dlCyan}>
                ⬇ &nbsp;.sh — Mac / Linux
              </a>
            </div>

            {/* Step-by-step instructions */}
            <div style={S.steps}>
              <div style={S.stepsTitle}>Hướng dẫn chạy:</div>
              <div style={S.step}><span style={S.stepN}>1</span> Tải file <b>.bat</b> (Windows) hoặc <b>.sh</b> (Mac/Linux) về</div>
              <div style={S.step}><span style={S.stepN}>2</span> Đặt file vào <b>cùng thư mục cha</b> chứa các thư mục video</div>
              <div style={S.step}><span style={S.stepN}>3</span> <b>Nhấp đúp</b> để chạy → video ghép xuất hiện ngay trong thư mục đó</div>
              <div style={S.stepNote}>
                ⚙ Cần cài FFmpeg trước:{" "}
                <a href="https://www.gyan.dev/ffmpeg/builds/" target="_blank" rel="noreferrer" style={{ color:"#22d67a" }}>
                  gyan.dev/ffmpeg/builds
                </a>
                {" "}(Windows) &nbsp;·&nbsp;
                <a href="https://formulae.brew.sh/formula/ffmpeg" target="_blank" rel="noreferrer" style={{ color:"#4dd9d9" }}>
                  brew install ffmpeg
                </a>
                {" "}(Mac)
              </div>
            </div>

            <button style={S.again} onClick={clearAll}>🔁 Tạo danh sách mới</button>
          </div>
        )}

        <div style={{ height:1, background:"#1e2024", margin:"18px 0" }} />
        <div style={{ textAlign:"center", fontSize:".65rem", color:"#2e3340", fontFamily:"monospace" }}>
          ghép-video-pro · tạo script ffmpeg 1-click · chạy 100% mọi máy · không upload dữ liệu
        </div>
      </div>
    </div>
  );
}

// ── RowCard ───────────────────────────────────────────────────────────────────
function RowCard({ row, idx, onPick, onDel, onRand, onQtyD, onQtyInp }: {
  row: Row; idx: number;
  onPick:()=>void; onDel:()=>void; onRand:()=>void;
  onQtyD:(d:number)=>void; onQtyInp:(v:string)=>void;
}) {
  const has = row.files.length > 0;
  return (
    <div style={S.card}>
      <div style={S.cardTop}>
        <span style={S.cardN}>{idx}</span>
        <span style={{ ...S.cardName, ...(has ? S.cardOn : {}) }}>
          {has ? `📁 ${row.folderName}  (${row.files.length} video)` : "Chưa chọn thư mục"}
        </span>
        <button style={S.iconBtn} onClick={onDel}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
          </svg>
        </button>
      </div>
      <div style={S.ctrl}>
        <button style={S.pickBtn} onClick={onPick}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          Chọn thư mục
        </button>
        <div style={S.qty}>
          <span style={S.qtyLbl}>Số lượng</span>
          <button style={S.qtyB} onClick={()=>onQtyD(-1)}>−</button>
          <input style={S.qtyV} type="number" min="1" value={row.qty} onChange={e=>onQtyInp(e.target.value)} />
          <button style={S.qtyB} onClick={()=>onQtyD(1)}>+</button>
        </div>
        <button style={{ ...S.randBtn, ...(has ? S.randOn : {}) }} onClick={onRand} disabled={!has}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/>
            <path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1 0 1.8.4 2.5 1"/>
            <path d="M22 18h-5.9c-1.3 0-2.5-.6-3.3-1.7l-.5-.8"/><path d="m18 14 4 4-4 4"/>
          </svg>
          Random
        </button>
      </div>
      <div style={S.chips}>
        {row.selected.length
          ? row.selected.map((v,i) => <span key={i} style={S.chip} title={v.name}>{v.name}</span>)
          : <span style={S.noChip}>Chưa có video nào được chọn</span>}
      </div>
    </div>
  );
}

function Btn({ children, onClick, v }: { children: React.ReactNode; onClick:()=>void; v:"ghost"|"red"|"green"|"dim" }) {
  const base: React.CSSProperties = { display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:6, fontSize:".78rem", fontWeight:600, fontFamily:"inherit", cursor:"pointer", border:"none", whiteSpace:"nowrap" };
  const map = {
    ghost: { background:"#1a1c1f", color:"#9ba3b2", border:"1px solid #272a2f" },
    red:   { background:"#2a1010", color:"#ff5f5f", border:"1px solid #4a1a1a" },
    green: { background:"#071a10", color:"#22d67a", border:"1px solid #0d4023", boxShadow:"0 0 14px rgba(34,214,122,.2)" },
    dim:   { background:"#1a1c1f", color:"#2e3340", border:"1px solid #1e2024" },
  };
  return <button style={{ ...base, ...map[v] }} onClick={onClick}>{children}</button>;
}

const S: Record<string, React.CSSProperties> = {
  root:    { minHeight:"100vh", background:"#080909", color:"#eceef2", padding:"28px 16px 80px" },
  wrap:    { maxWidth:860, margin:"0 auto" },
  hdr:     { display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16, marginBottom:24, flexWrap:"wrap" },
  title:   { display:"flex", alignItems:"center", gap:10, fontSize:"1.2rem", fontWeight:700, color:"#fff", marginBottom:5 },
  dot:     { width:9, height:9, borderRadius:"50%", background:"#22d67a", boxShadow:"0 0 10px #22d67a", flexShrink:0 },
  sub:     { fontSize:".72rem", color:"#2e3340", fontFamily:"monospace" },
  hBtns:   { display:"flex", gap:7, flexWrap:"wrap", paddingTop:2 },

  card:    { background:"#0f1011", border:"1px solid #1e2024", borderRadius:10, padding:"12px 14px" },
  cardTop: { display:"flex", alignItems:"center", gap:9, marginBottom:10 },
  cardN:   { fontFamily:"monospace", fontSize:".65rem", color:"#2e3340", width:16, textAlign:"center", flexShrink:0 },
  cardName:{ flex:1, fontSize:".82rem", fontWeight:500, color:"#3a3f4a", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  cardOn:  { color:"#eceef2" },
  iconBtn: { width:26, height:26, background:"#1a1c1f", border:"1px solid #272a2f", borderRadius:6, color:"#3a3f4a", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 },

  ctrl:    { display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" },
  pickBtn: { display:"flex", alignItems:"center", gap:6, background:"#1a1c1f", border:"1px solid #272a2f", borderRadius:6, height:30, padding:"0 11px", fontSize:".75rem", fontWeight:500, color:"#9ba3b2", cursor:"pointer", fontFamily:"inherit" },
  qty:     { display:"flex", alignItems:"center", background:"#1a1c1f", border:"1px solid #272a2f", borderRadius:6, overflow:"hidden", height:30 },
  qtyLbl:  { padding:"0 8px", fontSize:".58rem", fontWeight:700, color:"#2e3340", letterSpacing:".8px", textTransform:"uppercase", borderRight:"1px solid #1e2024", height:"100%", display:"flex", alignItems:"center", whiteSpace:"nowrap", fontFamily:"monospace" },
  qtyB:    { width:24, height:"100%", background:"transparent", border:"none", color:"#5c6475", cursor:"pointer", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center" },
  qtyV:    { width:34, height:"100%", background:"transparent", border:"none", outline:"none", color:"#eceef2", fontFamily:"monospace", fontSize:".8rem", fontWeight:600, textAlign:"center" },
  randBtn: { display:"flex", alignItems:"center", gap:6, background:"#1a1c1f", border:"1px solid #272a2f", borderRadius:6, height:30, padding:"0 11px", fontSize:".75rem", fontWeight:600, color:"#5c6475", cursor:"pointer", fontFamily:"inherit" },
  randOn:  { color:"#22d67a", borderColor:"#0d4023", background:"#071a10" },

  chips:   { marginTop:8, display:"flex", gap:4, flexWrap:"wrap" },
  chip:    { background:"#1a1c1f", border:"1px solid #272a2f", borderRadius:4, padding:"2px 8px", fontSize:".65rem", color:"#9ba3b2", fontFamily:"monospace", maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  noChip:  { fontSize:".7rem", color:"#2e3340", fontStyle:"italic" },

  addBtn:  { width:"100%", padding:12, background:"transparent", border:"1px dashed #272a2f", borderRadius:10, color:"#2e3340", fontSize:".78rem", fontWeight:600, fontFamily:"inherit", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:14 },

  outBar:  { display:"flex", alignItems:"center", gap:10, background:"#0f1011", border:"1px solid #1e2024", borderRadius:8, padding:"9px 14px", marginBottom:8 },
  outLbl:  { fontSize:".65rem", fontWeight:700, color:"#3a3f4a", whiteSpace:"nowrap", fontFamily:"monospace", letterSpacing:".5px" },
  outInp:  { flex:1, background:"transparent", border:"none", outline:"none", fontFamily:"monospace", fontSize:".78rem", color:"#eceef2" },

  stats:   { display:"flex", gap:14, flexWrap:"wrap", padding:"8px 14px", background:"#0f1011", border:"1px solid #1e2024", borderRadius:8, marginBottom:10 },

  done:      { background:"#071a10", border:"1px solid #0d4023", borderRadius:12, padding:"22px 20px", textAlign:"center", marginBottom:10 },
  doneTitle: { fontSize:"1rem", fontWeight:700, color:"#22d67a", marginBottom:6 },
  doneSub:   { fontSize:".78rem", color:"#5c6475", lineHeight:1.9, marginBottom:18 },
  dlRow:     { display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap", marginBottom:20 },
  dlGreen:   { display:"inline-flex", alignItems:"center", gap:8, background:"#0d4023", border:"1px solid #1a6035", borderRadius:8, padding:"10px 22px", fontSize:".85rem", fontWeight:700, color:"#22d67a", textDecoration:"none", boxShadow:"0 0 16px rgba(34,214,122,.15)" },
  dlCyan:    { display:"inline-flex", alignItems:"center", gap:8, background:"#0a1f20", border:"1px solid #0d3535", borderRadius:8, padding:"10px 22px", fontSize:".85rem", fontWeight:700, color:"#4dd9d9", textDecoration:"none" },

  steps:     { background:"rgba(0,0,0,.3)", border:"1px solid #1a2510", borderRadius:8, padding:"14px 16px", marginBottom:16, textAlign:"left" },
  stepsTitle:{ fontSize:".72rem", fontWeight:700, color:"#5c6475", letterSpacing:".8px", textTransform:"uppercase", marginBottom:10, fontFamily:"monospace" },
  step:      { display:"flex", alignItems:"flex-start", gap:10, fontSize:".78rem", color:"#9ba3b2", lineHeight:1.7, marginBottom:6 },
  stepN:     { minWidth:20, height:20, background:"#0d4023", border:"1px solid #1a6035", borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:".65rem", fontWeight:700, color:"#22d67a", flexShrink:0, marginTop:2 },
  stepNote:  { fontSize:".7rem", color:"#3a3f4a", marginTop:8, lineHeight:1.8 },

  again:     { background:"#1a1c1f", border:"1px solid #272a2f", borderRadius:7, padding:"7px 18px", fontSize:".78rem", fontWeight:600, color:"#9ba3b2", cursor:"pointer", fontFamily:"inherit" },
};
