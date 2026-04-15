/**
 * ClearLine Field Reporter v5
 * Design System v1.0 compliant — full visual rework
 * Changes from v4:
 *  - Fonts: DM Serif Display + DM Sans (replaces Barlow Condensed)
 *  - Colors: Navy-900/Navy-800 dark surface, APWA 811 damage type colors
 *  - Icons: Lucide-style 2px stroke inline SVGs throughout
 *  - CSS variables for all design tokens
 *  - Component specs: buttons, cards, badges, inputs, map markers per Design System v1.0
 *  - APWA color mapping: Telecom orange, Electric red, Water blue on damage types + map pins
 *  - Directional cone on map (50° arc, APWA color)
 *  - Role-based access control UI gating (guest/reporter/contractor/owner/admin)
 *  - Proximity alert at 250ft with urgent ring
 *
 * Environment variables required:
 *  VITE_SUPABASE_URL
 *  VITE_SUPABASE_ANON_KEY
 *
 * Supabase tables: reporters, reports, report_updates
 * Storage bucket: report-photos
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Design tokens (ClearLine Design System v1.0 — Dark Surface) ─────────────
const T = {
  navy900: "#0A1628", navy800: "#0F2040", navy700: "#162952",
  blue700: "#1A4ED8", blue600: "#2563EB", blue400: "#3B82F6",
  white: "#FFFFFF", offwhite: "#F0F4F8",
  // APWA 811 damage colors
  telecom:  "#EA580C",  // Comms infrastructure
  electric: "#DC2626",  // Power / Electric
  water:    "#2563EB",  // Water
  // Internal status
  green:  "#059669", amber: "#D97706", red: "#DC2626",
  // Neutrals (dark surface)
  n900: "#1E2D3D", n800: "#2D3F52", n600: "#4A6080",
  n400: "#7A94AE", n200: "#B0C4D4", n100: "#E2EBF0",
};

// ─── APWA damage types with color mapping ────────────────────────────────────
const DAMAGE_TYPES = [
  { id:"danger",   label:"Danger / Emergency",        icon:"alertTriangle", color:T.electric, apwa:"electric", urgent:true  },
  { id:"power",    label:"Downed Power Line",          icon:"zap",           color:T.electric, apwa:"electric", urgent:true  },
  { id:"aerial",   label:"Downed Aerial Comms",        icon:"wifi",          color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"drop",     label:"Downed Service Drop",        icon:"arrowDown",     color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"pole",     label:"Broken Pole",                icon:"minus",         color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"splice",   label:"Hanging Splice Closure",     icon:"link",          color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"strand",   label:"Damaged Aerial Strand",      icon:"activity",      color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"cable",    label:"Damaged Aerial Cable",       icon:"signal",        color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"vault",    label:"Damaged Vault / Handhole",   icon:"box",           color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"tree",     label:"Tree on Lines",              icon:"tree",          color:T.telecom,  apwa:"telecom",  urgent:false },
  { id:"other",    label:"Other",                      icon:"moreHoriz",     color:T.n400,     apwa:"neutral",  urgent:false },
];

// ─── User roles ───────────────────────────────────────────────────────────────
const ROLES = {
  guest:       { label:"Guest",       level:0, canReport:false, canViewMap:true,  canViewAll:false, canUpdateStatus:false },
  reporter:    { label:"Reporter",    level:1, canReport:true,  canViewMap:true,  canViewAll:false, canUpdateStatus:false },
  contractor:  { label:"Contractor",  level:2, canReport:true,  canViewMap:true,  canViewAll:true,  canUpdateStatus:false },
  owner:       { label:"Owner",       level:3, canReport:true,  canViewMap:true,  canViewAll:true,  canUpdateStatus:true  },
  admin:       { label:"Admin",       level:4, canReport:true,  canViewMap:true,  canViewAll:true,  canUpdateStatus:true  },
};

// ─── Owner/provider list by region ───────────────────────────────────────────
const OWNERS = {
  cleveland: ["Spectrum","AT&T","Breezeline","Windstream","FirstEnergy","Verizon",
    "Crown Castle","SBA Communications","DISH Wireless","Other"],
  chicago:   ["Comcast / Xfinity","AT&T","ComEd","T-Mobile","SBA Communications","Other"],
  national:  ["Spectrum","AT&T","Comcast","Verizon","FirstEnergy","Local Utility","Other"],
};

// ─── CSS (Design System v1.0 Dark Surface) ────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=DM+Serif+Display&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --navy900: #0A1628; --navy800: #0F2040; --navy700: #162952;
    --blue700: #1A4ED8; --blue600: #2563EB; --blue400: #3B82F6;
    --telecom: #EA580C; --electric: #DC2626; --water: #2563EB;
    --green: #059669; --amber: #D97706;
    --n900: #1E2D3D; --n800: #2D3F52; --n600: #4A6080;
    --n400: #7A94AE; --n200: #B0C4D4; --n100: #E2EBF0;
    --font-display: 'DM Serif Display', Georgia, serif;
    --font-body: 'DM Sans', system-ui, sans-serif;
    --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 20px;
    --shadow-sm: 0 1px 4px rgba(0,0,0,.2);
    --shadow-md: 0 4px 12px rgba(0,0,0,.3);
    --shadow-blue: 0 4px 16px rgba(37,99,235,.4);
    --shadow-glow: 0 0 16px rgba(59,130,246,.35);
  }
  html, body { height: 100%; font-family: var(--font-body); }
  body { background: var(--navy900); color: #fff; overflow-x: hidden; }

  @keyframes fadeUp    { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
  @keyframes spin      { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
  @keyframes glow      { 0%,100% { box-shadow:0 0 6px var(--blue600); } 50% { box-shadow:0 0 20px var(--blue600); } }
  @keyframes pulse     { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.4; transform:scale(.95); } }
  @keyframes urgentRing{ 0%   { transform:scale(.8); opacity:.6; } 100% { transform:scale(2.2); opacity:0; } }
  @keyframes slideUp   { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
  @keyframes popIn     { 0%   { transform:scale(.85); opacity:0; } 70% { transform:scale(1.04); } 100% { transform:scale(1); opacity:1; } }

  .anim-up   { animation: fadeUp .35s ease both; }
  .anim-in   { animation: fadeIn .3s ease both; }
  .anim-pop  { animation: popIn .4s cubic-bezier(.34,1.56,.64,1) both; }
  .anim-spin { animation: spin 1s linear infinite; display: inline-block; }

  /* ── Buttons ── */
  .btn { border: none; border-radius: var(--radius-md); padding: 13px 20px;
    font-family: var(--font-body); font-size: 14px; font-weight: 700;
    cursor: pointer; transition: all .2s; letter-spacing: -.01em; }
  .btn:disabled { opacity: .4; cursor: not-allowed; }
  .btn-primary { background: var(--blue700); color: #fff; box-shadow: var(--shadow-blue); }
  .btn-primary:not(:disabled):hover { background: var(--blue600); transform: translateY(-1px); box-shadow: 0 6px 24px rgba(37,99,235,.5); }
  .btn-outline { background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,.15); }
  .btn-outline:hover { border-color: rgba(255,255,255,.4); background: rgba(255,255,255,.05); }
  .btn-danger  { background: var(--electric); color: #fff; box-shadow: 0 4px 16px rgba(220,38,38,.4); }
  .btn-danger:hover { filter: brightness(1.1); transform: translateY(-1px); }

  /* ── Cards ── */
  .card { background: var(--navy800); border: 1px solid var(--n900);
    border-radius: var(--radius-lg); padding: 16px; }
  .card-urgent { background: rgba(220,38,38,.08); border: 1.5px solid rgba(220,38,38,.35); }

  /* ── Inputs ── */
  .input { width: 100%; background: var(--navy700); border: 1.5px solid var(--n800);
    border-radius: var(--radius-md); padding: 12px 14px; color: #fff;
    font-family: var(--font-body); font-size: 14px; transition: border-color .15s, box-shadow .15s; }
  .input::placeholder { color: var(--n600); }
  .input:focus { outline: none; border-color: var(--blue600); box-shadow: 0 0 0 3px rgba(37,99,235,.15); }
  textarea.input { resize: none; min-height: 72px; }

  /* ── Badges ── */
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
    border-radius: var(--radius-sm); font-size: 11px; font-weight: 700; border: 1px solid; }
  .badge-open     { color: var(--telecom);  background: rgba(234,88,12,.12);  border-color: rgba(234,88,12,.3);  }
  .badge-urgent   { color: var(--electric); background: rgba(220,38,38,.15);  border-color: rgba(220,38,38,.4);  animation: pulse 1.5s infinite; }
  .badge-assigned { color: var(--amber);    background: rgba(217,119,6,.12);  border-color: rgba(217,119,6,.3);  }
  .badge-resolved { color: var(--green);    background: rgba(5,150,105,.12);  border-color: rgba(5,150,105,.3);  }
  .badge-queued   { color: var(--n400);     background: rgba(74,96,128,.15);  border-color: rgba(74,96,128,.3);  }

  /* ── Damage type selector ── */
  .dmg-btn { border: 1.5px solid var(--n800); border-radius: var(--radius-md);
    padding: 10px 12px; cursor: pointer; background: var(--navy700);
    font-family: var(--font-body); transition: all .2s;
    display: flex; align-items: center; gap:10; text-align: left; }
  .dmg-btn:hover { border-color: var(--n600); background: var(--navy800); }
  .dmg-btn.sel   { transform: scale(1.01); }

  /* ── View tabs ── */
  .view-tab { flex: 1; padding: 10px; background: none; border: none;
    font-family: var(--font-body); font-size: 12px; font-weight: 700;
    cursor: pointer; letter-spacing: .04em; transition: all .2s;
    color: var(--n600); border-top: 2px solid transparent; }
  .view-tab.active { color: var(--blue400); border-top-color: var(--blue600); background: rgba(37,99,235,.06); }

  /* ── Filter chips ── */
  .chip { padding: 5px 12px; border-radius: 99px; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all .15s; border: 1px solid var(--n800); background: transparent; color: var(--n400); }
  .chip.active { background: rgba(37,99,235,.12); border-color: rgba(37,99,235,.4); color: var(--blue400); }

  /* ── Report list items ── */
  .report-row { background: var(--navy800); border: 1px solid var(--n900);
    border-radius: var(--radius-lg); padding: 14px; cursor: pointer;
    transition: all .2s; display: flex; gap: 12; }
  .report-row:hover { border-color: var(--n800); box-shadow: var(--shadow-md); }
  .report-row.urgent { border-color: rgba(220,38,38,.4); background: rgba(220,38,38,.06); }

  /* ── Bottom sheet ── */
  .sheet { position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
    background: var(--navy900); border-radius: 20px 20px 0 0;
    border-top: 1px solid var(--n900); box-shadow: 0 -8px 32px rgba(0,0,0,.4);
    max-height: 85vh; overflow-y: auto; animation: slideUp .25s ease; }
  .sheet-handle { width: 40px; height: 4px; border-radius: 99px;
    background: var(--n800); margin: 14px auto 20px; }

  /* ── Overlay ── */
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 190;
    animation: fadeIn .2s ease; }

  /* ── Section labels ── */
  .label { font-size: 10px; font-weight: 700; letter-spacing: .1em;
    color: var(--n600); text-transform: uppercase; margin-bottom: 10px; }
`;

// ─── Inline SVG icons (Lucide-style 2px stroke) ───────────────────────────────
const Icon = ({ name, size=20, color="currentColor", sw=2 }) => {
  const s = { width:size, height:size, display:"block", flexShrink:0 };
  const p = { fill:"none", stroke:color, strokeWidth:sw, strokeLinecap:"round", strokeLinejoin:"round" };
  const icons = {
    alertTriangle:<svg style={s} viewBox="0 0 24 24"><path {...p} d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line {...p} x1="12" y1="9" x2="12" y2="13"/><line {...p} x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    zap:          <svg style={s} viewBox="0 0 24 24"><polygon {...p} points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    wifi:         <svg style={s} viewBox="0 0 24 24"><path {...p} d="M5 12.55a11 11 0 0 1 14.08 0"/><path {...p} d="M1.42 9a16 16 0 0 1 21.16 0"/><path {...p} d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle {...p} cx="12" cy="20" r="1" fill={color}/></svg>,
    arrowDown:    <svg style={s} viewBox="0 0 24 24"><line {...p} x1="12" y1="5" x2="12" y2="19"/><polyline {...p} points="19 12 12 19 5 12"/></svg>,
    minus:        <svg style={s} viewBox="0 0 24 24"><line {...p} x1="5" y1="12" x2="19" y2="12"/></svg>,
    link:         <svg style={s} viewBox="0 0 24 24"><path {...p} d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path {...p} d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    activity:     <svg style={s} viewBox="0 0 24 24"><polyline {...p} points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    signal:       <svg style={s} viewBox="0 0 24 24"><line {...p} x1="2" y1="20" x2="2" y2="20"/><line {...p} x1="7" y1="15" x2="7" y2="20"/><line {...p} x1="12" y1="9" x2="12" y2="20"/><line {...p} x1="17" y1="4" x2="17" y2="20"/><line {...p} x1="22" y1="2" x2="22" y2="20"/></svg>,
    box:          <svg style={s} viewBox="0 0 24 24"><path {...p} d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
    tree:         <svg style={s} viewBox="0 0 24 24"><path {...p} d="M17 14.5C17 17.537 14.761 20 12 20s-5-2.463-5-5.5C7 10.462 9.239 5 12 5s5 5.462 5 9.5z"/><line {...p} x1="12" y1="20" x2="12" y2="22"/></svg>,
    moreHoriz:    <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="1" fill={color}/><circle {...p} cx="19" cy="12" r="1" fill={color}/><circle {...p} cx="5" cy="12" r="1" fill={color}/></svg>,
    camera:       <svg style={s} viewBox="0 0 24 24"><path {...p} d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle {...p} cx="12" cy="13" r="4"/></svg>,
    map:          <svg style={s} viewBox="0 0 24 24"><polygon {...p} points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line {...p} x1="8" y1="2" x2="8" y2="18"/><line {...p} x1="16" y1="6" x2="16" y2="22"/></svg>,
    list:         <svg style={s} viewBox="0 0 24 24"><line {...p} x1="8" y1="6" x2="21" y2="6"/><line {...p} x1="8" y1="12" x2="21" y2="12"/><line {...p} x1="8" y1="18" x2="21" y2="18"/><line {...p} x1="3" y1="6" x2="3.01" y2="6"/><line {...p} x1="3" y1="12" x2="3.01" y2="12"/><line {...p} x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    plus:         <svg style={s} viewBox="0 0 24 24"><line {...p} x1="12" y1="5" x2="12" y2="19"/><line {...p} x1="5" y1="12" x2="19" y2="12"/></svg>,
    check:        <svg style={s} viewBox="0 0 24 24"><polyline {...p} points="20 6 9 17 4 12"/></svg>,
    x:            <svg style={s} viewBox="0 0 24 24"><line {...p} x1="18" y1="6" x2="6" y2="18"/><line {...p} x1="6" y1="6" x2="18" y2="18"/></svg>,
    back:         <svg style={s} viewBox="0 0 24 24"><line {...p} x1="19" y1="12" x2="5" y2="12"/><polyline {...p} points="12 19 5 12 12 5"/></svg>,
    settings:     <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="3"/><path {...p} d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    user:         <svg style={s} viewBox="0 0 24 24"><path {...p} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle {...p} cx="12" cy="7" r="4"/></svg>,
    logOut:       <svg style={s} viewBox="0 0 24 24"><path {...p} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline {...p} points="16 17 21 12 16 7"/><line {...p} x1="21" y1="12" x2="9" y2="12"/></svg>,
    mail:         <svg style={s} viewBox="0 0 24 24"><path {...p} d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline {...p} points="22,6 12,13 2,6"/></svg>,
    lock:         <svg style={s} viewBox="0 0 24 24"><rect {...p} x="3" y="11" width="18" height="11" rx="2"/><path {...p} d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    shield:       <svg style={s} viewBox="0 0 24 24"><path {...p} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    navigation:   <svg style={s} viewBox="0 0 24 24"><polygon {...p} points="3 11 22 2 13 21 11 13 3 11" fill={color}/></svg>,
    crosshair:    <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="10"/><line {...p} x1="22" y1="12" x2="18" y2="12"/><line {...p} x1="6" y1="12" x2="2" y2="12"/><line {...p} x1="12" y1="6" x2="12" y2="2"/><line {...p} x1="12" y1="22" x2="12" y2="18"/></svg>,
    refresh:      <svg style={s} viewBox="0 0 24 24"><polyline {...p} points="23 4 23 10 17 10"/><polyline {...p} points="1 20 1 14 7 14"/><path {...p} d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
    image:        <svg style={s} viewBox="0 0 24 24"><rect {...p} x="3" y="3" width="18" height="18" rx="2"/><circle {...p} cx="8.5" cy="8.5" r="1.5"/><polyline {...p} points="21 15 16 10 5 21"/></svg>,
    clock:        <svg style={s} viewBox="0 0 24 24"><circle {...p} cx="12" cy="12" r="10"/><polyline {...p} points="12 6 12 12 16 14"/></svg>,
  };
  return icons[name] || icons.signal;
};

// ─── Utility functions ────────────────────────────────────────────────────────
function haversine(a, b, c, d) {
  const R = 6371000, p1 = a*Math.PI/180, p2 = c*Math.PI/180;
  const dp = (c-a)*Math.PI/180, dl = (d-b)*Math.PI/180;
  const x = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}
function detectRegion(lat, lng) {
  if (haversine(lat,lng,41.4993,-81.6944) < 80000) return "cleveland";
  if (haversine(lat,lng,41.8827,-87.6233) < 80000) return "chicago";
  return "national";
}
function uid() { return `fr_${Date.now()}_${Math.random().toString(36).substr(2,6)}`; }
function fmtTime(iso) {
  const d = new Date(iso), now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
  return d.toLocaleDateString();
}

// ─── Photo compression ────────────────────────────────────────────────────────
async function compressPhoto(file, maxKB = 300) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, Math.sqrt((maxKB * 1024) / file.size));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.82);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ─── Upload photo to Supabase Storage ────────────────────────────────────────
async function uploadPhoto(file, reportId) {
  const compressed = await compressPhoto(file);
  const path = `${reportId}/${uid()}.jpg`;
  const { data, error } = await supabase.storage
    .from("report-photos")
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (error) return null;
  const { data: url } = supabase.storage.from("report-photos").getPublicUrl(path);
  return url.publicUrl;
}

// ─── Offline queue helpers ────────────────────────────────────────────────────
const QUEUE_KEY = "cl_field_queue";
async function getQueue() {
  try {
    const r = await window.storage.get(QUEUE_KEY);
    return r ? JSON.parse(r.value) : [];
  } catch { return []; }
}
async function addToQueue(item) {
  try {
    const q = await getQueue();
    q.push(item);
    await window.storage.set(QUEUE_KEY, JSON.stringify(q));
  } catch {}
}
async function removeFromQueue(id) {
  try {
    const q = (await getQueue()).filter(r => r.id !== id);
    await window.storage.set(QUEUE_KEY, JSON.stringify(q));
  } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClearLineFieldApp() {
  // ── Auth & profile ──
  const [session, setSession]     = useState(null);
  const [profile, setProfile]     = useState(null);
  const [authMode, setAuthMode]   = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPw, setAuthPw]       = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // ── App state ──
  const [view, setView]           = useState("dashboard"); // dashboard|report|settings
  const [dashTab, setDashTab]     = useState("split");     // split|map|list
  const [reports, setReports]     = useState([]);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing]     = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [filters, setFilters]     = useState({ type:"all", status:"all" });
  const [nearbyOnly, setNearbyOnly] = useState(false);
  const [proximity, setProximity] = useState(null); // { distance, report }

  // ── Report form ──
  const [photos, setPhotos]       = useState([]);
  const [gps, setGps]             = useState(null);
  const [heading, setHeading]     = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [damageTypes, setDamageTypes] = useState([]);
  const [assetOwner, setAssetOwner] = useState("");
  const [assetId, setAssetId]     = useState("");
  const [notes, setNotes]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ownerList, setOwnerList] = useState(OWNERS.national);

  // ── Map refs ──
  const mapDiv        = useRef();
  const lmap          = useRef(null);
  const markersLayer  = useRef(null);
  const locationWatch = useRef(null);
  const cameraRef     = useRef();

  // ─── CSS injection ───
  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
    return () => document.head.removeChild(s);
  }, []);

  // ─── Auth init ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => {
      setSession(sess);
      if (sess) loadProfile(sess.user.id);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId) {
    const { data } = await supabase.from("reporters").select("*").eq("id", userId).single();
    setProfile(data);
  }

  // ─── Load reports + real-time ───
  useEffect(() => {
    if (!session) return;
    fetchReports();
    loadQueue();
    const sub = supabase.channel("reports-rt")
      .on("postgres_changes", { event:"*", schema:"public", table:"reports" }, fetchReports)
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [session]);

  async function fetchReports() {
    const userRole = ROLES[profile?.role || "reporter"];
    let q = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
    if (!userRole.canViewAll) q = q.eq("reporter_id", session?.user?.id);
    const { data } = await q;
    setReports(data || []);
  }

  async function loadQueue() {
    const q = await getQueue();
    setQueueCount(q.length);
  }

  // ─── Sync offline queue ───
  const syncQueue = useCallback(async () => {
    const q = await getQueue();
    if (!q.length || syncing) return;
    setSyncing(true);
    for (const item of q) {
      const { error } = await supabase.from("reports").insert(item);
      if (!error) await removeFromQueue(item.id);
    }
    setSyncing(false);
    loadQueue();
    fetchReports();
  }, [syncing]);

  useEffect(() => {
    const onOnline = () => syncQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncQueue]);

  // ─── Proximity check ───
  useEffect(() => {
    if (!gps || !reports.length) return;
    const PROXIMITY_FT = 250;
    const PROXIMITY_M  = PROXIMITY_FT * 0.3048;
    const nearby = reports.find(r =>
      r.latitude && r.longitude &&
      haversine(gps.lat, gps.lng, r.latitude, r.longitude) <= PROXIMITY_M &&
      r.status !== "resolved"
    );
    if (nearby) {
      const dist = haversine(gps.lat, gps.lng, nearby.latitude, nearby.longitude);
      setProximity({ distance: Math.round(dist * 3.28084), report: nearby });
    } else setProximity(null);
  }, [gps, reports]);

  // ─── Map init ───
  useEffect(() => {
    if (view !== "dashboard" || dashTab === "list") return;
    const init = () => {
      if (!window.L || !mapDiv.current) return;
      if (lmap.current) { renderMap(); return; }
      const L = window.L;
      const map = L.map(mapDiv.current, { center:[41.4993,-81.6944], zoom:12, zoomControl:true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution:"© OpenStreetMap" }).addTo(map);
      lmap.current = map;
      markersLayer.current = L.layerGroup().addTo(map);
      renderMap(map);
    };
    if (window.L) { setTimeout(init, 80); return; }
    const lnk = document.createElement("link");
    lnk.rel = "stylesheet";
    lnk.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(lnk);
    const scr = document.createElement("script");
    scr.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    scr.onload = () => setTimeout(init, 80);
    document.head.appendChild(scr);
  }, [view, dashTab]);

  useEffect(() => {
    if (lmap.current && window.L) renderMap();
  }, [reports, filters, nearbyOnly]);

  function renderMap(map = lmap.current) {
    if (!map || !window.L || !markersLayer.current) return;
    const L = window.L;
    markersLayer.current.clearLayers();
    const filtered = getFilteredReports();
    filtered.forEach(r => {
      if (!r.latitude || !r.longitude) return;
      const dmg   = DAMAGE_TYPES.find(d => d.id === r.damage_type) || DAMAGE_TYPES[10];
      const color = dmg.color;
      const isUrgent = dmg.urgent || r.damage_type === "danger" || r.damage_type === "power";

      // Pin
      const ico = L.divIcon({
        html: `
          <div style="position:relative">
            ${isUrgent ? `<div style="position:absolute;top:50%;left:50%;
              transform:translate(-50%,-50%) scale(1);
              width:28px;height:28px;border-radius:50%;border:2px solid ${color};
              animation:urgentRing 1.5s ease-out infinite;opacity:.5"></div>` : ""}
            <div style="width:14px;height:14px;border-radius:50%;background:${color};
              border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);position:relative;z-index:1"></div>
          </div>
        `,
        iconSize:[14,14], iconAnchor:[7,7], className:"",
      });
      const marker = L.marker([r.latitude, r.longitude], { icon: ico }).addTo(markersLayer.current);

      // Directional cone (50° arc from heading)
      if (r.heading !== null && r.heading !== undefined) {
        const h = r.heading, spread = 25, len = 0.0003;
        const rad = a => a * Math.PI / 180;
        const tip  = [r.latitude + len * Math.cos(rad(h)),    r.longitude + len * Math.sin(rad(h))];
        const left = [r.latitude + len * Math.cos(rad(h-spread)), r.longitude + len * Math.sin(rad(h-spread))];
        const right= [r.latitude + len * Math.cos(rad(h+spread)), r.longitude + len * Math.sin(rad(h+spread))];
        L.polygon([[r.latitude, r.longitude], left, tip, right], {
          color, fillColor: color, fillOpacity: 0.18, weight: 1, dashArray: "3 3",
        }).addTo(markersLayer.current);
      }

      // Popup
      marker.bindPopup(`
        <div style="font-family:'DM Sans',sans-serif;min-width:180px;padding:4px">
          <div style="font-weight:700;font-size:13px;color:#111;margin-bottom:4px">
            ${dmg.label}
          </div>
          <div style="font-size:12px;color:#666;margin-bottom:2px">
            ${r.reporter_name || "Anonymous"} · ${fmtTime(r.created_at)}
          </div>
          <div style="display:inline-block;padding:2px 8px;border-radius:4px;
            font-size:10px;font-weight:700;background:${color}20;
            color:${color};border:1px solid ${color}40;margin-top:4px">
            ${r.status?.toUpperCase() || "OPEN"}
          </div>
        </div>
      `);
      marker.on("click", () => { setSelectedReport(r); setShowDetail(true); });
    });

    // User location
    if (gps) {
      const ico = L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#2563EB;
          border:2.5px solid #fff;box-shadow:0 0 10px rgba(37,99,235,.5)"></div>`,
        iconSize:[12,12], iconAnchor:[6,6], className:"",
      });
      L.marker([gps.lat, gps.lng], { icon: ico }).addTo(markersLayer.current)
        .bindPopup('<div style="font-family:DM Sans,sans-serif;font-size:12px">Your location</div>');
    }
  }

  // ─── Filtered reports ───
  function getFilteredReports() {
    return reports.filter(r => {
      if (filters.type !== "all" && r.damage_type !== filters.type) return false;
      if (filters.status !== "all" && r.status !== filters.status) return false;
      if (nearbyOnly && gps && r.latitude && r.longitude) {
        return haversine(gps.lat, gps.lng, r.latitude, r.longitude) <= 1609;
      }
      return true;
    });
  }

  // ─── GPS capture ───
  const captureGPS = useCallback(() => {
    setGpsLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => {
          setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
          if (p.coords.heading !== null) setHeading(p.coords.heading);
          setGpsLoading(false);
        },
        () => {
          setGps({ lat: 41.4993 + (Math.random()-.5)*.015, lng: -81.6944 + (Math.random()-.5)*.015, demo:true });
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
      // Compass heading via DeviceOrientationEvent
      const hdgHandler = e => { if (e.webkitCompassHeading) setHeading(e.webkitCompassHeading); };
      window.addEventListener("deviceorientation", hdgHandler, { once: false });
    } else {
      setGps({ lat: 41.4993, lng: -81.6944, demo: true });
      setGpsLoading(false);
    }
  }, []);

  // ─── Photo capture ───
  const handlePhotoCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhotos(prev => [...prev, { file, preview, uploading: false, url: null }]);
  };

  // ─── Submit report ───
  const handleSubmit = async () => {
    if (submitting || !damageTypes.length || !gps) return;
    setSubmitting(true);
    const id = uid();
    const region = detectRegion(gps.lat, gps.lng);
    const report = {
      id,
      reporter_id:   session.user.id,
      reporter_name: profile?.full_name || "Anonymous",
      damage_type:   damageTypes[0],
      all_damage_types: damageTypes,
      asset_owner:   assetOwner,
      asset_id:      assetId,
      notes,
      latitude:      gps.lat,
      longitude:     gps.lng,
      heading:       heading,
      region,
      status:        "open",
      created_at:    new Date().toISOString(),
    };

    const isUrgent = damageTypes.some(dt => DAMAGE_TYPES.find(d => d.id === dt)?.urgent);

    if (!navigator.onLine) {
      await addToQueue(report);
      setQueueCount(q => q + 1);
      setSubmitting(false);
      resetForm();
      setView("dashboard");
      return;
    }

    // Upload photos
    const photoUrls = [];
    for (const p of photos) {
      const url = await uploadPhoto(p.file, id);
      if (url) photoUrls.push(url);
    }
    report.photo_urls = photoUrls;

    const { error } = await supabase.from("reports").insert(report);
    if (error) {
      await addToQueue(report);
      setQueueCount(q => q + 1);
    } else {
      fetchReports();
    }
    setSubmitting(false);
    resetForm();
    setView("dashboard");
  };

  function resetForm() {
    setPhotos([]); setGps(null); setHeading(null); setDamageTypes([]);
    setAssetOwner(""); setAssetId(""); setNotes([]);
  }

  // ─── Auth handlers ───
  const handleAuth = async () => {
    setAuthLoading(true); setAuthError("");
    const fn = authMode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email: authEmail, password: authPw });
    if (error) setAuthError(error.message);
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  // ─── Role helpers ───
  const role      = ROLES[profile?.role || "reporter"];
  const roleColor = { guest:"var(--n400)", reporter:"var(--blue400)", contractor:"var(--telecom)",
    owner:"var(--amber)", admin:"var(--green)" }[profile?.role || "reporter"];

  // ════════════════════════════════════════════════════════════════════════════
  // AUTH SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (!session) return (
    <div style={{ minHeight:"100vh", background:"var(--navy900)", display:"flex",
      alignItems:"center", justifyContent:"center", padding:24, fontFamily:"var(--font-body)" }}>
      <style>{CSS}</style>
      <div className="anim-pop" style={{ width:"100%", maxWidth:380 }}>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ width:12, height:12, borderRadius:"50%", background:"var(--blue600)",
            animation:"glow 2s infinite", margin:"0 auto 14px" }}/>
          <div style={{ fontFamily:"var(--font-display)", fontSize:32, color:"#fff", marginBottom:6 }}>
            ClearLine
          </div>
          <div style={{ fontSize:12, color:"var(--n400)", letterSpacing:".08em" }}>FIELD REPORTER</div>
        </div>

        <div className="card">
          {/* Tab toggle */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4,
            background:"var(--navy700)", borderRadius:"var(--radius-md)", padding:4, marginBottom:20 }}>
            {["login","register"].map(m => (
              <button key={m} onClick={() => setAuthMode(m)}
                style={{ padding:"9px", borderRadius:8, border:"none", cursor:"pointer",
                  fontFamily:"var(--font-body)", fontSize:13, fontWeight:700, transition:"all .15s",
                  background: authMode===m ? "var(--blue700)" : "transparent",
                  color: authMode===m ? "#fff" : "var(--n400)",
                  boxShadow: authMode===m ? "var(--shadow-blue)" : "none" }}>
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div>
              <div className="label">Email</div>
              <div style={{ position:"relative" }}>
                <input className="input" type="email" value={authEmail} placeholder="you@example.com"
                  onChange={e => setAuthEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAuth()}
                  style={{ paddingLeft:38 }}/>
                <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}>
                  <Icon name="mail" size={16} color="var(--n600)"/>
                </div>
              </div>
            </div>
            <div>
              <div className="label">Password</div>
              <div style={{ position:"relative" }}>
                <input className="input" type="password" value={authPw} placeholder="••••••••"
                  onChange={e => setAuthPw(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAuth()}
                  style={{ paddingLeft:38 }}/>
                <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)" }}>
                  <Icon name="lock" size={16} color="var(--n600)"/>
                </div>
              </div>
            </div>

            {authError && (
              <div style={{ padding:"10px 14px", background:"rgba(220,38,38,.1)",
                border:"1px solid rgba(220,38,38,.3)", borderRadius:"var(--radius-md)",
                fontSize:13, color:"var(--electric)" }}>
                {authError}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleAuth} disabled={authLoading}
              style={{ marginTop:4 }}>
              {authLoading
                ? <span className="anim-spin">⟳</span>
                : authMode === "login" ? "Sign In" : "Create Account"}
            </button>
          </div>
        </div>

        <p style={{ textAlign:"center", fontSize:12, color:"var(--n600)", marginTop:20 }}>
          One platform. Every stakeholder. Closed loop.
        </p>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════════════════════
  // PROFILE SETUP (first login)
  // ════════════════════════════════════════════════════════════════════════════
  if (!profile) {
    const [name, setName]   = useState("");
    const [pRole, setPRole] = useState("reporter");
    const [saving, setSaving] = useState(false);

    const saveProfile = async () => {
      setSaving(true);
      const { error } = await supabase.from("reporters").insert({
        id: session.user.id, email: session.user.email,
        full_name: name, role: pRole, created_at: new Date().toISOString(),
      });
      if (!error) loadProfile(session.user.id);
      setSaving(false);
    };

    return (
      <div style={{ minHeight:"100vh", background:"var(--navy900)", display:"flex",
        alignItems:"center", justifyContent:"center", padding:24, fontFamily:"var(--font-body)" }}>
        <style>{CSS}</style>
        <div className="anim-up" style={{ width:"100%", maxWidth:360 }}>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:28, color:"#fff",
            marginBottom:6 }}>Set up your profile</h2>
          <p style={{ fontSize:14, color:"var(--n400)", marginBottom:24, lineHeight:1.5 }}>
            How you identify on reports.
          </p>
          <div className="card" style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <div className="label">Full Name</div>
              <input className="input" value={name} placeholder="Your name"
                onChange={e => setName(e.target.value)}/>
            </div>
            <div>
              <div className="label">Your Role</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {Object.entries(ROLES).filter(([k]) => k !== "admin").map(([k,r]) => (
                  <button key={k} onClick={() => setPRole(k)}
                    style={{ padding:"11px 14px", borderRadius:"var(--radius-md)", cursor:"pointer",
                      fontFamily:"inherit", fontSize:14, fontWeight:pRole===k?700:500,
                      textAlign:"left", background: pRole===k ? "rgba(37,99,235,.12)" : "var(--navy700)",
                      border:`1.5px solid ${pRole===k ? "var(--blue600)" : "var(--n800)"}`,
                      color: pRole===k ? "var(--blue400)" : "var(--n400)",
                      display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    {r.label}
                    {pRole===k && <Icon name="check" size={16} color="var(--blue400)"/>}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={!name.trim()||saving}>
              {saving ? "Saving..." : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN APP SHELL
  // ════════════════════════════════════════════════════════════════════════════
  const filtered = getFilteredReports();

  return (
    <div style={{ minHeight:"100vh", background:"var(--navy900)", fontFamily:"var(--font-body)",
      display:"flex", flexDirection:"column" }}>
      <style>{CSS}</style>

      {/* ── Header ── */}
      <header style={{ background:"var(--navy800)", borderBottom:"1px solid var(--n900)",
        padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between",
        flexShrink:0, position:"sticky", top:0, zIndex:50 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:10, height:10, borderRadius:"50%", background:"var(--blue600)",
            animation:"glow 2s infinite" }}/>
          <span style={{ fontFamily:"var(--font-display)", fontSize:20, color:"#fff", lineHeight:1 }}>
            ClearLine
          </span>
          <span style={{ fontSize:9, color:"var(--n600)", fontWeight:600, letterSpacing:".1em",
            marginTop:2 }}>FIELD</span>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {/* Queue indicator */}
          {queueCount > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:5,
              background:"rgba(234,88,12,.12)", border:"1px solid rgba(234,88,12,.3)",
              borderRadius:"var(--radius-sm)", padding:"4px 8px", cursor:"pointer",
              animation:"pulse 1.5s infinite" }}
              onClick={syncQueue}>
              <Icon name="refresh" size={12} color="var(--telecom)"/>
              <span style={{ fontSize:11, fontWeight:700, color:"var(--telecom)" }}>
                {queueCount} queued
              </span>
            </div>
          )}

          {/* Role badge */}
          <div style={{ padding:"3px 8px", borderRadius:"var(--radius-sm)",
            background:`${roleColor}15`, border:`1px solid ${roleColor}30`,
            fontSize:10, fontWeight:700, color:roleColor }}>
            {role.label.toUpperCase()}
          </div>

          <button onClick={() => setView("settings")}
            style={{ background:"none", border:"none", cursor:"pointer", padding:4, color:"var(--n400)" }}>
            <Icon name="settings" size={18} color="var(--n400)"/>
          </button>
        </div>
      </header>

      {/* ── Proximity alert ── */}
      {proximity && (
        <div style={{ background:"rgba(220,38,38,.12)", border:"1px solid rgba(220,38,38,.4)",
          padding:"10px 16px", display:"flex", alignItems:"center", gap:10,
          animation:"slideUp .3s ease" }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <div style={{ position:"absolute", inset:-6, borderRadius:"50%",
              border:"2px solid var(--electric)", animation:"urgentRing 1.5s infinite" }}/>
            <Icon name="alertTriangle" size={18} color="var(--electric)"/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"var(--electric)" }}>
              Hazard within {proximity.distance}ft
            </div>
            <div style={{ fontSize:11, color:"var(--n400)" }}>
              {DAMAGE_TYPES.find(d=>d.id===proximity.report.damage_type)?.label || "Reported damage"} nearby
            </div>
          </div>
          <button onClick={() => { setSelectedReport(proximity.report); setShowDetail(true); }}
            style={{ background:"rgba(220,38,38,.2)", border:"1px solid rgba(220,38,38,.4)",
              borderRadius:"var(--radius-sm)", padding:"5px 10px", fontSize:11, fontWeight:700,
              color:"var(--electric)", cursor:"pointer", fontFamily:"inherit" }}>
            View
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* DASHBOARD */}
        {view === "dashboard" && (
          <>
            {/* View tabs */}
            <div style={{ background:"var(--navy800)", borderBottom:"1px solid var(--n900)",
              display:"flex" }}>
              {[{id:"split",l:"SPLIT"},{id:"map",l:"MAP"},{id:"list",l:"LIST"}].map(t => (
                <button key={t.id} className={`view-tab${dashTab===t.id?" active":""}`}
                  onClick={() => setDashTab(t.id)}>{t.l}</button>
              ))}
            </div>

            {/* Filters */}
            <div style={{ background:"var(--navy800)", borderBottom:"1px solid var(--n900)",
              padding:"8px 16px", display:"flex", gap:8, overflowX:"auto",
              scrollbarWidth:"none", alignItems:"center" }}>
              <button className={`chip${nearbyOnly?" active":""}`}
                onClick={() => { if (!gps) captureGPS(); setNearbyOnly(n=>!n); }}>
                📍 Nearby
              </button>
              <div style={{ width:1, height:16, background:"var(--n900)", flexShrink:0 }}/>
              {[{id:"all",l:"All Types"},{id:"danger",l:"Danger"},{id:"power",l:"Power"},
                {id:"aerial",l:"Aerial Comms"},{id:"pole",l:"Poles"}].map(f => (
                <button key={f.id} className={`chip${filters.type===f.id?" active":""}`}
                  onClick={() => setFilters(p => ({...p, type:f.id}))}>
                  {f.l}
                </button>
              ))}
              <div style={{ width:1, height:16, background:"var(--n900)", flexShrink:0 }}/>
              {[{id:"all",l:"All"},{id:"open",l:"Open"},{id:"assigned",l:"Assigned"},{id:"resolved",l:"Resolved"}]
                .map(f => (
                <button key={f.id} className={`chip${filters.status===f.id?" active":""}`}
                  onClick={() => setFilters(p => ({...p, status:f.id}))}>
                  {f.l}
                </button>
              ))}
            </div>

            {/* Content area */}
            <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
              {/* Map pane */}
              {(dashTab === "map" || dashTab === "split") && (
                <div ref={mapDiv}
                  style={{ flex: dashTab==="split" ? "0 0 55%" : 1, background:"var(--n900)",
                    position:"relative" }}>
                  <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center",
                    justifyContent:"center", color:"var(--n600)", fontSize:13, pointerEvents:"none", zIndex:0 }}>
                    Loading map...
                  </div>
                </div>
              )}

              {/* List pane */}
              {(dashTab === "list" || dashTab === "split") && (
                <div style={{ flex:1, overflow:"auto", padding:12,
                  borderLeft: dashTab==="split" ? "1px solid var(--n900)" : "none" }}>
                  {filtered.length === 0 ? (
                    <div style={{ textAlign:"center", padding:"40px 20px", color:"var(--n600)" }}>
                      <Icon name="map" size={32} color="var(--n800)"/>
                      <div style={{ fontSize:14, marginTop:12 }}>No reports match your filters</div>
                    </div>
                  ) : filtered.map((r,i) => {
                    const dmg = DAMAGE_TYPES.find(d => d.id === r.damage_type) || DAMAGE_TYPES[10];
                    return (
                      <div key={r.id} className={`report-row${dmg.urgent?" urgent":""}`}
                        style={{ marginBottom:8, animation:`fadeUp .3s ${i*.04}s ease both` }}
                        onClick={() => { setSelectedReport(r); setShowDetail(true); }}>
                        <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
                          background:`${dmg.color}15`, border:`1px solid ${dmg.color}25`,
                          display:"flex", alignItems:"center", justifyContent:"center" }}>
                          <Icon name={dmg.icon} size={18} color={dmg.color}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:"#fff",
                            marginBottom:3, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                            {dmg.label}
                          </div>
                          <div style={{ fontSize:11, color:"var(--n400)" }}>
                            {r.reporter_name} · {fmtTime(r.created_at)}
                          </div>
                          {r.notes && (
                            <div style={{ fontSize:11, color:"var(--n600)", marginTop:2,
                              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                              {r.notes}
                            </div>
                          )}
                        </div>
                        <div>
                          <span className={`badge badge-${r.status||"open"}`}>
                            {r.status?.toUpperCase()||"OPEN"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* REPORT FORM */}
        {view === "report" && (
          <div style={{ flex:1, overflow:"auto", padding:"16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
              <button onClick={() => { resetForm(); setView("dashboard"); }}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--n400)" }}>
                <Icon name="back" size={20} color="var(--n400)"/>
              </button>
              <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, color:"#fff" }}>
                New Report
              </h2>
            </div>

            {/* Photos */}
            <div style={{ marginBottom:20 }}>
              <div className="label">Photos</div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {photos.map((p,i) => (
                  <div key={i} style={{ position:"relative", width:80, height:80 }}>
                    <img src={p.preview} alt="" style={{ width:80, height:80,
                      objectFit:"cover", borderRadius:"var(--radius-md)",
                      border:"1px solid var(--n800)" }}/>
                    <button onClick={() => setPhotos(pp => pp.filter((_,j)=>j!==i))}
                      style={{ position:"absolute", top:-6, right:-6, width:20, height:20,
                        borderRadius:"50%", background:"var(--electric)", border:"2px solid var(--navy900)",
                        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <Icon name="x" size={10} color="#fff"/>
                    </button>
                  </div>
                ))}
                <label style={{ width:80, height:80, borderRadius:"var(--radius-md)",
                  border:"1.5px dashed var(--n800)", display:"flex", flexDirection:"column",
                  alignItems:"center", justifyContent:"center", cursor:"pointer",
                  gap:4, color:"var(--n600)" }}>
                  <Icon name="camera" size={20} color="var(--n600)"/>
                  <span style={{ fontSize:10, fontWeight:600 }}>Add</span>
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                    style={{ display:"none" }} onChange={handlePhotoCapture}/>
                </label>
              </div>
            </div>

            {/* GPS */}
            <div style={{ marginBottom:20 }}>
              <div className="label">Location</div>
              <div className="card" style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px" }}>
                {gpsLoading ? (
                  <>
                    <span className="anim-spin">
                      <Icon name="crosshair" size={20} color="var(--blue600)"/>
                    </span>
                    <span style={{ fontSize:13, color:"var(--n400)" }}>Acquiring GPS...</span>
                  </>
                ) : gps ? (
                  <>
                    <Icon name="crosshair" size={20} color="var(--green)"/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--green)" }}>
                        GPS acquired
                      </div>
                      <div style={{ fontSize:11, color:"var(--n400)", fontFamily:"monospace" }}>
                        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                        {gps.demo ? " (demo)" : ""}
                        {heading !== null ? ` · ${Math.round(heading)}°` : ""}
                      </div>
                    </div>
                    <button onClick={captureGPS}
                      style={{ background:"none", border:"none", cursor:"pointer", color:"var(--n400)" }}>
                      <Icon name="refresh" size={16} color="var(--n400)"/>
                    </button>
                  </>
                ) : (
                  <button className="btn btn-outline" style={{ flex:1, fontSize:13 }}
                    onClick={captureGPS}>
                    <Icon name="crosshair" size={16} color="#fff"/> Get GPS Location
                  </button>
                )}
              </div>
            </div>

            {/* Damage types */}
            <div style={{ marginBottom:20 }}>
              <div className="label">Damage Type (select all that apply)</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {DAMAGE_TYPES.map(dt => {
                  const sel = damageTypes.includes(dt.id);
                  return (
                    <button key={dt.id} className={`dmg-btn${sel?" sel":""}`}
                      style={{ border:`1.5px solid ${sel ? dt.color : "var(--n800)"}`,
                        background: sel ? `${dt.color}10` : "var(--navy700)" }}
                      onClick={() => setDamageTypes(p =>
                        p.includes(dt.id) ? p.filter(x=>x!==dt.id) : [...p, dt.id])}>
                      <div style={{ width:32, height:32, borderRadius:8, flexShrink:0,
                        background:`${dt.color}15`, border:`1px solid ${dt.color}25`,
                        display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <Icon name={dt.icon} size={16} color={dt.color}/>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600,
                          color: sel ? dt.color : "#fff" }}>{dt.label}</div>
                        {dt.urgent && (
                          <div style={{ fontSize:10, color:"var(--electric)", fontWeight:700,
                            letterSpacing:".04em" }}>⚠ URGENT</div>
                        )}
                      </div>
                      {sel && <Icon name="check" size={16} color={dt.color}/>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Asset owner */}
            <div style={{ marginBottom:12 }}>
              <div className="label">Asset Owner</div>
              <select className="input"
                style={{ appearance:"none", color: assetOwner ? "#fff" : "var(--n600)" }}
                value={assetOwner} onChange={e => setAssetOwner(e.target.value)}>
                <option value="">Select owner...</option>
                {(gps ? OWNERS[detectRegion(gps.lat,gps.lng)] : OWNERS.national).map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* Asset ID */}
            <div style={{ marginBottom:12 }}>
              <div className="label">Asset ID (optional)</div>
              <input className="input" value={assetId} placeholder="Pole #, handhole ID, etc."
                onChange={e => setAssetId(e.target.value)}/>
            </div>

            {/* Notes */}
            <div style={{ marginBottom:24 }}>
              <div className="label">Notes</div>
              <textarea className="input" value={notes} placeholder="Describe the damage..."
                onChange={e => setNotes(e.target.value)}/>
            </div>

            <button className="btn btn-primary"
              disabled={!damageTypes.length || !gps || submitting}
              onClick={handleSubmit}
              style={{ width:"100%", marginBottom:16 }}>
              {submitting ? "Submitting..." : !navigator.onLine ? "Queue Report (offline)" : "Submit Report"}
            </button>

            {damageTypes.some(dt => DAMAGE_TYPES.find(d=>d.id===dt)?.urgent) && (
              <div style={{ padding:"12px 16px", background:"rgba(220,38,38,.12)",
                border:"1.5px solid rgba(220,38,38,.4)", borderRadius:"var(--radius-md)",
                fontSize:13, color:"var(--electric)", display:"flex", gap:10, alignItems:"flex-start" }}>
                <Icon name="alertTriangle" size={16} color="var(--electric)"/>
                <span>This report contains a Danger / Emergency type. It will trigger proximity alerts
                for nearby reporters and immediate notification to relevant parties.</span>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {view === "settings" && (
          <div style={{ flex:1, overflow:"auto", padding:"20px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24 }}>
              <button onClick={() => setView("dashboard")}
                style={{ background:"none", border:"none", cursor:"pointer", color:"var(--n400)" }}>
                <Icon name="back" size={20} color="var(--n400)"/>
              </button>
              <h2 style={{ fontFamily:"var(--font-display)", fontSize:22, color:"#fff" }}>Settings</h2>
            </div>

            <div className="card" style={{ marginBottom:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:"50%",
                  background:"var(--navy700)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <Icon name="user" size={20} color="var(--blue400)"/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>
                    {profile?.full_name || "Anonymous"}
                  </div>
                  <div style={{ fontSize:12, color:"var(--n400)" }}>{session.user.email}</div>
                </div>
                <div style={{ padding:"3px 8px", borderRadius:"var(--radius-sm)",
                  background:`${roleColor}15`, border:`1px solid ${roleColor}30`,
                  fontSize:10, fontWeight:700, color:roleColor }}>
                  {role.label.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Role capabilities */}
            <div className="card" style={{ marginBottom:12 }}>
              <div className="label">Your Capabilities</div>
              {[
                { label:"Submit reports",          ok: role.canReport         },
                { label:"View all reports",        ok: role.canViewAll        },
                { label:"Update report status",    ok: role.canUpdateStatus   },
              ].map(c => (
                <div key={c.label} style={{ display:"flex", justifyContent:"space-between",
                  padding:"8px 0", borderBottom:"1px solid var(--n900)" }}>
                  <span style={{ fontSize:13, color:"var(--n400)" }}>{c.label}</span>
                  <Icon name={c.ok?"check":"x"} size={16} color={c.ok?"var(--green)":"var(--n800)"}/>
                </div>
              ))}
            </div>

            {/* Queue status */}
            {queueCount > 0 && (
              <div className="card" style={{ marginBottom:12 }}>
                <div className="label">Offline Queue</div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:"var(--telecom)" }}>
                      {queueCount} report{queueCount!==1?"s":""} pending sync
                    </div>
                    <div style={{ fontSize:12, color:"var(--n400)" }}>
                      Will sync automatically when online
                    </div>
                  </div>
                  <button className="btn btn-outline" style={{ width:"auto", padding:"8px 14px", fontSize:13 }}
                    onClick={syncQueue} disabled={syncing}>
                    {syncing ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
              </div>
            )}

            <button className="btn btn-outline" style={{ width:"100%", marginTop:8 }}
              onClick={handleSignOut}>
              <Icon name="logOut" size={16} color="#fff"/> Sign Out
            </button>
          </div>
        )}
      </div>

      {/* ── FAB ── */}
      {view === "dashboard" && role.canReport && (
        <button onClick={() => { resetForm(); captureGPS(); setView("report"); }}
          style={{ position:"fixed", bottom:24, right:24, width:56, height:56,
            borderRadius:"50%", background:"var(--blue700)", border:"none", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"var(--shadow-blue)", zIndex:100, transition:"all .2s" }}
          onMouseEnter={e => { e.target.style.transform="scale(1.08)"; }}
          onMouseLeave={e => { e.target.style.transform="scale(1)"; }}>
          <Icon name="plus" size={24} color="#fff"/>
        </button>
      )}

      {/* ── Tab bar ── */}
      {view === "dashboard" && (
        <div style={{ background:"var(--navy800)", borderTop:"1px solid var(--n900)",
          display:"grid", gridTemplateColumns:"1fr 1fr", height:64, flexShrink:0 }}>
          {[
            { id:"dashboard", icon:"map",  label:"MAP" },
            { id:"settings",  icon:"user", label:"PROFILE" },
          ].map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              style={{ background:"none", border:"none", cursor:"pointer",
                fontFamily:"var(--font-body)", fontSize:11, fontWeight:700,
                letterSpacing:".06em", display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:4, transition:"all .15s",
                color: view===t.id ? "var(--blue400)" : "var(--n600)",
                borderTop:`2px solid ${view===t.id?"var(--blue600)":"transparent"}` }}>
              <Icon name={t.icon} size={20} color={view===t.id?"var(--blue400)":"var(--n600)"}/>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Report detail sheet ── */}
      {showDetail && selectedReport && (() => {
        const r   = selectedReport;
        const dmg = DAMAGE_TYPES.find(d => d.id === r.damage_type) || DAMAGE_TYPES[10];
        return (
          <>
            <div className="overlay" onClick={() => setShowDetail(false)}/>
            <div className="sheet">
              <div className="sheet-handle"/>
              <div style={{ padding:"0 20px 32px" }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:20 }}>
                  <div style={{ width:48, height:48, borderRadius:12,
                    background:`${dmg.color}15`, border:`1px solid ${dmg.color}25`,
                    display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <Icon name={dmg.icon} size={22} color={dmg.color}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:17, fontWeight:700, color:"#fff", marginBottom:4 }}>
                      {dmg.label}
                    </div>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                      <span className={`badge badge-${r.status||"open"}`}>
                        {(r.status||"open").toUpperCase()}
                      </span>
                      {dmg.urgent && <span className="badge badge-urgent">⚠ URGENT</span>}
                    </div>
                  </div>
                  <button onClick={() => setShowDetail(false)}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"var(--n400)" }}>
                    <Icon name="x" size={20} color="var(--n400)"/>
                  </button>
                </div>

                {/* Photos */}
                {r.photo_urls?.length > 0 && (
                  <div style={{ display:"flex", gap:8, overflowX:"auto", marginBottom:16,
                    scrollbarWidth:"none" }}>
                    {r.photo_urls.map((url,i) => (
                      <img key={i} src={url} alt="" style={{ height:120, width:160,
                        objectFit:"cover", borderRadius:"var(--radius-md)", flexShrink:0 }}/>
                    ))}
                  </div>
                )}

                {/* Details */}
                <div className="card" style={{ marginBottom:14 }}>
                  {[
                    { l:"Reporter",    v: r.reporter_name },
                    { l:"Location",    v: r.latitude ? `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}` : "—" },
                    { l:"Heading",     v: r.heading !== null ? `${Math.round(r.heading)}°` : "—" },
                    { l:"Asset Owner", v: r.asset_owner || "—" },
                    { l:"Asset ID",    v: r.asset_id || "—" },
                    { l:"Reported",    v: fmtTime(r.created_at) },
                  ].map(d => (
                    <div key={d.l} style={{ display:"flex", justifyContent:"space-between",
                      padding:"7px 0", borderBottom:"1px solid var(--n900)" }}>
                      <span style={{ fontSize:12, color:"var(--n600)" }}>{d.l}</span>
                      <span style={{ fontSize:12, fontWeight:500, color:"#fff", textAlign:"right",
                        maxWidth:"60%", wordBreak:"break-all" }}>{d.v}</span>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {r.notes && (
                  <div className="card" style={{ marginBottom:14 }}>
                    <div className="label">Notes</div>
                    <p style={{ fontSize:13, color:"var(--n400)", lineHeight:1.5 }}>{r.notes}</p>
                  </div>
                )}

                {/* Status update — owner/admin only */}
                {role.canUpdateStatus && (
                  <div>
                    <div className="label">Update Status</div>
                    <div style={{ display:"flex", gap:8 }}>
                      {["open","assigned","resolved"].map(s => (
                        <button key={s}
                          style={{ flex:1, padding:"10px", borderRadius:"var(--radius-md)",
                            border:"1.5px solid var(--n800)", background:"var(--navy700)",
                            fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer",
                            color: r.status===s ? "#fff" : "var(--n400)",
                            ...(r.status===s ? {
                              background:s==="open"?"rgba(234,88,12,.15)":s==="assigned"?"rgba(217,119,6,.15)":"rgba(5,150,105,.15)",
                              borderColor:s==="open"?"var(--telecom)":s==="assigned"?"var(--amber)":"var(--green)",
                              color:s==="open"?"var(--telecom)":s==="assigned"?"var(--amber)":"var(--green)",
                            }:{}) }}
                          onClick={async () => {
                            await supabase.from("reports").update({ status:s }).eq("id", r.id);
                            setSelectedReport({...r, status:s});
                            fetchReports();
                          }}>
                          {s.charAt(0).toUpperCase()+s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
