// ==UserScript==
// @name         Grepolis: Auto-click + Refresh (robusto)
// @namespace    https://grepolis-helper.local
// @version      1.1
// @description  Espera 15s, clica nos botões (com retries/iframes), mostra HUD e recarrega a cada 5min.
// @author       você
// @match        *://*.grepolis.com/*
// @match        *://*.grepolis.*/*
// @match        *://grepolis.com/*
// @include      *grepolis*/game*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ===== Config =====
  const INITIAL_WAIT_MS   = 15000;          // 15s
  const COUNTDOWN_MS      = 30 * 60 * 1000;  // 30min
  const SEARCH_TIMEOUT_MS = 60000;          // até 60s procurando os alvos
  const SEARCH_POLL_MS    = 400;            // intervalo entre tentativas

  // Seletores (várias alternativas para ser resiliente)
  const ISLAND_SELECTORS = [
    'div.option.island_view.circle_button.js-option.checked',
    'div.option.island_view.circle_button.js-option',
    'div.option.island_view',
    '[name="island_view"]',
    '.js-option[name="island_view"]',
  ];
  const JUMP_SELECTORS = [
    'div.btn_jump_to_town.circle_button.jump_to_town',
    '.btn_jump_to_town',
    '[class*="jump_to_town"]',
    '[data-action="jump_to_town"]',
  ];

  // ===== HUD =====
  let hud, hudText, hudStatus;
  function ensureHUD() {
    if (document.getElementById('gp-auto-hud')) return;
    hud = document.createElement('div');
    hud.id = 'gp-auto-hud';
    Object.assign(hud.style, {
      position: 'fixed',
      right: '1700px',
      bottom: '12px',
      padding: '10px 12px',
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      font: '12px/1.35 system-ui, Arial, sans-serif',
      borderRadius: '10px',
      zIndex: 2147483647,
      pointerEvents: 'none',
      boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
      minWidth: '170px'
    });
    const title = document.createElement('div');
    title.textContent = 'Grepolis Auto';
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';
    hudText = document.createElement('div');
    hudStatus = document.createElement('div');
    hudStatus.style.opacity = '0.85';
    hudStatus.style.marginTop = '4px';
    hud.appendChild(title);
    hud.appendChild(hudText);
    hud.appendChild(hudStatus);
    document.documentElement.appendChild(hud);
  }
  const mmss = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(s / 60)).padStart(2, '0');
    const r = String(s % 60).padStart(2, '0');
    return `${m}:${r}`;
  };

  // ===== Util =====
  function simulateClick(el) {
    try {
      const rect = el.getBoundingClientRect();
      const x = rect.left + Math.max(1, Math.min(5, rect.width - 1));
      const y = rect.top + Math.max(1, Math.min(5, rect.height - 1));
      const opts = { bubbles: true, cancelable: true, view: el.ownerDocument.defaultView, clientX: x, clientY: y };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
      // fallback
      if (typeof el.click === 'function') el.click();
      return true;
    } catch (e) {
      console.warn('[Grepolis Auto] Erro ao simular clique:', e);
      return false;
    }
  }

  function getAllDocuments() {
    const docs = [document];
    // varre iframes do mesmo domínio (se houver)
    document.querySelectorAll('iframe').forEach((ifr) => {
      try {
        if (ifr.contentDocument) docs.push(ifr.contentDocument);
      } catch (_) { /* cross-origin: ignora */ }
    });
    return docs;
  }

  function queryAny(selectors) {
    const docs = getAllDocuments();
    for (const doc of docs) {
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el) return el;
      }
    }
    return null;
  }

  function waitForAny(selectors, timeout = SEARCH_TIMEOUT_MS, poll = SEARCH_POLL_MS) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tryFind = () => {
        const el = queryAny(selectors);
        if (el) return resolve(el);
        if (performance.now() - t0 >= timeout) return resolve(null);
        setTimeout(tryFind, poll);
      };
      tryFind();
    });
  }

  // ===== Fluxo principal =====
  async function main() {
    ensureHUD();
    hudText.textContent = `Aguardando ${mmss(INITIAL_WAIT_MS)} para clicar...`;
    hudStatus.textContent = 'Preparando…';
    const titleBase = document.title;

    // Contador de pré-clique (apenas visual)
    const tStartWait = Date.now();
    const waitTimer = setInterval(() => {
      const left = INITIAL_WAIT_MS - (Date.now() - tStartWait);
      hudText.textContent = `Aguardando ${mmss(left)} para clicar...`;
      document.title = `⏳ ${mmss(left)} — ${titleBase}`;
      if (left <= 0) clearInterval(waitTimer);
    }, 250);

    // Espera inicial
    await new Promise(r => setTimeout(r, INITIAL_WAIT_MS));
    document.title = titleBase;

    // Procura e clica botões
    hudStatus.textContent = 'Procurando botões...';
    const islandBtn = await waitForAny(ISLAND_SELECTORS);
    if (islandBtn) {
      hudStatus.textContent = 'Clicando island_view...';
      simulateClick(islandBtn);
    } else {
      hudStatus.textContent = '⚠️ island_view não encontrado (seguindo mesmo assim)';
      console.warn('[Grepolis Auto] island_view não encontrado.');
    }

    const jumpBtn = await waitForAny(JUMP_SELECTORS);
    if (jumpBtn) {
      hudStatus.textContent = 'Clicando jump_to_town...';
      simulateClick(jumpBtn);
    } else {
      hudStatus.textContent = '⚠️ jump_to_town não encontrado (seguindo mesmo assim)';
      console.warn('[Grepolis Auto] jump_to_town não encontrado.');
    }

    // Inicia contagem para refresh
    const tEnd = Date.now() + COUNTDOWN_MS;
    const tick = setInterval(() => {
      const left = tEnd - Date.now();
      const txt = mmss(left);
      hudText.textContent = `Recarrega em ${txt}`;
      document.title = `⟳ ${txt} — ${titleBase}`;
      if (left <= 0) {
        clearInterval(tick);
        document.title = titleBase;
        hudStatus.textContent = 'Atualizando página...';
        // Recarrega (equivalente ao F5)
        location.reload();
      }
    }, 1000);
  }

  // Proteção contra múltiplas execuções
  if (!window.__gp_auto_click_refresh__) {
    window.__gp_auto_click_refresh__ = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', main, { once: true });
    } else {
      main();
    }
  }
})();
