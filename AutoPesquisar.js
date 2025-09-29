// ==UserScript==
// @name         AutoPesquisar (corrigido)
// @author       Leyarl
// @description  Automatize the basic actions
// @version      2.0.1
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// ==/UserScript==

(async function () {
    'use strict';

    const uw = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    if (!uw.location.pathname.includes("game")) return;

    const STORAGE_KEY = (uw.Game?.world_id || "world") + "_RESEARCHES";
    let currentResearchIndex = 0;
    let currentAcademyWindow = null;
    let academyObserver = null;
    let usedForMultiAccounting = true;

    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    await sleep(3000);

    /* ---------- HELPERS P/ JANELAS (corrigem wnd.getType is not a function) ---------- */

    function getWndHandler(anyWnd) {
        if (!anyWnd) return null;

        // Já é um handler?
        if (typeof anyWnd.getID === 'function') return anyWnd;

        // Veio como { wnd: handler }
        if (anyWnd.wnd && typeof anyWnd.wnd.getID === 'function') return anyWnd.wnd;

        // Veio como id numérico
        if (typeof anyWnd === 'number') return uw.GPWindowMgr?.getWindowById?.(anyWnd) || null;

        // Veio como { id } ou { wnd_id } ou aninhado
        const id = anyWnd.wnd_id ?? anyWnd.id ?? (anyWnd.wnd && anyWnd.wnd.id);
        if (id != null) return uw.GPWindowMgr?.getWindowById?.(parseInt(id, 10)) || null;

        return null;
    }

    function wndTypeOf(anyWnd) {
        const wnd = getWndHandler(anyWnd);
        if (!wnd) return null;
        if (typeof wnd.getType === 'function') return wnd.getType();
        try { return wnd.getHandler?.().getType?.() ?? null; } catch { return null; }
    }

    function getWindowByTypeSafe(type) {
        // Tenta WM
        try {
            const list = uw.WM?.getWindowByType?.(type) || [];
            if (Array.isArray(list) && list.length) return list[0];
        } catch {}
        // Fallback GPWindowMgr
        try {
            const all = uw.GPWindowMgr?.getOpenWindows?.() || [];
            for (const w of all) {
                if (wndTypeOf(w) === type) return getWndHandler(w);
            }
        } catch {}
        return null;
    }

    /* ------------------------------------------------------------------------------- */

    function getConquestMode(research) {
        try {
            const css = uw.GameDataResearches.getResearchCssClass(research);
            return css === 'take_over_old' ? 'cerco' : 'revolta';
        } catch (e) {
            return 'desconhecido';
        }
    }

    console.log("Grepolis Academy Planner v0.1.5 ativo (com patch de janela + guards de town).");

    if (usedForMultiAccounting) {
        const predefinedResearches = [
            "slinger", "town_guard", "booty_bpv", "architecture", "shipwright", "building_crane",
            "colonize_ship", "pottery",
        ];

        const allTowns = uw.ITowns?.towns || {};
        let citiesUpdated = 0;

        $.each(allTowns, function (id, town) {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            const existingResearches = all[id] || [];

            if (existingResearches.length === 0) {
                all[id] = [...predefinedResearches];
                localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
                citiesUpdated++;
            }
        });
    }

    $("head").append(`
        <style>
            .GAP_highlight_inactive::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 255, 0, 0.5);
            }
            .GAP_highlight_active {
                border: 1px solid rgba(0, 255, 0, 1);
            }
        </style>
    `);

    /* ------- OBSERVERS (usando normalização de janela) ------- */

    $.Observer(uw.GameEvents.game.load).subscribe("GAP_load", attachAjaxListener);

    $.Observer(uw.GameEvents.window.open).subscribe("GAP_window_open", (e, raw) => {
        const wnd = getWndHandler(raw);
        if (!wnd) return;

        const hasCid = wnd.cid || typeof wnd.getIdentifier === 'function';
        if (!hasCid) return;

        if (wndTypeOf(wnd) === "academy") {
            currentAcademyWindow = wnd;
            openAcademy(wnd);
        }
    });

    $.Observer(uw.GameEvents.town.town_switch).subscribe("GAP_town_switch", resetAcademy);

    $.Observer(uw.GameEvents.window.close).subscribe("GAP_window_close", (e, raw) => {
        const wnd = getWndHandler(raw);
        if (!wnd) return;

        if (wndTypeOf(wnd) === "academy") {
            currentAcademyWindow = null;
            if (academyObserver) {
                academyObserver.disconnect();
                academyObserver = null;
            }
        }
    });

    $.Observer(uw.GameEvents.game.load).subscribe("GAP_ajax_listener", function () {
        $(document).ajaxComplete(function (e, xhr, opt) {
            let urlParts = opt.url.split("?");
            let action = urlParts[0].substr(5);
            if (!urlParts[1]) return;

            const params = new URLSearchParams(urlParts[1]);
            const fbType = params.get("window_type");

            switch (action) {
                case "frontend_bridge/fetch":
                case "notify/fetch":
                    if (fbType === "academy" || currentAcademyWindow) {
                        const wnd = currentAcademyWindow || getWindowByTypeSafe("academy");
                        if (wnd) {
                            setTimeout(() => openAcademy(wnd), 100);
                        }
                    }
                    break;
            }
        });
    });

    /* roda a cada 60s tentando pesquisar conforme lista salva por cidade */
    setInterval(() => {
        let all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        let changed = false;

        for (const [townIdStr, researches] of Object.entries(all)) {
            if (!Array.isArray(researches) || researches.length === 0) continue;

            const townId = parseInt(townIdStr, 10);
            // se a cidade não existe mais, remova do storage
            if (!uw.ITowns.getTown(townId)) {
                delete all[townIdStr];
                changed = true;
                continue;
            }

            const index = currentResearchIndex % researches.length;
            const research = researches[index];
            tryAutoResearch(research, townId);
        }

        if (changed) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        }
        currentResearchIndex++;
    }, 60000);

    function attachAjaxListener() {
        $(document).ajaxComplete((e, xhr, opt) => {
            const qs = opt.url.split("?")[1];
            if (!qs) return;
            const url = new URL("https://dummy/?" + qs);
            const action = opt.url.split("?")[0].substr(5);
            if (action === "frontend_bridge/fetch" && url.searchParams.get("window_type") === "academy") {
                const wnd = getWindowByTypeSafe("academy");
                if (wnd) {
                    currentAcademyWindow = wnd;
                    setTimeout(() => openAcademy(wnd), 100);
                }
            }
        });
    }

    function getTownId() {
        return uw.Game?.townId;
    }

    function loadResearches() {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        return all[getTownId()] || [];
    }

    function saveResearches(researches) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        all[getTownId()] = researches;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }

    function toggleResearch(research, element, isInactive) {
        let researches = loadResearches();
        const index = researches.indexOf(research);

        if (index >= 0) {
            researches.splice(index, 1);
            removeClass(element);
        } else {
            researches.push(research);
            if (isInactive) addClassInactive(element);
            else addClassActive(element);
            tryAutoResearch(research);
        }

        saveResearches(researches);
    }

    // ---- FUNÇÃO CORRIGIDA ----
    function tryAutoResearch(research, townOverride = null) {
        const townId = townOverride || getTownId();
        if (!townId && townId !== 0) return;

        const town = uw.ITowns.getTown(townId);

        // town pode não existir (cidade deletada/oculta/fora do contexto)
        if (!town) {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            if (all[townId]) {
                delete all[townId];
                localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
            }
            return;
        }

        // APIs mais estáveis
        const buildings = typeof town.getBuildings === 'function' ? town.getBuildings() : null;
        const researchesColl = typeof town.getResearches === 'function' ? town.getResearches() : null;

        if (!buildings || !researchesColl || !research) return; // ainda carregando ou pesquisa inválida

        const academyLevel = buildings.getBuildingLevel('academy');
        if (!academyLevel) return;

        const techs = researchesColl.attributes || {};
        const researchesQueue = uw.MM.getFirstTownAgnosticCollectionByName("ResearchOrder")?.fragments?.[townId]?.models || [];
        const queueLimit = uw.GameDataPremium?.isAdvisorActivated?.('curator') ? 7 : 2;

        // já na fila?
        if (researchesQueue.some(m => m?.attributes?.research_type === research)) return;
        if (researchesQueue.length >= queueLimit) return;

        // normalizações antigas
        if (research.endsWith("_old")) research = research.slice(0, -4);
        if (research.endsWith("_bpv")) research = research.slice(0, -4);

        // já pesquisada?
        if (techs[research]) {
            let list = loadResearches();
            const i = list.indexOf(research);
            if (i >= 0) {
                list.splice(i, 1);
                saveResearches(list);
            }
            // tira o highlight se a janela estiver aberta
            if (currentAcademyWindow) {
                const selector = "#window_" + currentAcademyWindow.getIdentifier();
                const el = $(selector).find(`.research.${research}`)[0];
                if (el) removeClass(el);
            }
            return;
        }

        const reqsTech = uw.GameData?.researches?.[research];

        // Verificar se a pesquisa existe no GameData
        if (!reqsTech) {
            console.warn(`Pesquisa "${research}" não encontrada no GameData. Removendo da lista.`);
            let list = loadResearches();
            const i = list.indexOf(research);
            if (i >= 0) {
                list.splice(i, 1);
                saveResearches(list);
            }
            return;
        }

        // Pontos de pesquisa disponíveis
        const perLevel = uw.GameDataResearches?.getResearchPointsPerAcademyLevel?.() ?? 4; // fallback
        let availablePoints = academyLevel * perLevel;
        $.each(uw.GameData.researches, function (ind) {
            if (researchesColl.get(ind)) {
                availablePoints -= uw.GameData.researches[ind].research_points;
            }
        });
        availablePoints = Math.max(0, availablePoints);

        // Recursos atuais da cidade
        const res = typeof town.resources === 'function' ? town.resources() : { wood: 0, stone: 0, iron: 0 };
        const { wood = 0, stone = 0, iron = 0 } = res;

        // Checar requisitos mínimos
        if (
            !reqsTech.building_dependencies || !reqsTech.resources ||
            academyLevel < (reqsTech.building_dependencies.academy || 0) ||
            availablePoints < (reqsTech.research_points || 0) ||
            wood < (reqsTech.resources.wood || 0) ||
            stone < (reqsTech.resources.stone || 0) ||
            iron < (reqsTech.resources.iron || 0)
        ) {
            return;
        }

        const data = {
            model_url: "ResearchOrder",
            action_name: "research",
            captcha: null,
            arguments: { id: research },
            town_id: townId,
            nl_init: true
        };

        uw.gpAjax.ajaxPost("frontend_bridge", "execute", data, false, (resp) => {
            if (resp && typeof resp.success === 'string' && resp.success.includes("começou")) {
                let list = loadResearches();
                const i = list.indexOf(research);
                if (i >= 0) {
                    list.splice(i, 1);
                    saveResearches(list);
                }
            }
        });
    }
    // ---- FIM DA FUNÇÃO CORRIGIDA ----

    function openAcademy(wnd) {
        const selector = "#window_" + wnd.getIdentifier();
        let retries = 0;

        function tryRender() {
            const techTree = $(selector).find(".tech_tree_box");
            if (techTree.length === 0) {
                if (retries++ < 15) return setTimeout(tryRender, 200);
                return;
            }

            const saved = loadResearches();

            techTree.find("div.research").each((_, el) => {
                removeClass(el);
            });

            techTree.find("div.research").each((_, el) => {
                const $el = $(el);
                const classes = ($el.attr("class") || "").split(/\s+/);
                // .research.<nome> ... normalmente a 2ª ou 3ª classe
                const research = classes.find(c => c !== 'research' && !c.startsWith('type_')) || classes[2];
                const isInactive = $el.hasClass("inactive");

                $el.off("click.GAP").on("click.GAP", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleResearch(research, el, isInactive);
                });

                if (saved.includes(research)) {
                    if (isInactive) addClassInactive(el);
                    else addClassActive(el);
                }
            });

            setupAcademyObserver(selector);
        }

        tryRender();
    }

    function setupAcademyObserver(selector) {
        if (academyObserver) academyObserver.disconnect();

        const windowElement = $(selector)[0];
        if (!windowElement) return;

        academyObserver = new MutationObserver((mutations) => {
            let shouldReapply = false;

            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    const addedNodes = Array.from(mutation.addedNodes);
                    const removedNodes = Array.from(mutation.removedNodes);

                    const techTreeChanged = [...addedNodes, ...removedNodes].some(node => {
                        if (node.nodeType === 1) {
                            return node.matches && (
                                node.matches('.tech_tree_box') ||
                                (node.querySelector && node.querySelector('.tech_tree_box')) ||
                                node.matches('.research') ||
                                (node.querySelector && node.querySelector('.research'))
                            );
                        }
                        return false;
                    });

                    if (techTreeChanged) shouldReapply = true;
                }

                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.matches && (
                        target.matches('.tab_research') ||
                        target.matches('.tab_research_queue') ||
                        target.classList.contains('active')
                    )) {
                        shouldReapply = true;
                    }
                }
            });

            if (shouldReapply && currentAcademyWindow) {
                setTimeout(() => {
                    if (currentAcademyWindow && $(selector).length > 0) {
                        openAcademy(currentAcademyWindow);
                    }
                }, 150);
            }
        });

        academyObserver.observe(windowElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function resetAcademy() {
        if (currentAcademyWindow) {
            const selector = "#window_" + currentAcademyWindow.getIdentifier();
            $(selector).find(".tech_tree_box .research").each((_, el) => {
                removeClass(el);
            });
            setTimeout(() => openAcademy(currentAcademyWindow), 100);
        }
    }

    function addClassInactive(el) { $(el).addClass("GAP_highlight_inactive"); }
    function addClassActive(el)   { $(el).addClass("GAP_highlight_active"); }
    function removeClass(el)      { $(el).removeClass("GAP_highlight_inactive GAP_highlight_active"); }
})();
