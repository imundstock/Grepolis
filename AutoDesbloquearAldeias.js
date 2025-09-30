// ==UserScript==
// @name         AutoDesbloquearAldeias
// @namespace    https://grepolis.com
// @version      1.3
// @description  Desbloqueia aldeias automaticamente em loop até atingir a meta por cidade, com verificações robustas
// @author       HANNZO
// @match        https://*br140.grepolis.com/game/*
// @match        https://*br142.grepolis.com/game/*
// @match        https://*br143.grepolis.com/game/*
// @match        https://*br144.grepolis.com/game/*
// @match        https://*br145.grepolis.com/game/*
// @match        https://*br146.grepolis.com/game/*
// @match        https://*br147.grepolis.com/game/*
// @match        https://*br148.grepolis.com/game/*
// @match        https://*br149grepolis.com/game/*
// ==/UserScript==

(function () {
    'use strict';

    const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // Meta por cidade (na ilha da cidade atual)
    const TARGET_ALDEIAS = 6;
    // Intervalo de verificação (ms)
    const LOOP_MS = 30000;

    // Custos em PC para cada aldeia (1ª até 6ª)
    const CUSTOS_ALDEIAS = [2, 8, 10, 30, 50, 100];

    let loopId = null;

    function log(...args) { console.log('[AutoDesbloquearAldeias]', ...args); }
    function warn(...args) { console.warn('[AutoDesbloquearAldeias]', ...args); }
    function err(...args) { console.error('[AutoDesbloquearAldeias]', ...args); }

    function unlock(polisID, farmTownPlayerID, ruralID) {
        const data = {
            model_url: 'FarmTownPlayerRelation/' + farmTownPlayerID,
            action_name: 'unlock',
            arguments: { farm_town_id: ruralID },
            town_id: polisID
        };
        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, () => {
            log(`✅ Desbloqueada aldeia ${ruralID} (cidade ${polisID})`);
        });
    }

    function getIslandCoordsOfTown(polisID) {
        const t = uw.ITowns.towns[polisID];
        return [t.getIslandCoordinateX(), t.getIslandCoordinateY()];
    }

    // Lê os pontos de combate disponíveis do DOM:
    // <div class="nui_battlepoints_container"><div class="bp_icon"></div><div class="points">2</div></div>
    function getPontosCombateDisponiveis() {
        try {
            const el = document.querySelector('.nui_battlepoints_container .points');
            if (!el) return 0;
            const raw = (el.textContent || '').trim().replace(/[^\d]/g, '');
            const val = parseInt(raw, 10);
            return Number.isFinite(val) ? val : 0;
        } catch {
            return 0;
        }
    }

    // Junta models de TODAS as coleções com esse nome (evita depender de [0])
    function getAllModels(collectionName) {
        const cols = uw.MM?.getCollections?.()[collectionName] || [];
        const out = [];
        for (let i = 0; i < cols.length; i++) {
            const m = cols[i]?.models;
            if (Array.isArray(m)) out.push(...m);
        }
        return out;
    }

    // Garante que FarmTown e FarmTownPlayerRelation estão realmente carregados
    function waitForCollections(cb) {
        const t0 = Date.now();
        const int = setInterval(() => {
            const townsReady = !!(uw.Game?.townId && uw.ITowns?.towns);
            const ajaxReady = typeof uw.gpAjax?.ajaxPost === 'function';

            const farmTowns = getAllModels('FarmTown');
            const relations = getAllModels('FarmTownPlayerRelation');

            if (townsReady && ajaxReady && farmTowns.length > 0 && relations.length > 0) {
                clearInterval(int);
                log(`📦 Coleções prontas em ${(Date.now()-t0)}ms: FarmTown=${farmTowns.length}, Relations=${relations.length}`);
                cb();
            }
        }, 1000);
    }

    function runForCurrentTown() {
        try {
            const polisID = uw.Game.townId;
            const [islandX, islandY] = getIslandCoordsOfTown(polisID);

            const aldeias = getAllModels('FarmTown');
            const relacoes = getAllModels('FarmTownPlayerRelation');

            if (!aldeias.length || !relacoes.length) {
                warn('Coleções vazias no momento da execução. Tentará novamente no próximo loop.');
                return;
            }

            // Mapa rápido: farm_town_id -> relation
            const relPorRural = new Map();
            for (let i = 0; i < relacoes.length; i++) {
                const r = relacoes[i];
                if (typeof r?.getFarmTownId !== 'function') continue;
                relPorRural.set(r.getFarmTownId(), r);
            }

            // Filtra aldeias da mesma ilha
            const aldeiasDaIlha = [];
            for (let i = 0; i < aldeias.length; i++) {
                const a = aldeias[i];
                const ax = a?.attributes?.island_x;
                const ay = a?.attributes?.island_y;
                if (ax === islandX && ay === islandY) aldeiasDaIlha.push(a);
            }

            log(`🔎 Ilha (${islandX},${islandY}) -> aldeias na ilha: ${aldeiasDaIlha.length}, relações: ${relacoes.length}`);

            let desbloqueadas = 0;
            const bloqueadas = [];

            for (let i = 0; i < aldeiasDaIlha.length; i++) {
                const a = aldeiasDaIlha[i];
                const rel = relPorRural.get(a.id);
                if (!rel) continue;

                // relation_status: 0 = bloqueada; !=0 = desbloqueada
                const st = rel?.attributes?.relation_status;
                if (st === 0) {
                    bloqueadas.push({ aldeia: a, rel });
                } else {
                    desbloqueadas++;
                }
            }

            // Ordena bloqueadas por id para ter determinismo (opcional)
            bloqueadas.sort((x, y) => (x.aldeia?.id || 0) - (y.aldeia?.id || 0));

            log(`ℹ️ Cidade ${polisID} -> ${desbloqueadas} já desbloqueadas / meta ${TARGET_ALDEIAS} | bloqueadas encontradas: ${bloqueadas.length}`);

            if (desbloqueadas >= TARGET_ALDEIAS) {
                if (loopId) {
                    clearInterval(loopId);
                    loopId = null;
                }
                log(`🛑 Meta atingida (${desbloqueadas} >= ${TARGET_ALDEIAS}). Loop parado.`);
                return;
            }

            // *** NOVO: verificação de PC disponíveis e custos por ordem ***
            let pcDisponiveis = getPontosCombateDisponiveis();
            const faltamParaMeta = Math.max(0, Math.min(TARGET_ALDEIAS, CUSTOS_ALDEIAS.length) - desbloqueadas);

            if (pcDisponiveis <= 0) {
                log(`💤 Sem pontos de combate disponíveis no momento (PC=${pcDisponiveis}).`);
                return;
            }

            let feitas = 0;
            let idxCusto = desbloqueadas; // índice da próxima aldeia (0-based)
            let iBloq = 0;                // cursor na lista de bloqueadas

            while (
                feitas < faltamParaMeta &&
                iBloq < bloqueadas.length &&
                idxCusto < CUSTOS_ALDEIAS.length
            ) {
                const custoProx = CUSTOS_ALDEIAS[idxCusto];
                if (pcDisponiveis >= custoProx) {
                    const { aldeia, rel } = bloqueadas[iBloq];
                    unlock(polisID, rel.id, aldeia.id);

                    pcDisponiveis -= custoProx; // consome os PCs localmente
                    feitas++;
                    idxCusto++; // próxima aldeia terá o próximo custo
                    iBloq++;    // pega a próxima bloqueada
                } else {
                    log(`⛔ PC insuficientes para próxima aldeia: preciso ${custoProx}, tenho ${pcDisponiveis}.`);
                    break;
                }
            }

            if (feitas === 0) {
                log("🔄 Nada para desbloquear agora (sem PC ou sem relação pendente/custo atingível).");
            } else {
                log(`🚀 Tentativas enviadas: ${feitas}. PC restantes (estimado local): ${pcDisponiveis}.`);
            }
        } catch (e) {
            err('Exceção em runForCurrentTown:', e);
        }
    }

    // Espera o jogo e coleções, depois inicia loop
    (function bootstrap() {
        const waitUntilReady = setInterval(() => {
            if (
                uw.Game?.townId &&
                uw.ITowns?.towns &&
                typeof uw.gpAjax?.ajaxPost === 'function' &&
                typeof uw.MM?.getCollections === 'function'
            ) {
                clearInterval(waitUntilReady);
                waitForCollections(() => {
                    log("✅ Ambiente pronto. Iniciando loop de desbloqueio...");
                    runForCurrentTown();             // roda já
                    loopId = setInterval(runForCurrentTown, LOOP_MS); // repete
                });
            }
        }, 1000);
    })();
})();
