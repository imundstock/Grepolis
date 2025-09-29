// ==UserScript==
// @name         Grepolis — Painel Unificado (loader via GitHub)
// @namespace    https://grepolis.com
// @version      1.0
// @description  Painel principal que carrega AutoCast, AutoSelect e AutoEnvio a partir do GitHub, todos iniciando minimizados.
// @match        http://*grepolis.com/game/*
// @match        https://*br139.grepolis.com/game/*
// @match        https://*br140.grepolis.com/game/*
// @match        https://*br141.grepolis.com/game/*
// @run-at       document-idle
// @grant        none
// @require https://cdn.jsdelivr.net/gh/imundstock/grepolis-userscripts@v1.0.1/modules/AutoCast.js
// @require https://cdn.jsdelivr.net/gh/imundstock/grepolis-userscripts@v1.0.1/modules/AutoEnvioRecursos.js
// @require https://cdn.jsdelivr.net/gh/imundstock/grepolis-userscripts@v1.0.1/modules/AutoSelectZ.js
// ==/UserScript==

(function () {
  'use strict';

  const PANEL_IDS = {
    acp: 'acp-panel',               // AutoCast
    ae:  'auto-envio-recursos'      // AutoEnvio
    // AutoSelect é resolvido dinamicamente (gd-panel ou via GREPO_UI)
  };

  // util: esperar elemento existir
  function waitFor(selectorOrFn, { timeout = 6000, interval = 200 } = {}) {
    return new Promise(resolve => {
      const start = Date.now();
      const tick = () => {
        const el = (typeof selectorOrFn === 'string')
          ? document.querySelector(selectorOrFn)
          : selectorOrFn();
        if (el) return resolve(el);
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  // minimiza painéis conhecidos
  function hidePanelById(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  function startMinimized() {
    hidePanelById(PANEL_IDS.acp);
    hidePanelById(PANEL_IDS.ae);
    // AutoSelect:
    if (window.GREPO_UI?.autoselect?.hide) {
      window.GREPO_UI.autoselect.hide();
    } else if (window.__AUTOSELECT_PANEL_ID__) {
      hidePanelById(window.__AUTOSELECT_PANEL_ID__);
    } else {
      hidePanelById('gd-panel');
    }
  }

  // observar novos painéis e escondê-los ao nascer
  function watchNewPanels() {
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes && m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          // ids diretos
          [PANEL_IDS.acp, PANEL_IDS.ae, 'gd-panel', window.__AUTOSELECT_PANEL_ID__].forEach(id => {
            if (!id) return;
            if (n.id === id) n.style.display = 'none';
            const found = n.querySelector?.('#' + id);
            if (found) found.style.display = 'none';
          });
        });
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // painel principal
  function createMainPanel() {
    if (document.getElementById('main-panel')) return;

    const style = document.createElement('style');
    style.textContent = `
      #main-panel {
        position: fixed; top: 650px; right: 1660px; z-index: 100000;
        width: 220px; background: #1a1a1a; border: 3px solid #4c1d95; border-radius: 12px;
        padding: 12px; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, sans-serif;
        color: #e6e6ea; box-shadow: 0 6px 20px rgba(0,0,0,.35);
      }
      #main-panel h2 { font-size: 14px; font-weight: 800; margin: 0 0 6px; text-align: center; }
      #main-panel .btn {
        padding: 8px; border-radius: 8px; font-weight: 800; cursor: pointer; text-align: center; margin-top: 6px;
        border: 1px solid #2c2c2c; background: #12121a; color: #e6e6ea;
        transition: transform .08s, box-shadow .15s, border-color .15s, background .15s; text-shadow: 0 1px 1px rgba(0,0,0,.3);
      }
      #main-panel .btn:hover {
        background: #4c1d95; color: #fff; border-color: #6d28d9; transform: translateY(-1px);
        box-shadow: 0 0 0 3px rgba(109,40,217,.16);
      }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'main-panel';
    panel.innerHTML = `
      <h2>Painel Principal</h2>
      <div id="btn-acp" class="btn">AutoCast</div>
      <div id="btn-gd"  class="btn">AutoSelect</div>
      <div id="btn-ae"  class="btn">AutoEnvio</div>
    `;
    document.body.appendChild(panel);

    // togglers
    const toggleById = async (id) => {
      let el = document.getElementById(id);
      if (!el) el = await waitFor('#' + id, { timeout: 6000 });
      if (!el) { alert('Painel "' + id + '" não encontrado.'); return; }
      el.style.display = (el.style.display === 'none') ? 'block' : 'none';
    };

    // AutoCast
    document.getElementById('btn-acp').addEventListener('click', () => toggleById(PANEL_IDS.acp));

    // AutoEnvio
    document.getElementById('btn-ae').addEventListener('click', () => toggleById(PANEL_IDS.ae));

    // AutoSelect (usa gancho se existir; senão tenta ids conhecidos/heurística)
    document.getElementById('btn-gd').addEventListener('click', async () => {
      // 1) gancho oficial
      if (window.GREPO_UI?.autoselect?.toggle) {
        window.GREPO_UI.autoselect.toggle();
        return;
      }
      // 2) id exposto pelo módulo
      if (window.__AUTOSELECT_PANEL_ID__) {
        await toggleById(window.__AUTOSELECT_PANEL_ID__);
        return;
      }
      // 3) id padrão do exemplo
      const el = document.getElementById('gd-panel') || await waitFor('#gd-panel', { timeout: 6000 });
      if (el) {
        el.style.display = (el.style.display === 'none') ? 'block' : 'none';
        return;
      }
      alert('Painel do AutoSelect não foi encontrado. Verifique se o módulo criou o painel.');
    });
  }

  // boot
  const boot = setInterval(() => {
    if (document.body) {
      createMainPanel();
      startMinimized();
      watchNewPanels();

      // refaça a minimização por alguns ciclos (caso os módulos criem depois)
      let tries = 0;
      const recheck = setInterval(() => {
        startMinimized();
        if (++tries > 10) clearInterval(recheck);
      }, 500);

      clearInterval(boot);
    }
  }, 300);
})();
