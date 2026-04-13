import { useState } from "react";

const DEALS = [
  { id: 1, name: "Project Apollo", client: "Confidential", status: "Active DD", docs: 24, lastActivity: "2 hours ago", participants: 5 },
  { id: 2, name: "Project Chord", client: "AdLib Media Group", status: "Engagement", docs: 11, lastActivity: "1 day ago", participants: 3 },
  { id: 3, name: "Project Titan", client: "Confidential", status: "IOI Stage", docs: 7, lastActivity: "3 days ago", participants: 2 },
];

const FOLDERS = [
  { name: "Financials", icon: "📊", count: 8, sub: ["Income Statements", "Balance Sheets", "Cash Flow", "Projections"] },
  { name: "Legal", icon: "⚖️", count: 6, sub: ["Corporate Docs", "Contracts", "IP", "Compliance"] },
  { name: "Operations", icon: "⚙️", count: 4, sub: ["SOPs", "Org Chart", "Vendor Agreements"] },
  { name: "Human Capital", icon: "👥", count: 3, sub: ["Key Personnel", "Benefits", "Employment Agreements"] },
  { name: "Tax", icon: "🏛️", count: 2, sub: ["Federal", "State", "Transfer Pricing"] },
  { name: "Technology", icon: "💻", count: 1, sub: ["Architecture", "Security", "Licenses"] },
];

const FILES = [
  { name: "2025 P&L - Audited.pdf", size: "2.4 MB", uploaded: "Apr 8, 2026", by: "Mike H.", status: "new" },
  { name: "Revenue by Customer - 2023-2025.xlsx", size: "890 KB", uploaded: "Apr 7, 2026", by: "Mike H.", status: "viewed" },
  { name: "Management Projections - 3yr.xlsx", size: "1.1 MB", uploaded: "Apr 5, 2026", by: "Rob Levin", status: "viewed" },
  { name: "AR Aging Schedule Q1 2026.pdf", size: "340 KB", uploaded: "Apr 4, 2026", by: "Mike H.", status: "new" },
  { name: "Working Capital Analysis.pdf", size: "520 KB", uploaded: "Apr 2, 2026", by: "Rob Levin", status: "viewed" },
];

const ACTIVITY = [
  { action: "uploaded", user: "Mike H.", file: "2025 P&L - Audited.pdf", time: "2 hours ago", icon: "⬆" },
  { action: "viewed", user: "Rob Levin", file: "Revenue by Customer - 2023-2025.xlsx", time: "5 hours ago", icon: "👁" },
  { action: "uploaded", user: "Mike H.", file: "AR Aging Schedule Q1 2026.pdf", time: "1 day ago", icon: "⬆" },
  { action: "downloaded", user: "Rob Levin", file: "Management Projections - 3yr.xlsx", time: "2 days ago", icon: "⬇" },
  { action: "joined", user: "Sarah K. (Counsel)", file: null, time: "3 days ago", icon: "🔑" },
  { action: "created folder", user: "Rob Levin", file: "Tax", time: "4 days ago", icon: "📁" },
];

const PARTICIPANTS = [
  { name: "Rob Levin", role: "Admin", email: "rob@cispartners.co", status: "online" },
  { name: "Mike Hauptman", role: "Client", email: "mike@adlib.com", status: "online" },
  { name: "Sarah Kim", role: "Counsel", email: "skim@lawfirm.com", status: "offline" },
  { name: "David Chen", role: "Buyer Rep", email: "dchen@pe-firm.com", status: "offline" },
  { name: "Lisa Park", role: "CIS Team", email: "lisa@cispartners.co", status: "online" },
];

export default function DealPortal() {
  const [view, setView] = useState("deals"); // deals | workspace
  const [activeDeal, setActiveDeal] = useState(null);
  const [activeFolder, setActiveFolder] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [sidePanel, setSidePanel] = useState("activity"); // activity | participants

  const openDeal = (deal) => { setActiveDeal(deal); setView("workspace"); setActiveFolder(FOLDERS[0]); };
  const goBack = () => { setView("deals"); setActiveDeal(null); setActiveFolder(null); };

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", background: "#0B0F1A", color: "#E8E9ED", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(11,15,26,0.95)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {view === "workspace" && (
            <button onClick={goBack} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", gap: 6, padding: "4px 0" }}>
              ← All Deals
            </button>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #2563EB, #1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>C</div>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.02em" }}>CIS Deal Room</span>
          </div>
        </div>
        {view === "workspace" && activeDeal && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{activeDeal.name}</span>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: activeDeal.status === "Active DD" ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)", color: activeDeal.status === "Active DD" ? "#4ADE80" : "#FCD34D", fontWeight: 500 }}>{activeDeal.status}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {view === "workspace" && (
            <>
              <button onClick={() => setShowInvite(true)} style={{ ...btnStyle, background: "rgba(255,255,255,0.06)", color: "#D1D5DB" }}>+ Invite</button>
              <button onClick={() => setShowUpload(true)} style={{ ...btnStyle, background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff" }}>↑ Upload Files</button>
            </>
          )}
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #2563EB, #7C3AED)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>RL</div>
        </div>
      </header>

      {/* Deal List View */}
      {view === "deals" && (
        <div style={{ flex: 1, padding: "48px 32px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.03em" }}>Deal Rooms</h1>
              <p style={{ color: "#6B7280", fontSize: 14, margin: "6px 0 0" }}>Manage documents and collaboration across active engagements</p>
            </div>
            <button style={{ ...btnStyle, background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff", fontSize: 14, padding: "10px 20px" }}>+ New Deal Room</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {DEALS.map(deal => (
              <div key={deal.id} onClick={() => openDeal(deal)} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px 24px", cursor: "pointer", transition: "all 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.3)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}>{deal.name}</span>
                    <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 20, background: deal.status === "Active DD" ? "rgba(34,197,94,0.12)" : deal.status === "Engagement" ? "rgba(59,130,246,0.12)" : "rgba(251,191,36,0.12)", color: deal.status === "Active DD" ? "#4ADE80" : deal.status === "Engagement" ? "#60A5FA" : "#FCD34D", fontWeight: 500 }}>{deal.status}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>{deal.client}</span>
                </div>
                <div style={{ display: "flex", gap: 32, alignItems: "center" }}>
                  <Stat label="Documents" value={deal.docs} />
                  <Stat label="Participants" value={deal.participants} />
                  <Stat label="Last Activity" value={deal.lastActivity} small />
                  <span style={{ color: "#4B5563", fontSize: 18 }}>→</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workspace View */}
      {view === "workspace" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Folder Sidebar */}
          <div style={{ width: 240, borderRight: "1px solid rgba(255,255,255,0.06)", padding: "20px 0", flexShrink: 0, overflowY: "auto" }}>
            <div style={{ padding: "0 16px", marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6B7280" }}>Folders</span>
            </div>
            {FOLDERS.map(f => (
              <div key={f.name} onClick={() => setActiveFolder(f)} style={{ padding: "10px 16px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: activeFolder?.name === f.name ? "rgba(37,99,235,0.1)" : "transparent", borderRight: activeFolder?.name === f.name ? "2px solid #2563EB" : "2px solid transparent", transition: "all 0.1s" }}
                onMouseEnter={e => { if (activeFolder?.name !== f.name) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (activeFolder?.name !== f.name) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{f.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: activeFolder?.name === f.name ? 600 : 400, color: activeFolder?.name === f.name ? "#fff" : "#D1D5DB" }}>{f.name}</span>
                </div>
                <span style={{ fontSize: 12, color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{f.count}</span>
              </div>
            ))}
          </div>

          {/* File List */}
          <div style={{ flex: 1, padding: "24px 32px", overflowY: "auto" }}>
            {activeFolder && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>{activeFolder.icon} {activeFolder.name}</h2>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input placeholder="Search files..." style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 14px", color: "#E8E9ED", fontSize: 13, width: 200, outline: "none" }} />
                  </div>
                </div>

                {/* Subfolder chips */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                  {activeFolder.sub.map(s => (
                    <span key={s} style={{ fontSize: 12, padding: "5px 14px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9CA3AF", cursor: "pointer", transition: "all 0.1s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(37,99,235,0.1)"; e.currentTarget.style.borderColor = "rgba(37,99,235,0.3)"; e.currentTarget.style.color = "#93C5FD"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#9CA3AF"; }}>
                      {s}
                    </span>
                  ))}
                </div>

                {/* File table */}
                <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px 120px 60px", padding: "10px 20px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#6B7280" }}>
                    <span>File</span><span>Size</span><span>Uploaded</span><span>By</span><span></span>
                  </div>
                  {FILES.map((f, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 140px 120px 60px", padding: "14px 20px", borderBottom: i < FILES.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", alignItems: "center", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{f.name.endsWith(".pdf") ? "📄" : "📊"}</span>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{f.name}</span>
                        {f.status === "new" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "rgba(37,99,235,0.15)", color: "#60A5FA", fontWeight: 600 }}>NEW</span>}
                      </div>
                      <span style={{ fontSize: 13, color: "#6B7280", fontFamily: "'JetBrains Mono', monospace" }}>{f.size}</span>
                      <span style={{ fontSize: 13, color: "#9CA3AF" }}>{f.uploaded}</span>
                      <span style={{ fontSize: 13, color: "#9CA3AF" }}>{f.by}</span>
                      <span style={{ fontSize: 16, color: "#6B7280", cursor: "pointer" }}>⬇</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Right Panel */}
          <div style={{ width: 280, borderLeft: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
            <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              {["activity", "participants"].map(tab => (
                <button key={tab} onClick={() => setSidePanel(tab)} style={{ flex: 1, padding: "14px 0", background: "none", border: "none", borderBottom: sidePanel === tab ? "2px solid #2563EB" : "2px solid transparent", color: sidePanel === tab ? "#fff" : "#6B7280", fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize" }}>{tab}</button>
              ))}
            </div>

            <div style={{ padding: 16 }}>
              {sidePanel === "activity" && ACTIVITY.map((a, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: i < ACTIVITY.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ fontSize: 14, marginTop: 2 }}>{a.icon}</span>
                    <div>
                      <div style={{ fontSize: 13 }}>
                        <span style={{ fontWeight: 600, color: "#E5E7EB" }}>{a.user}</span>{" "}
                        <span style={{ color: "#9CA3AF" }}>{a.action}</span>
                      </div>
                      {a.file && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, lineHeight: 1.4 }}>{a.file}</div>}
                      <div style={{ fontSize: 11, color: "#4B5563", marginTop: 4 }}>{a.time}</div>
                    </div>
                  </div>
                </div>
              ))}

              {sidePanel === "participants" && PARTICIPANTS.map((p, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: i < PARTICIPANTS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #1E3A5F, #2563EB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>{p.name.split(" ").map(n => n[0]).join("")}</div>
                    <div style={{ position: "absolute", bottom: 0, right: 0, width: 10, height: 10, borderRadius: "50%", background: p.status === "online" ? "#22C55E" : "#4B5563", border: "2px solid #0B0F1A" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{p.role}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowUpload(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 32, width: 480 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>Upload Documents</h3>
            <div style={{ border: "2px dashed rgba(37,99,235,0.3)", borderRadius: 12, padding: "48px 24px", textAlign: "center", background: "rgba(37,99,235,0.04)" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📁</div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "#D1D5DB" }}>Drag & drop files here</p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6B7280" }}>or click to browse — PDF, Excel, Word, images</p>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" }}>Upload to folder</label>
              <select style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#E8E9ED", fontSize: 14 }}>
                {FOLDERS.map(f => <option key={f.name}>{f.icon} {f.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowUpload(false)} style={{ ...btnStyle, background: "rgba(255,255,255,0.06)", color: "#D1D5DB" }}>Cancel</button>
              <button style={{ ...btnStyle, background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff" }}>Upload</button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setShowInvite(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#141824", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 32, width: 440 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 600 }}>Invite Participant</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" }}>Email address</label>
              <input placeholder="name@company.com" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#E8E9ED", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" }}>Role</label>
              <select style={{ width: "100%", padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#E8E9ED", fontSize: 14 }}>
                <option>Client</option><option>Counsel</option><option>Buyer Rep</option><option>CIS Team</option><option>View Only</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 6, display: "block" }}>Folder access</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {FOLDERS.map(f => (
                  <label key={f.name} style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9CA3AF", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" defaultChecked style={{ accentColor: "#2563EB" }} /> {f.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowInvite(false)} style={{ ...btnStyle, background: "rgba(255,255,255,0.06)", color: "#D1D5DB" }}>Cancel</button>
              <button style={{ ...btnStyle, background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff" }}>Send Invite</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = { border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };

function Stat({ label, value, small }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: small ? 13 : 16, fontWeight: 600, color: small ? "#9CA3AF" : "#E5E7EB", fontFamily: small ? "inherit" : "'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}
