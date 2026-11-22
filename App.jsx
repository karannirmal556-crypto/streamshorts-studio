import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, AudioWaveform, Check, ChevronDown,
  CircleHelp, Clapperboard, Clock3, CloudUpload, Cpu, Download, FileVideo,
  Film, Gamepad2, Gauge, HardDrive, Layers3, LoaderCircle, Menu, Play,
  Scissors, Settings2, ShieldCheck, Sparkles, Subtitles, Trash2, Upload,
  WandSparkles, X, Zap
} from "lucide-react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";
const fmt = (s) => `${Math.floor(s / 60).toString().padStart(2,"0")}:${Math.floor(s % 60).toString().padStart(2,"0")}`;
const uid = () => Math.random().toString(36).slice(2, 9);

function App() {
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [clipLength, setClipLength] = useState(25);
  const [clipCount, setClipCount] = useState(5);
  const [captionText, setCaptionText] = useState("");
  const [clips, setClips] = useState([]);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeNav, setActiveNav] = useState("Create Shorts");
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [urlInput, setUrlInput] = useState("");
  const [sourceMode, setSourceMode] = useState("upload");
  const [quality, setQuality] = useState("720");
  const videoRef = useRef(null);
  const fileInput = useRef(null);
  const ffmpegRef = useRef(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);

  const loadFFmpeg = async () => {
    if (ffmpegReady) return ffmpegRef.current;
    if (ffmpegLoading) throw new Error("FFmpeg is already loading. Please wait.");
    setFfmpegLoading(true); setStatus("Loading video engine…");
    try {
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => setProgress(Math.max(0, Math.min(100, Math.round(progress * 100)))));
      ffmpeg.on("log", ({ message }) => {
        if (message.includes("Error")) setStatus("Processing video…");
      });
      await ffmpeg.load({
        coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm")
      });
      ffmpegRef.current = ffmpeg;
      setFfmpegReady(true);
      return ffmpeg;
    } finally { setFfmpegLoading(false); }
  };

  const setSource = (f) => {
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|mkv|webm|avi)$/i.test(f.name)) {
      setError("Please choose a supported video file (MP4, MOV, MKV, WebM or AVI)."); return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(f); setVideoUrl(URL.createObjectURL(f)); setClips([]); setError("");
    setStatus("Video loaded");
  };

  const onVideoMeta = () => {
    if (videoRef.current) setDuration(videoRef.current.duration || 0);
  };

  const analyze = async () => {
    if (!file || !videoRef.current) return;
    setError(""); setBusy("analyze"); setStatus("Analysing audio energy…"); setProgress(8);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      const channel = buffer.getChannelData(0);
      const sr = buffer.sampleRate, windowSize = sr;
      const energy = [];
      for (let i = 0; i < channel.length; i += windowSize) {
        let sum = 0, n = Math.min(windowSize, channel.length - i);
        for (let j = 0; j < n; j += 4) sum += channel[i+j] * channel[i+j];
        energy.push(Math.sqrt(sum / Math.max(1, Math.ceil(n/4))));
      }
      await ctx.close();
      if (!energy.length) throw new Error("No audio track found. Try a video with audio.");
      setProgress(60);
      const smooth = energy.map((_, i) => {
        const lo = Math.max(0, i - 2), hi = Math.min(energy.length, i + 3);
        return energy.slice(lo, hi).reduce((a,b)=>a+b,0)/(hi-lo);
      });
      const baseline = [...smooth].sort((a,b)=>a-b)[Math.floor(smooth.length/2)] || 0.001;
      const scores = energy.map((v,i) => (v / Math.max(0.004, baseline)) + Math.max(0, v-smooth[i])*8);
      const candidates = scores.map((score,i)=>({score, start: Math.max(0, Math.min(duration-clipLength, i+0.5-clipLength/2))}))
        .sort((a,b)=>b.score-a.score);
      const chosen = [];
      for (const c of candidates) {
        if (duration < clipLength) break;
        if (chosen.every(x => Math.abs(x.start-c.start) > clipLength*0.85)) chosen.push(c);
        if (chosen.length >= clipCount) break;
      }
      const result = chosen.sort((a,b)=>a.start-b.start).map((c,i)=>({
        id: uid(), start: c.start, length: Math.min(clipLength, duration-c.start),
        score: Math.min(99, Math.round(48 + Math.log2(Math.max(1,c.score))*12)),
        label: c.score > 4 ? "High-energy moment" : "Reaction candidate",
        category: "Energy spike", rendered: false, blob: null, name: `short-${String(i+1).padStart(2,"0")}.mp4`
      }));
      setClips(result); setProgress(100); setStatus(`${result.length} moments found`);
      if (!result.length) setError("No moments found. Check that the video has an audio track and is longer than your selected clip length.");
    } catch (e) { setError(e.message || "Audio analysis failed."); }
    finally { setBusy(""); setTimeout(()=>setProgress(0), 900); }
  };

  const makeCaptionPng = async (ffmpeg, text) => {
    if (!text.trim()) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1080; canvas.height = 260;
    const c = canvas.getContext("2d");
    c.fillStyle = "rgba(4,7,15,0.78)";
    const lines = [];
    const words = text.trim().split(/\s+/);
    let line = "";
    c.font = "bold 58px Arial";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (c.measureText(test).width > 940 && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    const lineHeight = 70, boxH = Math.min(230, lines.length*lineHeight+36), y0 = 260-boxH;
    c.roundRect(35, y0, 1010, boxH, 24); c.fill();
    c.textAlign = "center"; c.textBaseline = "middle";
    lines.slice(0,3).forEach((t,i) => {
      c.lineWidth = 7; c.strokeStyle = "#080a10"; c.strokeText(t,540,y0+28+i*lineHeight+lineHeight/2);
      c.fillStyle = "#fff"; c.fillText(t,540,y0+28+i*lineHeight+lineHeight/2);
    });
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    await ffmpeg.writeFile("caption.png", await fetchFile(blob));
    return "caption.png";
  };

  const renderOne = async (clip, index, ffmpeg) => {
    const inputName = "input-video";
    const outName = `render-${index}.mp4`;
    const width = quality === "1080" ? 1080 : 720;
    const height = width * 16 / 9;
    const cap = await makeCaptionPng(ffmpeg, captionText);
    const filter = cap
      ? `[0:v]split=2[bg][fg];[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=22:10[blur];[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[front];[blur][front]overlay=(W-w)/2:(H-h)/2[base];[1:v]scale=${width}:-1[cap];[base][cap]overlay=(W-w)/2:H-h-80,setsar=1[v]`
      : `[0:v]split=2[bg][fg];[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=22:10[blur];[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[front];[blur][front]overlay=(W-w)/2:(H-h)/2,setsar=1[v]`;
    const args = ["-ss", String(clip.start), "-i", inputName];
    if (cap) args.push("-loop","1","-i","caption.png");
    args.push("-t",String(clip.length),"-filter_complex",filter,"-map","[v]","-map","0:a?","-c:v","libx264","-preset","ultrafast","-crf",quality==="1080"?"25":"27","-c:a","aac","-b:a","128k","-shortest",outName);
    await ffmpeg.exec(args);
    const data = await ffmpeg.readFile(outName);
    const blob = new Blob([data.buffer], {type:"video/mp4"});
    await ffmpeg.deleteFile(outName);
    return blob;
  };

  const renderAll = async () => {
    if (!file || !clips.length) return;
    setError(""); setBusy("render"); setStatus("Starting browser video engine…");
    try {
      const ffmpeg = await loadFFmpeg();
      await ffmpeg.writeFile("input-video", await fetchFile(file));
      const updated = [...clips];
      for (let i=0;i<updated.length;i++) {
        setStatus(`Rendering short ${i+1} of ${updated.length}…`);
        setProgress(Math.round((i/updated.length)*100));
        const blob = await renderOne(updated[i], i, ffmpeg);
        updated[i] = {...updated[i], blob, rendered:true};
        setClips([...updated]);
      }
      setProgress(100); setStatus("All shorts exported");
    } catch (e) {
      setError(`Render failed: ${e.message || e}. Try a shorter/smaller MP4 or lower output quality.`);
      setStatus("Render failed");
    } finally { setBusy(""); setTimeout(()=>setProgress(0),1200); }
  };

  const downloadClip = (clip) => {
    if (!clip.blob) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(clip.blob); a.download = clip.name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  };

  const clearAll = () => {
    setFile(null); setClips([]); setDuration(0); setError(""); setStatus("Ready");
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const nav = ["Create Shorts","My Clips","Settings"];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Clapperboard size={21}/></div><div><b>streamshorts</b><span>CREATOR STUDIO</span></div></div>
      <div className="workspace"><span className="workspace-dot"></span><div><b>Personal workspace</b><small>Free browser plan</small></div><ChevronDown size={15}/></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map((n,i)=><button key={n} className={`nav-item ${activeNav===n?"active":""}`} onClick={()=>setActiveNav(n)}>
        {i===0?<WandSparkles size={18}/>:i===1?<Film size={18}/>:<Settings2 size={18}/>}<span>{n}</span>{i===1&&clips.length>0&&<em>{clips.length}</em>}
      </button>)}
      <div className="sidebar-bottom">
        <div className="plan-card"><div className="plan-icon"><Zap size={16}/></div><b>Free browser processing</b><p>Your videos stay on this device. No cloud rendering charges.</p><div className="plan-line"><span></span></div><small>Local compute · Your browser</small></div>
        <div className="profile"><div className="avatar">S</div><div><b>Creator</b><small>Local session</small></div><ChevronDown size={15}/></div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="crumb">Workspace <span>/</span> <b>{activeNav}</b></div><div className="top-actions"><div className="engine-pill"><span className={ffmpegReady?"green-dot":"yellow-dot"}></span>{ffmpegReady?"Video engine ready":"Video engine loads on export"}</div><button className="icon-btn" title="Help"><CircleHelp size={18}/></button><div className="avatar small">S</div></div></header>
      {activeNav==="Create Shorts" ? <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> AI-POWERED CLIP WORKFLOW</div><h1>Turn long streams into <span>shorts.</span></h1><p>Find high-energy moments, shape them for vertical video, and export — all in your browser.</p></div><div className="heading-chip"><ShieldCheck size={16}/> Private by design</div></div>
        <div className="stats-row">
          <div className="stat-card"><div className="stat-icon purple"><FileVideo size={18}/></div><div><small>Source video</small><b>{file?file.name:"Not added"}</b></div></div>
          <div className="stat-card"><div className="stat-icon blue"><Clock3 size={18}/></div><div><small>Video duration</small><b>{duration?fmt(duration):"—"}</b></div></div>
          <div className="stat-card"><div className="stat-icon green"><Scissors size={18}/></div><div><small>Moments found</small><b>{clips.length}</b></div></div>
        </div>

        <div className="section-title"><div><span className="step">01</span><div><h2>Bring your video</h2><p>Start with a local video file. Processing happens in this browser tab.</p></div></div><button className="text-button" onClick={()=>setShowSettings(!showSettings)}><Settings2 size={16}/> Output settings</button></div>
        {showSettings&&<div className="settings-inline"><label>Output resolution<select value={quality} onChange={e=>setQuality(e.target.value)}><option value="720">720 × 1280 (recommended for 8 GB RAM)</option><option value="1080">1080 × 1920 (slower, higher memory)</option></select></label><label>Clip length<select value={clipLength} onChange={e=>setClipLength(Number(e.target.value))}><option value="20">20 seconds</option><option value="25">25 seconds</option><option value="30">30 seconds</option></select></label><label>Number of clips<select value={clipCount} onChange={e=>setClipCount(Number(e.target.value))}>{[1,2,3,4,5,6,8,10].map(n=><option key={n} value={n}>{n} clips</option>)}</select></label></div>}
        <div className={`upload-panel ${drag?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);setSource(e.dataTransfer.files?.[0])}}>
          {!file ? <><div className="upload-icon"><CloudUpload size={27}/></div><h3>Drop your gameplay or stream recording here</h3><p>or browse files from your device</p><button className="primary-btn" onClick={()=>fileInput.current?.click()}><Upload size={16}/> Choose video</button><input ref={fileInput} hidden type="file" accept="video/*,.mkv,.avi" onChange={e=>setSource(e.target.files?.[0])}/><div className="file-hints"><span><Check size={13}/> MP4, MOV, WebM</span><span><Check size={13}/> Up to your device's available memory</span><span><Check size={13}/> Processed locally</span></div></>
          : <div className="loaded-file"><div className="file-thumb"><FileVideo size={28}/></div><div className="file-meta"><b>{file.name}</b><span>{(file.size/1024/1024).toFixed(1)} MB · {duration?fmt(duration):"Reading duration…"}</span><span className="file-status"><Check size={13}/> Video ready</span></div><button className="icon-btn" onClick={clearAll} title="Remove video"><Trash2 size={17}/></button></div>}
        </div>
        <div className="url-note"><div className="note-icon"><CircleHelp size={16}/></div><div><b>Using a YouTube or Twitch link?</b><p>Direct link importing is not enabled in this browser-only build because those platforms restrict cross-site downloads. Download your own recording through the platform's permitted tools, then upload it here.</p></div></div>

        <div className="section-title second"><div><span className="step">02</span><div><h2>Find your best moments</h2><p>Audio-energy analysis finds loud reactions and action spikes as candidate moments.</p></div></div></div>
        <div className="analysis-card">
          <div className="analysis-left"><div className="analysis-icon"><AudioWaveform size={22}/></div><div><b>High-energy moment detection</b><p>Scans audio intensity and ranks candidate timestamps. It does not yet understand humour, game context or emotion.</p></div></div>
          <div className="analysis-controls"><div className="mini-setting"><small>CLIP LENGTH</small><b>{clipLength}s</b></div><div className="mini-setting"><small>CLIPS TO FIND</small><b>{clipCount}</b></div><button className="primary-btn" disabled={!file||!!busy} onClick={analyze}>{busy==="analyze"?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>} Find moments</button></div>
        </div>

        {clips.length>0&&<><div className="section-title results-title"><div><span className="step">03</span><div><h2>Review your moments</h2><p>{clips.length} candidate clips ranked by audio energy. Preview before rendering.</p></div></div><span className="result-count">{clips.length} FOUND</span></div>
          <div className="clip-list">{clips.map((c,i)=><div className="clip-row" key={c.id}><div className="clip-number">{String(i+1).padStart(2,"0")}</div><div className="clip-wave"><Activity size={19}/></div><div className="clip-info"><b>{c.label}</b><span>Source {fmt(c.start)} – {fmt(c.start+c.length)} · {c.category}</span></div><div className="score"><b>{c.score}</b><small>ENERGY</small></div><button className="outline-btn small-btn" onClick={()=>{if(videoRef.current){videoRef.current.currentTime=c.start;videoRef.current.play();}}}><Play size={14}/> Preview</button>{c.rendered&&<span className="rendered"><Check size={14}/> Ready</span>}</div>)}</div>
          <div className="caption-panel"><div><Subtitles size={18}/><div><b>Caption overlay (optional)</b><small>One editable title/caption card will be burned into each clip. Word-level automatic speech captions are not included yet.</small></div></div><input value={captionText} onChange={e=>setCaptionText(e.target.value)} placeholder="Type a short caption, e.g. NO WAY THAT JUST HAPPENED!"/></div>
          <div className="export-bar"><div><div className="export-icon"><Clapperboard size={20}/></div><div><b>Ready to create your Shorts?</b><span>Vertical 9:16 · H.264 MP4 · {quality==="720"?"720p":"1080p"}</span></div></div><button className="primary-btn export-btn" disabled={!!busy} onClick={renderAll}>{busy==="render"?<LoaderCircle className="spin" size={17}/>:<WandSparkles size={17}/>} Render {clips.length} Shorts</button></div>
        </>}
        {busy&&<div className="progress-card"><div className="progress-head"><span>{status}</span><b>{progress}%</b></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div><small>Keep this browser tab open while processing. Large videos may take several minutes.</small></div>}
        {clips.some(c=>c.rendered)&&<div className="section-title results-title"><div><span className="step">04</span><div><h2>Your exported Shorts</h2><p>Download each MP4 to your device.</p></div></div></div>}
        {clips.filter(c=>c.rendered).map(c=><div className="exported-row" key={c.id}><div className="exported-preview"><Play size={18}/></div><div className="clip-info"><b>{c.name}</b><span>{fmt(c.start)} · 9:16 vertical</span></div><button className="primary-btn download-btn" onClick={()=>downloadClip(c)}><Download size={15}/> Download MP4</button></div>)}
        {error&&<div className="error-box"><X size={17}/><span>{error}</span></div>}
      </div> : activeNav==="My Clips" ? <div className="content"><div className="page-heading"><div><div className="eyebrow"><Film size={14}/> LIBRARY</div><h1>Your <span>clips.</span></h1><p>Clips generated in this browser session.</p></div></div>{clips.filter(c=>c.rendered).length===0?<div className="empty-state"><Film size={34}/><b>No exported clips yet</b><p>Find moments and render Shorts to see them here.</p><button className="primary-btn" onClick={()=>setActiveNav("Create Shorts")}>Create Shorts</button></div>:clips.filter(c=>c.rendered).map(c=><div className="exported-row" key={c.id}><div className="exported-preview"><Play size={18}/></div><div className="clip-info"><b>{c.name}</b><span>{fmt(c.start)} · {c.length}s</span></div><button className="primary-btn download-btn" onClick={()=>downloadClip(c)}><Download size={15}/> Download</button></div>)}</div>
      : <div className="content"><div className="page-heading"><div><div className="eyebrow"><Settings2 size={14}/> PREFERENCES</div><h1>Studio <span>settings.</span></h1><p>Browser processing preferences and current engine status.</p></div></div><div className="settings-page"><div className="setting-line"><div><b>Video engine</b><p>FFmpeg WebAssembly runs inside your browser.</p></div><span className={ffmpegReady?"state-ok":"state-wait"}>{ffmpegReady?"Loaded":"Loads on first export"}</span></div><div className="setting-line"><div><b>Processing location</b><p>Video data stays in this browser tab during processing.</p></div><span className="state-ok">On-device</span></div><div className="setting-line"><div><b>Output resolution</b><p>Lower resolution is recommended for devices with 8 GB RAM.</p></div><select value={quality} onChange={e=>setQuality(e.target.value)}><option value="720">720 × 1280</option><option value="1080">1080 × 1920</option></select></div><div className="setting-line"><div><b>Privacy</b><p>This app has no account, database or cloud video upload.</p></div><ShieldCheck color="#43d6a0"/></div></div></div>}
      <footer><span>STREAMSHORTS STUDIO <i>·</i> BROWSER BUILD 0.1.0</span><span>Made for creators <Gamepad2 size={14}/></span></footer>
    </main>
    {videoUrl&&<div className="video-dock"><video ref={videoRef} src={videoUrl} controls onLoadedMetadata={onVideoMeta} /></div>}
  </div>;
}

export default App;