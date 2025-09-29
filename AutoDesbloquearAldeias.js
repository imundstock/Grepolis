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

    // Ajuste aqui sua meta por cidade (na ilha da cidade atual)
    const TARGET_ALDEIAS = 6;
    // Ajuste o intervalo de verificação (ms)
    const LOOP_MS = 30000;

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

                // relation_status:
                // 0 = bloqueada; !=0 = desbloqueada (normalmente 1)
                const st = rel?.attributes?.relation_status;
                if (st === 0) {
                    bloqueadas.push({ aldeia: a, rel });
                } else {
                    desbloqueadas++;
                }
            }

            log(`ℹ️ Cidade ${polisID} -> ${desbloqueadas} já desbloqueadas / meta ${TARGET_ALDEIAS} | bloqueadas encontradas: ${bloqueadas.length}`);

            if (desbloqueadas >= TARGET_ALDEIAS) {
                if (loopId) {
                    clearInterval(loopId);
                    loopId = null;
                }
                log(`🛑 Meta atingida (${desbloqueadas} >= ${TARGET_ALDEIAS}). Loop parado.`);
                return;
            }

            const faltam = Math.max(0, TARGET_ALDEIAS - desbloqueadas);
            let feitas = 0;

            for (let i = 0; i < bloqueadas.length && feitas < faltam; i++) {
                const { aldeia, rel } = bloqueadas[i];
                unlock(polisID, rel.id, aldeia.id);
                feitas++;
            }

            if (feitas === 0) {
                log("🔄 Nada para desbloquear agora (ou nenhuma relação pendente para esta ilha).");
            } else {
                log(`🚀 Tentativas enviadas: ${feitas} (faltavam ${faltam}).`);
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
