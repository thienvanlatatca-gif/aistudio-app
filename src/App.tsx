import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

interface VFile { name: string; file: File; size: number; }
interface Row   { id: number; files: VFile[]; qty: number; selected: VFile[]; folderName: string; }
type Phase = "loading" | "idle" | "rendering" | "done" | "error";

const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|flv|m4v|wmv|ts|mts|3gp|mxf)$/i;
const isVideo   = (n: string) => VIDEO_EXT.test(n);
const fmtMB     = (b: number) => (b / 1048576).toFixed(1) + " MB";
const shuffle   = <T,>(a: T[]) => [...a].sort(() => Math.random() - .5);
let   _id       = 0;
const mkRow     = (): Row => ({ id: ++_id, files: [], qty: 1, selected: [], folderName: "" });

let _ff: FFmpeg | null = null;
let _ready = false;

async function getFFmpeg(onLog: (m: string) => void) {
  if (_ready) return true;
  try {
    onLog("Đang khởi tạo FFmpeg.wasm…");
    _ff = new FFmpeg();
    _ff.on("log", ({ message }: any) => {
      if (/time=|frame=|speed=/.test(message ?? "")) onLog(message);
    });
    await _ff.load();
    _ready = true;
    onLog("✅ FFmpeg.wasm sẵn sàng!");
    return true;
  } catch (e: any) {
    onLog("❌ Lỗi: " + e.message); return false;
  }
}

export default function App() {
  const [rows,    setRows]    = useState<Row[]>([mkRow(), mkRow()]);
  const [outName, setOutName] = useState("video_ghep.mp4");
  const [phase,   setPhase]   = useState<Phase>("loading");
  const [pct,     setPct]     = useState(0);
  const [logs,    setLogs]    = useState<string[]>([]);
  const [dlUrl,   setDlUrl]   = useState<string | null>(null);
  const [outSize, setOutSize] = useState(0);
  const pickerRef = useRef<HTMLInputElement>(null);
  const pickId    = useRef<number | null>(null);
  const logRef    = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs(l => [...l.slice(-80), msg]);
    requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; });
  };

  useEffect(() => {
    getFFmpeg(addLog).then(ok => setPhase(ok ? "idle" : "error"));
  }, []);

  const addRow    = () => setRows(r => [...r, mkRow()]);
  const deleteRow = (id: number) => setRows(r => r.filter(x => x.id !== id));
  const clearAll  = () => {
    setRows(r => r.map(x => ({ ...x, files: [], selected: [], folderName: "" })));
    if (dlUrl) { URL.revokeObjectURL(dlUrl); setDlUrl(null); }
    setPhase(_ready ? "idle" : "loading");
    setPct(0); setLogs([]);
  };

  const openPicker = (id: number) => { pickId.current = id; pickerRef.current?.click(); };
  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = pickId.current; if (id === null) return;
    const files = Array.from(e.target.files ?? []).filter(f => isVideo(f.name));
    if (!files.length) { e.target.value = ""; return; }
    const vf: VFile[] = files.map(f => ({ name: f.name, file: f, size: f.size }));
    const folderName  = ((files[0] as any).webkitRelativePath ?? "").split("/")[0] || "Thư mục";
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
  const busy     = phase === "rendering";

  const doRender = async () => {
    if (!_ready || totalSel === 0 || busy) return;
    const videos = shuffle(allSel);
    const name   = outName.trim() || "video_ghep.mp4";
    if (dlUrl) { URL.revokeObjectURL(dlUrl); setDlUrl(null); }
    setPhase("rendering"); setPct(0); setLogs([]);
    addLog(`🚀 Ghép ${videos.length} video…`);
    try {
      for (let i = 0; i < videos.length; i++) {
        const fn = `v${i}_${videos[i].name.replace(/[^a-zA-Z0-9._]/g, "_")}`;
        addLog(`   [${i+1}/${videos.length}] ${videos[i].name} (${fmtMB(videos[i].size)})`);
        await _ff!.writeFile(fn, await fetchFile(videos[i].file));
        setPct(Math.round((i+1) / videos.length * 42));
      }
      const list = videos.map((v,i) => `file 'v${i}_${v.name.replace(/[^a-zA-Z0-9._]/g,"_")}'`).join("\n");
      await _ff!.writeFile("list.txt", list);
      addLog("⚙ Đang ghép (stream copy)…"); setPct(48);
      await _ff!.exec(["-f","concat","-safe","0","-i","list.txt","-c","copy",name]);
      setPct(94); addLog("💾 Tạo file tải xuống…");
      const out  = await _ff!.readFile(name);
      const blob = new Blob([out as Uint8Array], { type:"video/mp4" });
      setDlUrl(URL.createObjectURL(blob)); setOutSize(blob.size);
      setPct(100); addLog(`✅ Xong! ${fmtMB(blob.size)}`); setPhase("done");
      for (let i=0;i<videos.length;i++) try { await _ff!.deleteFile(`v${i}_${videos[i].name.replace(/[^a-zA-Z0-9._]/g,"_")}`); } catch(_){}
      try { await _ff!.deleteFile("list.txt"); } catch(_){}
      try { await _ff!.deleteFile(name); }      catch(_){}
    } catch(e:any) { addLog("❌ Lỗi: " + e.message); setPhase("error"); }
  };

  return (
    <div style={S.root}>
      <input ref={pickerRef} type="file" multiple style={{display:"none"}} onChange={onFiles}
        {...{webkitdirectory:"",directory:""} as any} />
      <div style={S.wrap}>
        <div style={S.hdr}>
          <div>
            <div style={S.title}>
              <span style={{...S.dot, background:_ready?"#22d67a":"#f5c518", boxShadow:`0 0 10px ${_ready?"#22d67a":"#f5c518"}`}} />
              Trộn Video &amp; Random
            </div>
            <div style={S.sub}>{_ready
              ? "// FFmpeg.wasm · ghép thật sự trong trình duyệt · tải video xuống"
              : "// Đang tải FFmpeg.wasm…"}</div>
          </div>
          <div style={S.hBtns}>
            <Btn v="red"   onClick={clearAll} disabled={busy}>🗑 Xóa tất cả</Btn>
            <Btn v="ghost" onClick={randAll}  disabled={busy}>🎲 Random tất cả</Btn>
            <Btn v={_ready && totalSel > 0 && !busy ? "green" : "dim"}
              onClick={doRender} disabled={!_ready || totalSel===0 || busy}>
              {busy ? "⏳ Đang ghép…" : "▶ Ghép & Tải xuống"}
            </Btn>
          </div>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
          {rows.map((row,i) => (
            <RowCard key={row.id} row={row} idx={i+1} disabled={busy}
              onPick={()=>openPicker(row.id)} onDel={()=>deleteRow(row.id)}
              onRand={()=>randRow(row.id)} onQtyD={d=>changeQty(row.id,d)} onQtyInp={v=>inputQty(row.id,v)} />
          ))}
        </div>

        <button style={S.addBtn} onClick={addRow} disabled={busy}>＋ &nbsp;Thêm nhóm video mới</button>

        <div style={S.outBar}>
          <span style={S.outLbl}>💾 TÊN FILE:</span>
          <input style={S.outInp} value={outName} onChange={e=>setOutName(e.target.value)}
            placeholder="video_ghep.mp4" disabled={busy} />
        </div>

        <div style={S.stats}>
          {([["Nhóm",rows.length],["Video chọn",totalSel],["Dung lượng nguồn",fmtMB(totalSz)]] as [string,any][]).map(([l,v])=>(
            <div key={l} style={{display:"flex",gap:5,fontSize:".68rem",fontFamily:"monospace"}}>
              <span style={{color:"#2e3340"}}>{l}:</span>
              <span style={{color:"#22d67a"}}>{v}</span>
            </div>
          ))}
        </div>

        {(busy || phase==="done" || phase==="error") && (
          <div style={S.pp}>
            <div style={S.ppTop}>
              <span style={S.ppLbl}>{phase==="done"?"✅ Hoàn tất!":phase==="error"?"❌ Có lỗi":"⏳ Đang xử lý…"}</span>
              <span style={S.ppPct}>{pct}%</span>
            </div>
            <div style={S.track}><div style={{...S.fill,width:pct+"%"}} /></div>
            <div style={S.logBox} ref={logRef}>
              {logs.map((l,i)=>(
                <div key={i} style={{...S.ll,
                  color:l.startsWith("✅")?"#22d67a":l.startsWith("❌")?"#ff5f5f":
                        l.startsWith("🚀")||l.startsWith("⚙")?"#4da6ff":"#3a3f4a"}}>
                  {l}
                </div>
              ))}
            </div>
            {phase==="done" && dlUrl && (
              <div style={{textAlign:"center",marginTop:16}}>
                <div style={{fontSize:".8rem",color:"#5c6475",marginBottom:14}}>
                  <b style={{color:"#22d67a"}}>{totalSel} video</b> đã ghép &nbsp;·&nbsp;
                  Kích thước: <b style={{color:"#22d67a"}}>{fmtMB(outSize)}</b>
                </div>
                <a href={dlUrl} download={outName.trim()||"video_ghep.mp4"} style={S.dlBtn}>
                  ⬇ &nbsp;Tải video xuống
                </a>
                <div style={{marginTop:10}}>
                  <button style={S.again} onClick={clearAll}>🔁 Ghép mới</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{height:1,background:"#1e2024",margin:"18px 0"}} />
        <div style={{textAlign:"center",fontSize:".65rem",color:"#2e3340",fontFamily:"monospace"}}>
          ghép-video-pro · ffmpeg.wasm · 100% trình duyệt · không upload dữ liệu
        </div>
      </div>
    </div>
  );
}

function RowCard({row,idx,disabled,onPick,onDel,onRand,onQtyD,onQtyInp}:{
  row:Row;idx:number;disabled?:boolean;
  onPick:()=>void;onDel:()=>void;onRand:()=>void;
  onQtyD:(d:number)=>void;onQtyInp:(v:string)=>void;
}) {
  const has = row.files.length > 0;
  return (
    <div style={S.card}>
      <div style={S.cardTop}>
        <span style={S.cardN}>{idx}</span>
        <span style={{...S.cardName,...(has?S.cardOn:{})}}>
          {has?`📁 ${row.folderName}  (${row.files.length} video)`:"Chưa chọn thư mục"}
        </span>
        <button style={S.iconBtn} onClick={onDel} disabled={disabled}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>
      <div style={S.ctrl}>
        <button style={S.pickBtn} onClick={onPick} disabled={disabled}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Chọn thư mục
        </button>
        <div style={S.qty}>
          <span style={S.qtyLbl}>Số lượng</span>
          <button style={S.qtyB} onClick={()=>onQtyD(-1)} disabled={disabled}>−</button>
          <input style={S.qtyV} type="number" min="1" value={row.qty}
            onChange={e=>onQtyInp(e.target.value)} disabled={disabled} />
          <button style={S.qtyB} onClick={()=>onQtyD(1)} disabled={disabled}>+</button>
        </div>
        <button style={{...S.randBtn,...(has&&!disabled?S.randOn:{})}}
          onClick={onRand} disabled={disabled||!has}>
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
          ?row.selected.map((v,i)=><span key={i} style={S.chip} title={v.name}>{v.name}</span>)
          :<span style={S.noChip}>Chưa có video nào được chọn</span>}
      </div>
    </div>
  );
}

function Btn({children,onClick,v,disabled}:{children:React.ReactNode;onClick:()=>void;v:"ghost"|"red"|"green"|"dim";disabled?:boolean}) {
  const base:React.CSSProperties={display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:6,fontSize:".78rem",fontWeight:600,fontFamily:"inherit",cursor:disabled?"not-allowed":"pointer",border:"none",whiteSpace:"nowrap",opacity:disabled?.4:1};
  const map={ghost:{background:"#1a1c1f",color:"#9ba3b2",border:"1px solid #272a2f"},red:{background:"#2a1010",color:"#ff5f5f",border:"1px solid #4a1a1a"},green:{background:"#071a10",color:"#22d67a",border:"1px solid #0d4023",boxShadow:"0 0 14px rgba(34,214,122,.2)"},dim:{background:"#1a1c1f",color:"#2e3340",border:"1px solid #1e2024"}};
  return <button style={{...base,...map[v]}} onClick={onClick} disabled={disabled}>{children}</button>;
}

const S:Record<string,React.CSSProperties>={
  root:{minHeight:"100vh",background:"#080909",color:"#eceef2",padding:"28px 16px 80px"},
  wrap:{maxWidth:860,margin:"0 auto"},
  hdr:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,marginBottom:24,flexWrap:"wrap"},
  title:{display:"flex",alignItems:"center",gap:10,fontSize:"1.2rem",fontWeight:700,color:"#fff",marginBottom:5},
  dot:{width:9,height:9,borderRadius:"50%",flexShrink:0},
  sub:{fontSize:".72rem",color:"#2e3340",fontFamily:"monospace"},
  hBtns:{display:"flex",gap:7,flexWrap:"wrap",paddingTop:2},
  card:{background:"#0f1011",border:"1px solid #1e2024",borderRadius:10,padding:"12px 14px"},
  cardTop:{display:"flex",alignItems:"center",gap:9,marginBottom:10},
  cardN:{fontFamily:"monospace",fontSize:".65rem",color:"#2e3340",width:16,textAlign:"center",flexShrink:0},
  cardName:{flex:1,fontSize:".82rem",fontWeight:500,color:"#3a3f4a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
  cardOn:{color:"#eceef2"},
  iconBtn:{width:26,height:26,background:"#1a1c1f",border:"1px solid #272a2f",borderRadius:6,color:"#3a3f4a",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0},
  ctrl:{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"},
  pickBtn:{display:"flex",alignItems:"center",gap:6,background:"#1a1c1f",border:"1px solid #272a2f",borderRadius:6,height:30,padding:"0 11px",fontSize:".75rem",fontWeight:500,color:"#9ba3b2",cursor:"pointer",fontFamily:"inherit"},
  qty:{display:"flex",alignItems:"center",background:"#1a1c1f",border:"1px solid #272a2f",borderRadius:6,overflow:"hidden",height:30},
  qtyLbl:{padding:"0 8px",fontSize:".58rem",fontWeight:700,color:"#2e3340",letterSpacing:".8px",textTransform:"uppercase",borderRight:"1px solid #1e2024",height:"100%",display:"flex",alignItems:"center",whiteSpace:"nowrap",fontFamily:"monospace"},
  qtyB:{width:24,height:"100%",background:"transparent",border:"none",color:"#5c6475",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"},
  qtyV:{width:34,height:"100%",background:"transparent",border:"none",outline:"none",color:"#eceef2",fontFamily:"monospace",fontSize:".8rem",fontWeight:600,textAlign:"center"},
  randBtn:{display:"flex",alignItems:"center",gap:6,background:"#1a1c1f",border:"1px solid #272a2f",borderRadius:6,height:30,padding:"0 11px",fontSize:".75rem",fontWeight:600,color:"#5c6475",cursor:"pointer",fontFamily:"inherit"},
  randOn:{color:"#22d67a",borderColor:"#0d4023",background:"#071a10"},
  chips:{marginTop:8,display:"flex",gap:4,flexWrap:"wrap"},
  chip:{background:"#1a1c1f",border:"1px solid #272a2f",borderRadius:4,padding:"2px 8px",fontSize:".65rem",color:"#9ba3b2",fontFamily:"monospace",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},
  noChip:{fontSize:".7rem",color:"#2e3340",fontStyle:"italic"},
  addBtn:{width:"100%",padding:12,background:"transparent",border:"1px dashed #272a2f",borderRadius:10,color:"#2e3340",fontSize:".78rem",fontWeight:600,fontFamily:"inherit",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:14},
  outBar:{display:"flex",alignItems:"center",gap:10,background:"#0f1011",border:"1px solid #1e2024",borderRadius:8,padding:"9px 14px",marginBottom:8},
  outLbl:{fontSize:".65rem",fontWeight:700,color:"#3a3f4a",whiteSpace:"nowrap",fontFamily:"monospace",letterSpacing:".5px"},
  outInp:{flex:1,background:"transparent",border:"none",outline:"none",fontFamily:"monospace",fontSize:".78rem",color:"#eceef2"},
  stats:{display:"flex",gap:14,flexWrap:"wrap",padding:"8px 14px",background:"#0f1011",border:"1px solid #1e2024",borderRadius:8,marginBottom:10},
  pp:{background:"#0a0c0d",border:"1px solid #1e2024",borderRadius:12,padding:"16px",marginBottom:10},
  ppTop:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8},
  ppLbl:{fontSize:".78rem",color:"#5c6475"},
  ppPct:{fontFamily:"monospace",fontSize:".9rem",fontWeight:700,color:"#22d67a"},
  track:{height:3,background:"#1e2024",borderRadius:3,overflow:"hidden",marginBottom:10},
  fill:{height:"100%",background:"linear-gradient(90deg,#0d4023,#22d67a)",borderRadius:3,transition:"width .3s ease"},
  logBox:{background:"#080909",border:"1px solid #151719",borderRadius:7,padding:"8px 10px",maxHeight:120,overflowY:"auto",scrollbarWidth:"thin"},
  ll:{fontSize:".68rem",lineHeight:1.9,fontFamily:"monospace"},
  dlBtn:{display:"inline-flex",alignItems:"center",gap:8,background:"#0d4023",border:"1px solid #1a6035",borderRadius:8,padding:"10px 24px",fontSize:".88rem",fontWeight:700,color:"#22d67a",textDecoration:"none",boxShadow:"0 0 20px rgba(34,214,122,.2)"},
  again:{background:"#1a1c1f",border:"1px solid #272a2f",borderRadius:7,padding:"7px 18px",fontSize:".78rem",fontWeight:600,color:"#9ba3b2",cursor:"pointer",fontFamily:"inherit"},
};
