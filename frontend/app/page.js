"use client";

import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SECTIONS = ["summary", "skills", "experience", "education", "projects"];

function ScoreCard({ label, score, hint }) {
  return <div className="score-card"><div className="score-top"><span>{label}</span><strong>{score ?? "—"}<small>{score == null ? "" : "%"}</small></strong></div><div className="score-track"><span style={{ width: `${score ?? 0}%` }} /></div><p>{hint}</p></div>;
}

function diffWords(before, after) {
  const oldWords = before.match(/\S+\s*/g) || [];
  const newWords = after.match(/\S+\s*/g) || [];
  if (oldWords.length * newWords.length > 2000000) return { oldWords, newWords, simplified: true };
  const rows = Array.from({ length: oldWords.length + 1 }, () => new Uint32Array(newWords.length + 1));
  for (let i = oldWords.length - 1; i >= 0; i--) {
    for (let j = newWords.length - 1; j >= 0; j--) {
      rows[i][j] = oldWords[i] === newWords[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }
  const beforeOps = [], afterOps = [];
  let i = 0, j = 0;
  while (i < oldWords.length && j < newWords.length) {
    if (oldWords[i] === newWords[j]) { beforeOps.push(["same", oldWords[i++]]); afterOps.push(["same", newWords[j++]]); }
    else if (rows[i + 1][j] >= rows[i][j + 1]) { beforeOps.push(["removed", oldWords[i++]]); }
    else { afterOps.push(["added", newWords[j++]]); }
  }
  while (i < oldWords.length) beforeOps.push(["removed", oldWords[i++]]);
  while (j < newWords.length) afterOps.push(["added", newWords[j++]]);
  return { beforeOps, afterOps, simplified: false };
}

function HighlightedText({ operations, fallback }) {
  if (!operations) return <>{fallback}</>;
  return <>{operations.map(([kind, text], index) => kind === "same" ? text : <mark className={kind} key={index}>{text}</mark>)}</>;
}

export default function Home() {
  const [jd, setJd] = useState("");
  const [file, setFile] = useState(null);
  const [sections, setSections] = useState(["summary", "skills", "experience"]);
  const [versions, setVersions] = useState([]);
  const [activeVersion, setActiveVersion] = useState(0);
  const [compareVersion, setCompareVersion] = useState(0);
  const [view, setView] = useState("resume");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [diffMode, setDiffMode] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("resume-customizer-token");
    if (saved) { setToken(saved); loadUser(saved); }
  }, []);
  useEffect(() => { if (token) loadHistory(token); }, [token]);

  async function loadUser(savedToken) {
    try {
      const response = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } });
      if (!response.ok) throw new Error("Session expired");
      const data = await response.json(); setUser(data.user);
    } catch { window.localStorage.removeItem("resume-customizer-token"); setToken(""); }
  }

  async function loadHistory(savedToken = token) {
    try {
      const response = await fetch(`${API}/history`, { headers: { Authorization: `Bearer ${savedToken}` } });
      if (response.ok) setHistory((await response.json()).items);
    } catch { /* History stays available when the API is offline. */ }
  }

  async function authenticate(event) {
    event.preventDefault(); setError("");
    try {
      const response = await fetch(`${API}/auth/${authMode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Authentication failed");
      window.localStorage.setItem("resume-customizer-token", data.token);
      setToken(data.token); setUser(data.user); setPassword("");
    } catch (e) { setError(e.message); }
  }

  function logout() {
    window.localStorage.removeItem("resume-customizer-token");
    setToken(""); setUser(null); setHistory([]);
  }

  async function generate(kind = "resume") {
    setError(""); setStatus("");
    if (jd.trim().length < 20) { setError("Add the full job description (at least 20 characters). "); return; }
    if (!file) { setError("Upload a PDF or DOCX resume first."); return; }
    if (kind === "resume" && sections.length === 0) { setError("Choose at least one section to customize."); return; }
    setLoading(true);
    const form = new FormData(); form.append("jd", jd); form.append("file", file);
    if (kind === "resume") { form.append("sections", sections.join(",")); form.append("title", `Version ${versions.filter(v => v.kind === "resume").length + 1}`); }
    else form.append("title", "Cover letter");
    try {
      const response = await fetch(`${API}/${kind === "resume" ? "customize" : "cover-letter"}/stream`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      if (!response.ok) {
        let message = "Generation failed";
        try { message = (await response.json()).detail || message; } catch {}
        throw new Error(message);
      }
      if (!response.body) throw new Error("Streaming is not supported by this browser.");
      const reader = response.body.getReader(); const decoder = new TextDecoder();
      let buffer = "", output = "", metadata = null;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const event of events) {
          const eventName = event.match(/^event:\s*(.+)$/m)?.[1]?.trim();
          const dataLine = event.match(/^data:\s*(.*)$/m)?.[1];
          if (!dataLine) continue;
          const data = JSON.parse(dataLine);
          if (eventName === "chunk") { output += data.text; setStatus(kind === "resume" ? "Writing your tailored resume…" : "Drafting your cover letter…"); setLiveOutput(output); }
          else if (eventName === "done") metadata = data;
          else if (eventName === "error") throw new Error(data.message || "Generation failed");
        }
        if (done) break;
      }
      if (!output.trim()) throw new Error("The generator returned an empty response. Please try again.");
      const version = { id: metadata?.historyId || `local-${Date.now()}`, kind, title: kind === "resume" ? `Version ${versions.filter(v => v.kind === "resume").length + 1}` : "Cover letter", text: output, original: metadata?.original || "", matchScore: metadata?.matchScore ?? null, originalMatchScore: metadata?.originalMatchScore ?? null, atsScore: metadata?.atsScore ?? null, createdAt: new Date().toISOString() };
      setVersions(current => [version, ...current]); setActiveVersion(0); setCompareVersion(0); setView(kind); setDiffMode(false); setLiveOutput(""); setStatus("Done — your result is ready.");
      if (token) loadHistory(token);
    } catch (e) { setError(e.message || "Something went wrong."); setLiveOutput(""); }
    finally { setLoading(false); }
  }

  const [liveOutput, setLiveOutput] = useState("");
  const displayedVersions = versions.filter(v => v.kind === view);
  const active = displayedVersions[activeVersion];
  const compare = displayedVersions[compareVersion];
  const diff = useMemo(() => active?.kind === "resume" && active.original ? diffWords(active.original, active.text) : null, [active]);

  async function download(text, format, name = "resume") {
    const form = new FormData(); form.append("text", text); form.append("format", format);
    try {
      const response = await fetch(`${API}/download`, { method: "POST", body: form });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a");
      const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "result";
      anchor.href = url; anchor.download = `${safeName}.${format}`; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
  }

  function viewHistory(item) {
    restoreHistory(item);
    window.setTimeout(() => document.querySelector(".result-column")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function restoreHistory(item) {
    const restored = { id: item.id, kind: item.kind, title: item.title, text: item.result, original: item.original_resume, matchScore: item.match_score, originalMatchScore: null, atsScore: item.ats_score, createdAt: new Date(item.created_at * 1000).toISOString() };
    setVersions(current => [restored, ...current.filter(v => String(v.id) !== String(restored.id))]);
    setActiveVersion(0); setCompareVersion(0); setView(item.kind); setDiffMode(false); setShowHistory(false);
    setJd(item.job_description);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">R</span><span>resumely<span className="brand-dot">.</span><small>CAREER STUDIO</small></span></a>
        <div className="top-actions">
          {user ? <><button className="quiet-button" onClick={() => setShowHistory(v => !v)}>History <span className="history-count">{history.length}</span></button><span className="user-email">{user.email}</span><button className="quiet-button" onClick={logout}>Sign out</button></> : <a href="#account" className="quiet-button">Sign in to save history</a>}
          <span className="secure-pill"><i /> Private by design</span>
        </div>
      </header>

      {showHistory && <aside className="history-panel"><div className="panel-title"><div><h3>Your history</h3><p>View or download a saved result</p></div><button className="icon-button" onClick={() => setShowHistory(false)}>×</button></div>{history.length ? history.map(item => <div className="history-item" key={item.id}><span className="history-icon">{item.kind === "resume" ? "R" : "C"}</span><span className="history-description"><strong>{item.title}</strong><small>{item.kind === "resume" ? "Resume" : "Cover letter"} · {new Date(item.created_at * 1000).toLocaleDateString()}</small><span className="history-actions"><button onClick={() => viewHistory(item)}>View result</button><button onClick={() => download(item.result, "docx", item.title)}>DOCX ↓</button><button onClick={() => download(item.result, "pdf", item.title)}>PDF ↓</button><button onClick={() => download(item.result, "txt", item.title)}>TXT ↓</button></span></span></div>) : <p className="empty-history">No saved generations yet. Sign in and create your first tailored version.</p>}</aside>}

      <section className="hero"><div className="eyebrow"><span className="sparkle">✦</span> YOUR NEXT CHAPTER STARTS HERE</div><h1>A resume that gets<br /><em>you noticed.</em></h1><p>Tailor your experience to the role, keep every detail truthful, and walk into the application with confidence.</p><div className="hero-points"><span><b>01</b> Match the role</span><span><b>02</b> Refine your story</span><span><b>03</b> Apply with confidence</span></div></section>

      <div className="workspace-grid">
        <section className="input-column">
          <div className="section-heading"><span className="step-number">01</span><div><h2>Tell us where you’re headed</h2><p>Start with the job you want.</p></div></div>
          <label className="field-label" htmlFor="job-description">JOB DESCRIPTION <span>Required</span></label>
          <textarea id="job-description" className="jd-input" value={jd} onChange={e => setJd(e.target.value)} placeholder="Paste the full job description here — responsibilities, qualifications, and all..." />
          <div className="input-footer"><span>Tip: include the complete listing for a stronger match.</span><span>{jd.length} characters</span></div>

          <div className="section-heading upload-heading"><span className="step-number">02</span><div><h2>Bring your experience</h2><p>We’ll only work with what’s true.</p></div></div>
          <label htmlFor="resume-file" className={`upload-card ${file ? "has-file" : ""}`}><input id="resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => setFile(e.target.files?.[0] || null)} /><span className="upload-icon">↑</span><strong>{file ? file.name : "Drop your resume here"}</strong><span>{file ? `${(file.size / 1024).toFixed(0)} KB · Ready to use` : "or click to browse · PDF or DOCX · up to 5 MB"}</span></label>

          <div className="section-heading customize-heading"><span className="step-number">03</span><div><h2>Choose what to tailor</h2><p>Unselected sections stay as close to the original as possible.</p></div></div>
          <div className="section-pills">{SECTIONS.map(section => <label className={`section-pill ${sections.includes(section) ? "selected" : ""}`} key={section}><input type="checkbox" checked={sections.includes(section)} onChange={() => setSections(current => current.includes(section) ? current.filter(s => s !== section) : [...current, section])} /><span>{sections.includes(section) ? "✓" : "+"}</span>{section[0].toUpperCase() + section.slice(1)}</label>)}</div>

          <button className="primary-button" onClick={() => generate("resume")} disabled={loading}><span>{loading ? "Working on your resume…" : "Tailor my resume"}</span><b>{loading ? "···" : "↗"}</b></button>
          <button className="cover-button" onClick={() => generate("cover_letter")} disabled={loading}><span>✧</span> Create a cover letter</button>
          <p className="truth-note"><span>✦</span> Your facts stay your facts. We never invent qualifications or achievements.</p>
          {error && <div className="error-message" role="alert">{error}</div>}
          {status && <p className="status-message" aria-live="polite">{status}</p>}

          <div className="account-card" id="account"><div className="account-copy"><span className="account-icon">⌂</span><div><strong>{user ? "History is on" : "Keep your versions close"}</strong><p>{user ? `Signed in as ${user.email}` : "Create an account to save and revisit your tailored resumes."}</p></div></div>{user ? <button className="text-link" onClick={() => setShowHistory(true)}>View history →</button> : <form className="auth-form" onSubmit={authenticate}><div className="auth-modes" role="group" aria-label="Account action"><button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Sign in</button><button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Create account</button></div><input type="email" required placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} aria-label="Email address" /><input type="password" minLength={8} required placeholder="Password (8+ characters)" value={password} onChange={e => setPassword(e.target.value)} aria-label="Password (at least 8 characters)" /><button type="submit" className="auth-submit">{authMode === "login" ? "Sign in" : "Create account"}</button></form>}</div>
        </section>

        <section className="result-column"><div className="result-header"><div><div className="result-label"><span className="result-live" /> YOUR CAREER STUDIO</div><h2>Your tailored workspace</h2></div><span className="private-tag">✦ PRIVATE</span></div>
          {(versions.length > 0 || liveOutput) ? <>
            <div className="result-tabs"><button className={view === "resume" ? "active" : ""} onClick={() => setView("resume")}>Resume</button><button className={view === "cover_letter" ? "active" : ""} onClick={() => setView("cover_letter")}>Cover letter</button></div>
            {displayedVersions.length > 0 && <div className="version-strip"><div className="version-buttons">{displayedVersions.map((version, index) => <button key={version.id} className={index === activeVersion ? "selected" : ""} onClick={() => setActiveVersion(index)}>{version.title}</button>)}</div>{displayedVersions.length > 1 && <label className="compare-select">Compare with <select value={compareVersion} onChange={e => setCompareVersion(Number(e.target.value))}>{displayedVersions.map((version, index) => <option key={version.id} value={index}>{version.title}</option>)}</select></label>}</div>}
            {active ? <>
              {view === "resume" && <div className="score-grid"><ScoreCard label="JD match" score={active.matchScore} hint={active.originalMatchScore == null ? "Keyword overlap with this role" : `Original resume: ${active.originalMatchScore}%`} /><ScoreCard label="ATS readiness" score={active.atsScore} hint="Estimated formatting & structure score" /></div>}
              <div className="output-toolbar"><div className="output-switch">{view === "resume" && <><button className={!diffMode ? "selected" : ""} onClick={() => setDiffMode(false)}>View result</button><button className={diffMode ? "selected" : ""} onClick={() => setDiffMode(true)}>Compare changes</button></>}</div><div className="download-actions"><strong>Download {view === "resume" ? "resume" : "cover letter"}:</strong>{["docx", "pdf", "txt"].map(format => <button key={format} onClick={() => download(active.text, format, active.title)}>{format.toUpperCase()} ↓</button>)}</div></div>
              {view === "resume" && diffMode ? <div className="resume-diff"><div className="diff-legend"><span><i className="removed-key" /> Removed or changed</span><span><i className="added-key" /> Added or changed</span></div><div className="diff-content"><div className="diff-original"><h4>BEFORE</h4><pre>{diff?.simplified ? active.original : <HighlightedText operations={diff?.beforeOps} fallback={active.original || "Original resume text unavailable for this saved item."} />}</pre></div><div className="diff-tailored"><h4>AFTER · {active.title.toUpperCase()}</h4><pre>{diff?.simplified ? active.text : <HighlightedText operations={diff?.afterOps} fallback={active.text} />}</pre></div></div></div> : <div className="document-output"><div className="letter-stamp">✧ {view === "resume" ? "TAILORED RESUME" : "PERSONALIZED FOR THIS ROLE"}</div><pre>{active.text}</pre></div>}
              {displayedVersions.length > 1 && compare && compare.id !== active.id && <div className="compare-panel"><div className="compare-title"><div><span className="result-label">VERSION COMPARISON</span><h3>{active.title} <span>vs.</span> {compare.title}</h3></div></div><div className="compare-columns"><article><h4>{active.title}</h4><pre>{active.text}</pre></article><article><h4>{compare.title}</h4><pre>{compare.text}</pre></article></div></div>}
              <p className="score-disclaimer">Match and ATS scores are estimates based on keyword overlap and common formatting signals—not guarantees of hiring outcomes.</p>
            </> : <div className="empty-state"><div className="empty-art"><span>✦</span><i /><b /></div><h3>A more intentional application<br />starts with one good match.</h3><p>Your tailored resume and cover letter will appear here. Make another version to compare your approach.</p><div className="empty-list"><span>✧ <b>Role-aware language</b></span><span>✧ <b>Your experience, truthfully told</b></span><span>✧ <b>Ready to download and refine</b></span></div></div>}
          </> : <><div className="score-grid score-placeholder"><ScoreCard label="JD match" score={null} hint="Compared against the role" /><ScoreCard label="ATS readiness" score={null} hint="Structure and parsing estimate" /></div><div className="empty-state"><div className="empty-art"><span>✦</span><i /><b /></div><h3>A more intentional application<br />starts with one good match.</h3><p>Your tailored resume and cover letter will appear here. Make another version to compare your approach.</p><div className="empty-list"><span>✧ <b>Role-aware language</b></span><span>✧ <b>Your experience, truthfully told</b></span><span>✧ <b>Ready to download and refine</b></span></div></div></>}
          {loading && liveOutput && <div className="stream-preview"><div><span className="result-live" /> LIVE DRAFT</div><pre>{liveOutput}</pre></div>}
        </section>
      </div>
      <footer className="footer"><span>resumely<span className="brand-dot">.</span> <small>Made for the next step.</small></span><span>Thoughtful tools for your working life.</span></footer>
    </main>
  );
}
