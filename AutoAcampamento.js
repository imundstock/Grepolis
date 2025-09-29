// ==UserScript==
// @name         AutoAcampamento
// @namespace    gp/attack-spot-check-troops
// @version      1.1.0
// @description  Envia ataque ao Acampamento somente se houver tropas na cidade; coleta recompensa automaticamente
// @match        https://*.grepolis.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    /*** LOG ***/
    const log  = (...a) => console.log('[AttackSpot]', ...a);
    const warn = (...a) => console.warn('[AttackSpot]', ...a);

    /*** Util: unidades da cidade atual, sem milícia/navios/zeros ***/
    function getUnitsForAttack() {
        const town = uw.ITowns.towns[uw.Game.townId];
        if (!town) return {};
        const raw = Object.assign({}, town.units() || {});

        // remove milícia
        delete raw.militia;

        // remove navios e quantidades <= 0
        Object.keys(raw).forEach(k => {
            const v = raw[k] || 0;
            if (v <= 0 || /ship/i.test(k)) delete raw[k];
        });

        return raw;
    }

    function hasAnyTroops(unitsObj){
        for (const k in unitsObj) {
            if (Object.prototype.hasOwnProperty.call(unitsObj,k) && unitsObj[k] > 0) return true;
        }
        return false;
    }

    /*** Evita atacar se já há movimentos ligados ao Attack Spot ***/
    function isAttackSpotBusy() {
        const mm = uw.MM?.getModels?.();
        if (!mm || !mm.MovementsUnits) return false;

        const moves = mm.MovementsUnits;
        const keys = Object.keys(moves);
        for (let i = 0; i < keys.length; i++) {
            const m = moves[keys[i]];
            const a = m?.attributes;
            if (!a) continue;
            if (a.destination_is_attack_spot || a.origin_is_attack_spot) return true;
        }
        return false;
    }

    /*** Envia ataque ao Attack Spot, se possível ***/
    function attackBootcamp() {
        // Mantém verificação visual simples para saber se o botão está habilitado
        // (não envia quando o lugar não permite ataque)
        const attack_possible = document.getElementsByClassName("attack_spot attack_possible")[0];
        if (!attack_possible) return false;

        if (isAttackSpotBusy()) {
            log('⏳ Já existe movimento envolvendo Attack Spot. Aguardando...');
            return false;
        }

        const unitsToSend = getUnitsForAttack();
        if (!hasAnyTroops(unitsToSend)) {
            log('⛔ Sem tropas terrestres disponíveis na cidade. Ataque não será enviado.');
            return false;
        }

        const model_url = "PlayerAttackSpot/" + uw.Game.player_id;
        const data = {
            model_url: model_url,
            action_name: "attack",
            arguments: unitsToSend,
            town_id: uw.Game.townId // corrigido (antes estava Game.townId6)
        };

        log('🚀 Enviando ataque ao Attack Spot com unidades:', unitsToSend);
        uw.gpAjax.ajaxPost("frontend_bridge", "execute", data, () => {
            log('✅ Ataque enviado com sucesso.');
        }, {
            error: function(xhr) {
                warn('⛔ Erro ao enviar ataque ao Attack Spot.', xhr);
            }
        });

        return true;
    }

    /*** Coleta recompensa quando disponível ***/
    function rewardBootcamp() {
        const collect = document.getElementsByClassName("attack_spot collect_reward")[0];
        if (!collect) return false;

        const model_url = "PlayerAttackSpot/" + uw.Game.player_id;
        const data = {
            model_url: model_url,
            action_name: "stashReward",
            arguments: {},
            town_id: uw.Game.townId // corrigido
        };

        uw.gpAjax.ajaxPost("frontend_bridge", "execute", data, () => {
            log('🎁 Recompensa coletada (stashReward).');
        }, {
            error : function() {
                // fallback legado mantido, caso o servidor exija "useReward"
                const data2 = {
                    model_url: "PlayerAttackSpot/1970864",
                    action_name: "useReward",
                    arguments: {},
                    town_id: uw.Game.townId
                };
                uw.gpAjax.ajaxPost("frontend_bridge", "execute", data2, () => {
                    log('🎁 Recompensa utilizada (useReward).');
                });
            }
        });

        return true;
    }

    /*** Loop ***/
    setInterval(function() {
        if (attackBootcamp()) return;
        if (rewardBootcamp()) return;
    }, 5000);
})();
