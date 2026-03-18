// ==UserScript==
// @name         StatGuessr Mini
// @namespace    statguessr-mini
// @version      1.0.0
// @description  Displays custom profile cards on GeoGuessr profile pages
// @author       Sidecans
// @match        https://www.geoguessr.com/*
// @icon         https://www.geoguessr.com/favicon.ico
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    // ---Edit if you want to change colors and ELO ranges---
    const eloTiers = [
        { min: 0,    max: 400,   color: '#CD7F32' },
        { min: 401,  max: 550,   color: '#A8A8A8' },
        { min: 551,  max: 800,   color: '#FFD700' },
        { min: 801,  max: 1199,  color: '#FF4444' },
        { min: 1200, max: 1500,  color: '#00CED1' },
        { min: 1501, max: 1999,  color: '#0018F9' },
        { min: 2000, max: 99999, color: '#B665E0' }
    ];
    // ---Edit if you know what your doing
    function injectStyles() {
        if (document.getElementById('sg-mini-styles')) return;
        const s = document.createElement('style');
        s.id = 'sg-mini-styles';
        s.textContent = `
            .sg-header-btn{background:rgba(255,255,255,0.08);border:none;color:#aaa;cursor:pointer;width:26px;height:26px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:14px;transition:background 0.15s,color 0.15s}
            .sg-header-btn:hover{background:rgba(255,255,255,0.15);color:#fff}
            #sg-profile-card{position:fixed;bottom:1px;right:60px;z-index:999999;width:260px;background:rgba(18,18,24,0.96);border:1px solid rgba(255,255,255,0.12);border-radius:12px;color:#e0e0e0;font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,0.5)}
            .sg-profile-card-header{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:10px;color:#666}
.sg-profile-card-body{padding:8px 10px}
            .sg-profile-stat{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
            .sg-profile-stat:last-child{border-bottom:none}
            .sg-profile-stat-label{color:#888;font-size:11px;flex-shrink:0}
            .sg-profile-stat-value{font-weight:700;font-size:12px;text-align:right}
            .sg-georank-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;margin-top:10px;padding:8px 16px;border-radius:8px;background:#4ecdc4;color:#111;text-decoration:none;font-size:12px;font-weight:700;box-sizing:border-box}
            .sg-georank-btn:hover{background:#45b7af}
            .sg-status-yes-banned{color:#ff5555}
            .sg-status-yes-chatbanned{color:#ff9f43}
            .sg-country-list{display:inline-flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;max-width:170px}
            .sg-country-chip{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:18px;border-radius:3px;background:rgba(255,255,255,0.16);border:1px solid rgba(255,255,255,0.28);box-shadow:0 0 0 1px rgba(0,0,0,0.35) inset;overflow:hidden}
            .sg-country-flag-icon{width:26px;height:18px;object-fit:fill;display:block}
        `;
        document.head.appendChild(s);
    }


    //---Dont edit anything under here---
    const oFetch = window.fetch.bind(window);
    const state = { enhancedUrl: null, inFlight: false, attempts: 0, lastUrl: '', inited: false };
    const cache = new Map();
    let cardEl = null;
    const getTier = elo => elo == null ? eloTiers[0] : (eloTiers.find(t => elo >= t.min && elo <= t.max) ?? eloTiers[eloTiers.length - 1]);
    const readNextData = () => { try { return JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent); } catch { return null; } };
    const esc = str => str ? String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
    const stat = (label, value, cls = '', style = '') => `<div class="sg-profile-stat"><span class="sg-profile-stat-label">${label}</span><span class="sg-profile-stat-value${cls ? ' '+cls : ''}"${style ? ` style="${style}"` : ''}>${value}</span></div>`;
    const header = () => `<div class="sg-profile-card-header"><span>Built by Sidecans</span><button class="sg-header-btn" id="sg-close" title="Close">✕</button></div>`;
    const isProfilePage = () => window.location.pathname.startsWith('/me/profile') || window.location.pathname.startsWith('/user/');
    const getUserId = () => { const s = window.location.pathname.split('/').filter(Boolean); return s[0] === 'user' ? s[1] || null : null; };
    const removeCard = () => { (cardEl || document.getElementById('sg-profile-card'))?.remove(); cardEl = null; };
    const bindButtons = () => document.getElementById('sg-close')?.addEventListener('click', removeCard);
    function fetchNextData(userId) {
        if (!userId) return Promise.resolve(null);
        if (cache.has(userId)) return cache.get(userId);
        const p = (async () => {
            try {
                const r = await oFetch(`https://www.geoguessr.com/user/${userId}`, { credentials: 'include' });
                if (!r.ok) return null;
                const m = (await r.text()).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
                return m?.[1] ? JSON.parse(m[1]) : null;
            } catch { return null; }
        })();
        cache.set(userId, p);
        return p;
    }
    const getPProf = async userId => (await fetchNextData(userId))?.props?.pageProps;
    async function fetchProfile(userId) {
        if (!userId) return null;
        const p = await getPProf(userId);
        const u = p?.userProfile?.user || p?.user || null;
        return { suspendedUntil: u?.suspendedUntil || p?.userProfile?.suspendedUntil || null, isBanned: Boolean(u?.isBanned || p?.userProfile?.isBanned), isChatBanned: Boolean(u?.chatBan || p?.userProfile?.chatBan) };
    }
    async function fetchPeak(userId) {
        if (!userId) return null;
        const p = await getPProf(userId);
        return p?.peakRating?.peakOverallRating ?? p?.userProfile?.peakRating?.peakOverallRating ?? p?.userProfile?.stats?.peakRating?.peakOverallRating ?? p?.userProfile?.rankedDuels?.maxRating ?? p?.userProfile?.rankedDuels?.peakRating ?? p?.rankedDuels?.maxRating ?? p?.rankedDuels?.peakRating ?? null;
    }
    async function fetchCurrent(userId) {
        if (!userId) return null;
        const p = await getPProf(userId);
        const v = p?.rankedDuels?.rating ?? p?.rankedDuels?.currentRating ?? p?.rankedDuels?.elo ?? p?.userProfile?.rankedDuels?.rating ?? p?.userProfile?.rankedDuels?.currentRating ?? p?.userProfile?.rankedDuels?.elo ?? null;
        return typeof v === 'number' ? v : null;
    }
    async function fetchDuels(userId) {
        if (!userId) return null;
        const p = await getPProf(userId);
        const v = p?.userProfile?.extendedStats?.duelsTotal?.numGamesPlayed ?? null;
        return typeof v === 'number' ? v : null;
    }
    async function fetchProgress(userId) {
        if (!userId) return null;
        try {
            const r = await oFetch(`https://www.geoguessr.com/api/v4/ranked-system/progress/${userId}`, { credentials: 'include' });
            const d = r.ok ? await r.json() : null;
            return d ? { rating: typeof d.rating === 'number' ? d.rating : null, bestCountries: Array.isArray(d.bestCountries) ? d.bestCountries : null, worstCountries: Array.isArray(d.worstCountries) ? d.worstCountries : null } : null;
        } catch { return null; }
    }
    function renderFlags(countries) {
        if (!Array.isArray(countries) || !countries.length) return '';
        return `<span class="sg-country-list">${countries.map(c => {
            const code = String(c).trim().toUpperCase();
            if (/^[A-Z]{2}$/.test(code)) {
                let name = code;
                try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch {}
                return `<span class="sg-country-chip" title="${esc(code)}"><img class="sg-country-flag-icon" src="https://flagicons.lipis.dev/flags/4x3/${code.toLowerCase()}.svg" alt="${esc(name)}"></span>`;
            }
            return `<span class="sg-country-chip" title="${esc(code)}"><span style="padding:0 4px;color:#fff;font-size:10px;">${esc(code)}</span></span>`;
        }).join('')}</span>`;
    }
    function fmtSuspended(value) {
        if (!value) return null;
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return String(value);
        try { return dt.toLocaleString('en-US', { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'UTC' }) + ' UTC'; }
        catch { return dt.toISOString().replace('T', ' ').replace(/\.000Z|Z/, ' UTC'); }
    }
    async function enhance() {
        if (!isProfilePage()) { removeCard(); return; }
        const path = window.location.pathname;
        if (state.enhancedUrl === path || state.inFlight) return;
        state.inFlight = true;
        let userId = null;
        try {
            if (path.startsWith('/me/profile')) {
                const nd = readNextData();
                const u = nd?.props?.accountProps?.account?.user || nd?.props?.pageProps?.userProfile?.user || null;
                userId = u?.id || u?.userId || null;
                if (!userId && state.attempts < 10) { state.attempts++; state.inFlight = false; setTimeout(enhance, 50); return; }
            } else { userId = getUserId(); }
            if (!userId) return;
            removeCard();
            cardEl = document.createElement('div');
            cardEl.id = 'sg-profile-card';
            cardEl.innerHTML = `${header()}<div class="sg-profile-card-body">${stat('Loading...', '-')}</div>`;
            document.body.appendChild(cardEl);
            bindButtons();
            const [prog, prof, duels, cur, peak] = await Promise.all([fetchProgress(userId), fetchProfile(userId), fetchDuels(userId), fetchCurrent(userId), fetchPeak(userId)]);
            if (window.location.pathname !== path || !cardEl) return;
            const elo = prog?.rating ?? cur ?? null;
            const pk = typeof peak === 'number' ? peak : null;
            const susp = Boolean(prof?.suspendedUntil);
            const banned = Boolean(prof && (prof.isBanned || susp));
            cardEl.innerHTML = `${header()}<div class="sg-profile-card-body">${[
                stat('Current ELO', elo != null ? Math.round(elo) : 'N/A', '', `color:${elo != null ? getTier(elo).color : '#888'}`),
                stat('Peak ELO', pk != null ? Math.round(pk) : 'N/A', '', `color:${pk != null ? getTier(pk).color : '#888'}`),
                duels != null ? stat('Duels Played', duels) : '',
                stat(susp ? 'Suspended until' : 'Banned', susp ? esc(fmtSuspended(prof.suspendedUntil) || 'yes') : (banned ? 'yes' : 'no'), banned ? 'sg-status-yes-banned' : ''),
                prof?.isChatBanned ? stat('Chat banned', 'yes', 'sg-status-yes-chatbanned') : '',
                prog?.bestCountries?.length ? stat('Best Countries', renderFlags(prog.bestCountries)) : '',
                prog?.worstCountries?.length ? stat('Worst Countries', renderFlags(prog.worstCountries)) : ''
            ].join('')}<a class="sg-georank-btn" href="https://georank.io/player/${userId}" target="_blank" rel="noopener">View on GeoRank</a></div>`;
            bindButtons();
            state.enhancedUrl = path;
        } finally { state.inFlight = false; }
    }
    function onUrlChange() {
        const url = window.location.href;
        if (url === state.lastUrl) return;
        state.lastUrl = url;
        state.enhancedUrl = null;
        state.attempts = 0;
        removeCard();
        if (isProfilePage()) setTimeout(enhance, 150);
    }
    function init() {
        if (state.inited) return;
        state.inited = true;
        injectStyles();
        state.lastUrl = window.location.href;
        const wrap = fn => function (...args) { fn(...args); onUrlChange(); };
        history.pushState = wrap(history.pushState.bind(history));
        history.replaceState = wrap(history.replaceState.bind(history));
        window.addEventListener('popstate', onUrlChange);
        setInterval(() => { if (window.location.href !== state.lastUrl) onUrlChange(); }, 1000);
        if (isProfilePage()) enhance();
    }
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
})();
