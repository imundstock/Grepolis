// ==UserScript==
// @name         AutoMultiStopCast
// @namespace    https://grepolis.com
// @version      1.0
// @description  Grepolis Builder
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

(function() {
    'use strict';

    let uw = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;

    const STOP_ON_QUEST_ID = 'CastPowerQuest';
    let missionStopped = false;

    const get_finisched_tasks = () => {
        const { Progressable } = uw.MM.getCollections();
        const { models } = Progressable[0];
        let finisched = [];
        for (let model of models) {
            let { attributes } = model;
            if (attributes.state !== "satisfied") continue;
            finisched.push(attributes);
        }
        return finisched;
    };

    const claim_reward = (reward) => {
        const data = {
            "model_url": `Progressable/${reward.id}`,
            "action_name": "progressTo",
            "arguments": {
                "progressable_id": reward.progressable_id,
                "state": "closed"
            }
        };
        uw.gpAjax.ajaxPost("frontend_bridge", "execute", data);
    };

    const set_hera = (town_id) => {
        const data = {
            "god_id": "hera",
            "town_id": town_id
        };
        uw.gpAjax.ajaxPost("building_temple", "change_god", data);
    };

    const cast_spell = (town_id) => {
        const data = {
            "model_url": "CastedPowers",
            "action_name": "cast",
            "arguments": {
                "power_id": "wedding",
                "target_id": town_id
            }
        };
        uw.gpAjax.ajaxPost("frontend_bridge", "execute", data);
    };

    function main() {
        if (missionStopped) return;

        const town = uw.ITowns.getCurrentTown();
        const { wood, iron, stone, storage } = town.resources();
        const margin = 50;

        if (Object.keys(uw.ITowns.towns).length === 1) {
            const { hera_favor } = uw.ITowns.player_gods.attributes;
            if (hera_favor > 30 && wood + margin < storage && iron + margin < storage && stone + margin < storage) {
                cast_spell(town.id);
            }
            const buildings = town.buildings();
            const { temple } = buildings.attributes;
            if (temple > 0 && !town.god()) {
                set_hera(town.id);
                console.log("missing_god");
            }
        }

        const missions = get_finisched_tasks();

        // Se a missão proibida estiver concluída, para o script
        const forbiddenMission = missions.find(m => m.progressable_id === STOP_ON_QUEST_ID);
        if (forbiddenMission) {
            console.log("⚠️ Missão proibida detectada (CastPowerQuest). Parando o script sem aceitar.");
            missionStopped = true;
            return;
        }

        for (let mission of missions) {
            if (mission.progressable_id === STOP_ON_QUEST_ID) continue; // NUNCA aceitar a missão proibida

            let { rewards } = mission.static_data;
            for (let reward of rewards) {
                let { type, data } = reward;
                if (type === "resources") {
                    if (data.wood + wood + margin > storage) continue;
                    if (data.iron + iron + margin > storage) continue;
                    if (data.stone + stone + margin > storage) continue;
                    claim_reward(mission);
                    console.log("✅ Aceita missão de recursos:", mission);
                    return;
                }
                if (type === "units" || type === "favor") {
                    claim_reward(mission);
                    console.log("✅ Aceita missão de unidades/favor:", mission);
                    return;
                }
                if (type === "power") {
                    let { power_id } = reward;
                    if (power_id === "population_boost" || power_id === "coins_of_wisdom") {
                        claim_reward(mission);
                        console.log("✅ Aceita missão de poder:", mission);
                        return;
                    }
                }
            }
        }
    }

    // Esperar o jogo carregar antes de rodar o script
    const waitForGame = setInterval(() => {
        if (typeof uw.ITowns !== 'undefined' && uw.ITowns.getCurrentTown) {
            clearInterval(waitForGame);
            setInterval(main, 5000);
        }
    }, 1000);
})();
