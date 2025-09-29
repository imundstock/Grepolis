// ==UserScript==
// @name         Compra de Gold
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Compra automática de recursos com visual estilo Grepolis, integrado com botões e minimização/ativação visual moderna.
// @author       Alexandre
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
    var uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    var isScriptRunning = false;
    var requestInterval;
    var selectedResourceType = "";
    var interfaceMinimizada = true;

    const timer = (ms) => new Promise((res) => setTimeout(res, ms));

    function loadInterface() {
        const container = document.createElement("div");
        container.id = "compra-recursos-ui";
        container.style.position = "fixed";
        container.style.top = "55px";
        container.style.right = "710px"; // à esquerda dos outros
        container.style.background = "#f4e4bc";
        container.style.border = "2px solid #be8d4f";
        container.style.padding = "0px";
        container.style.zIndex = "9999";
        container.style.fontSize = "12px";
        container.style.width = "180px";
        container.style.boxShadow = "2px 2px 10px rgba(0,0,0,0.8)";
        container.style.borderRadius = "5px";
        container.style.fontFamily = "Verdana, sans-serif";

        container.innerHTML = `
            <div id="headerCompraRecursos" style="background:#c4a27a; padding:8px; text-align:center; font-weight:bold; border-bottom:2px solid #be8d4f; color:#2d1b0b; border-radius:5px 5px 0 0; cursor: pointer;">
                Compra de Recursos
            </div>
            <div id="conteudoCompraRecursos" style="padding:10px; display: none; text-align: center;">
                <div id="botoesRecursos" style="margin-bottom:10px;">
                    <div class="botaoRecurso" data-type="wood" style="display:inline-block; width:30px; height:30px; margin:0 5px; background-image:url('https://wiki.pt.grepolis.com/images/d/df/Wood.png'); background-size:cover; border:2px solid black; border-radius:50%; cursor:pointer;"></div>
                    <div class="botaoRecurso" data-type="stone" style="display:inline-block; width:30px; height:30px; margin:0 5px; background-image:url('https://wiki.pt.grepolis.com/images/d/d4/Stone.png'); background-size:cover; border:2px solid black; border-radius:50%; cursor:pointer;"></div>
                    <div class="botaoRecurso" data-type="iron" style="display:inline-block; width:30px; height:30px; margin:0 5px; background-image:url('https://wiki.pt.grepolis.com/images/4/45/Iron.png'); background-size:cover; border:2px solid black; border-radius:50%; cursor:pointer;"></div>
                </div>
                <button id="ativarCompra" style="width:100%; background:#dac29a; border:1px solid #8c6a43; color:#2d1b0b; padding:5px; font-weight:bold; cursor:pointer;">Iniciar Compra</button>
            </div>
        `;

        document.body.appendChild(container);

        // Minimizar interface
        const header = document.getElementById("headerCompraRecursos");
        header.addEventListener("click", () => {
            interfaceMinimizada = !interfaceMinimizada;
            document.getElementById("conteudoCompraRecursos").style.display = interfaceMinimizada ? "none" : "block";
        });

        // Tornar arrastável
        let isDragging = false;
        let offsetX = 0, offsetY = 0;
        header.addEventListener("mousedown", function (e) {
            isDragging = true;
            offsetX = e.clientX - container.offsetLeft;
            offsetY = e.clientY - container.offsetTop;
            document.body.style.userSelect = "none";
        });
        document.addEventListener("mousemove", function (e) {
            if (isDragging) {
                container.style.left = `${e.clientX - offsetX}px`;
                container.style.top = `${e.clientY - offsetY}px`;
            }
        });
        document.addEventListener("mouseup", function () {
            isDragging = false;
            document.body.style.userSelect = "";
        });

        // Botões de seleção
        document.querySelectorAll(".botaoRecurso").forEach(btn => {
            btn.addEventListener("click", () => {
                selectedResourceType = btn.getAttribute("data-type");
                document.querySelectorAll(".botaoRecurso").forEach(b => b.style.border = "2px solid black");
                btn.style.border = "2px solid green";
            });
        });

        // Botão ativar
        document.getElementById("ativarCompra").addEventListener("click", () => {
            if (!selectedResourceType) {
                alert("Selecione um recurso para comprar.");
                return;
            }
            if (isScriptRunning) {
                stopScript();
                updateBotao(false);
            } else {
                startScript(selectedResourceType);
                updateBotao(true);
            }
        });
    }

    function updateBotao(ativo) {
        const btn = document.getElementById("ativarCompra");
        const header = document.getElementById("headerCompraRecursos");
        if (ativo) {
            btn.textContent = "Parar Compra";
            btn.style.background = "#28a745";
            header.style.background = "#28a745";
        } else {
            btn.textContent = "Iniciar Compra";
            btn.style.background = "#dac29a";
            header.style.background = "#c4a27a";
            document.querySelectorAll(".botaoRecurso").forEach(b => b.style.border = "2px solid black");
        }
    }

    function startScript(resourceType) {
        isScriptRunning = true;

        $(document).ajaxSuccess(function(event, xhr, options) {
            if (options.url.includes('frontend_bridge') && options.data.includes('requestOffer')) {
                const response = JSON.parse(xhr.responseText);
                if (response && response.json && response.json.result === "success") {
                    const mac = response.json.mac;
                    const gold = response.json.offer.gold;
                    const resourceAmount = response.json.offer.resource_amount;
                    confirmOffer(mac, gold, resourceAmount, resourceType);
                }
            }
        });

        async function requestOffer(resourceType) {
            const gold = 25;
            let x;
            switch(resourceType) {
                case 'wood': x = Math.round(gold / 0.0148); break;
                case 'stone': x = Math.round(gold / 0.0165); break;
                case 'iron': x = Math.round(gold / 0.0153); break;
                default: x = 0; break;
            }

            const data = {
                model_url: "PremiumExchange",
                action_name: "requestOffer",
                arguments: {
                    type: "buy",
                    gold: gold,
                    [resourceType]: x
                },
                nl_init: true
            };

            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data);
        }

        async function confirmOffer(mac, gold, resourceAmount, resourceType) {
            const data = {
                model_url: "PremiumExchange",
                action_name: "confirmOffer",
                arguments: {
                    type: "buy",
                    gold: gold,
                    mac: mac,
                    offer_source: "main",
                    [resourceType]: resourceAmount
                },
                nl_init: true
            };

            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data);
        }

        requestInterval = setInterval(() => requestOffer(resourceType), 1000);
    }

    function stopScript() {
        isScriptRunning = false;
        clearInterval(requestInterval);
    }

    $.Observer(uw.GameEvents.game.load).subscribe(() => {
        setTimeout(loadInterface, 1000);
    });
})();
