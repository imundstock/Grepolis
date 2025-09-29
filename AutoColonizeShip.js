// ==UserScript==
// @name         Auto Colonize Ship (20s after load)
// @namespace    grepolis-auto-colonize
// @description  20s após abrir o jogo, recruta 1 Navio Colono se todos os requisitos forem satisfeitos.
// @version      1.0.0
// @match        https://*br140.grepolis.com/game/*
// @match        https://*br142.grepolis.com/game/*
// @match        https://*br143.grepolis.com/game/*
// @match        https://*br144.grepolis.com/game/*
// @match        https://*br145.grepolis.com/game/*
// @match        https://*br146.grepolis.com/game/*
// @match        https://*br147.grepolis.com/game/*
// @match        https://*br148.grepolis.com/game/*
// @match        https://*br149grepolis.com/game/*

// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Suporta tanto window quanto unsafeWindow (em extensões como Tampermonkey/Greasemonkey)
  var uw = (typeof unsafeWindow === 'undefined') ? window : unsafeWindow;

  // Aguarda a API do jogo estar pronta (Layout/MM/ITowns)
  function ready() {
    try {
      return uw && uw.ITowns && uw.ITowns.getCurrentTown && uw.MM && uw.Layout && uw.gpAjax;
    } catch (e) {
      return false;
    }
  }

  function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

  async function mainOnceAfterLoad() {
    // espera 20s após o load da página do jogo
    await sleep(20000);

    if (!ready()) {
      console.log('[AutoColonize] API do jogo ainda não disponível.');
      return;
    }

    try {
      const town = uw.ITowns.getCurrentTown();
      if (!town) {
        console.log('[AutoColonize] Nenhuma cidade atual encontrada.');
        return;
      }

      const townId = town.getId ? town.getId() : town.id;

      // 1) Checagem de requisitos do jogo
      const buildings = town.buildings().attributes;
      const researches = town.researches().attributes;

      const hasResearch = !!researches.colonize_ship;
      const docksLevel = buildings.docks || 0;
      const docksOk = docksLevel >= 10;

      if (!hasResearch || !docksOk) {
        console.log(`[AutoColonize] Requisitos não atendidos: pesquisa=${hasResearch}, porto=${docksLevel}/10.`);
        return;
      }

      // 2) Checar fila naval (não exagerar na fila; aqui, se houver >=7 ordens navais, não tenta)
      const navalOrdersCount = town.getUnitOrdersCollection().where({ kind: 'naval' }).length;
      if (navalOrdersCount >= 7) {
        console.log('[AutoColonize] Fila naval cheia (>=7).');
        return;
      }

      // 3) Checar população e recursos (com desconto de modificadores)
      const unitId = 'colonize_ship';
      const unitData = uw.GameData.units[unitId];
      if (!unitData) {
        console.log('[AutoColonize] Dados de unidade não encontrados.');
        return;
      }

      const popFree = town.getAvailablePopulation();
      if (popFree < unitData.population) {
        console.log('[AutoColonize] População insuficiente.');
        return;
      }

      const res = town.resources(); // { wood, stone, iron, storage, favor, population }
      const discount = uw.GeneralModifications.getUnitBuildResourcesModification(townId, unitData) || 1;

      const needWood  = Math.round(unitData.resources.wood  * discount);
      const needStone = Math.round(unitData.resources.stone * discount);
      const needIron  = Math.round(unitData.resources.iron  * discount);

      if (res.wood < needWood || res.stone < needStone || res.iron < needIron) {
        console.log(`[AutoColonize] Recursos insuficientes (precisa: ${needWood}/${needStone}/${needIron}).`);
        return;
      }

      // 4) Dispara o pedido de construção (Grepolis usa este endpoint para fila de tropas navais/terrestres)
      const payload = {
        unit_id: unitId,
        amount: 1,
        town_id: townId
      };

      uw.gpAjax.ajaxPost('building_barracks', 'build', payload, true, function () {
        // callback success
        uw.HumanMessage && uw.HumanMessage.success && uw.HumanMessage.success('Navio colono recrutado automaticamente.');
        console.log('[AutoColonize] Pedido de construção enviado: 1 colonize_ship.');
      });

    } catch (err) {
      console.error('[AutoColonize] Erro ao tentar recrutar:', err);
    }
  }

  // Aguarda a UI do jogo e roda apenas uma vez a cada carregamento
  (async function waitForGame() {
    // espera alguns ciclos curtos pela API antes dos 20s
    let tries = 0;
    while (!ready() && tries < 60) { // ~6s
      await sleep(100);
      tries++;
    }
    // mesmo que ainda não esteja tudo pronto, a função principal espera 20s, o que costuma ser suficiente
    mainOnceAfterLoad();
  })();

})();
