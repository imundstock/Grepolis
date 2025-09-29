// ==UserScript==
// @name         AutoBuilderMulti
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

var uw;
if (typeof unsafeWindow == 'undefined') uw = window;
else uw = unsafeWindow;

const isCuratorEnabled = Game.premium_features.curator > Date.now() / 1000;
const blackList = [];

// default: const buildingTownGroupName = "Todos";
// default: let buildingTownGroupId = 0;

const buildingTownGroupName = 'Todos';
let buildingTownGroupId = 0;

const maxTimeBetweenRuns = 1000 * 60 * 10;
const minTimeBetweenRuns = 1000 * 60 * 5;
const timeBetweenRunsDifference = maxTimeBetweenRuns - minTimeBetweenRuns;

const maxTimeBetweenBuildings = 5000;
const minTimeBetweenBuildings = 1000;
const timeBetweenBuildingsDifference = maxTimeBetweenBuildings - minTimeBetweenBuildings;

  const instructions = [
    { lumber: 1, stoner: 1, ironer: 1, temple: 1, farm: 2 },
    { lumber: 2, storage: 2, main: 2, farm: 3, barracks: 1 },
    { stoner: 2, ironer: 2 },
    { lumber: 3, stoner: 3, ironer: 3, temple: 3 },
    { storage: 5, main: 5, farm: 6 },
    { market: 5, barracks: 5 },
    { stoner: 7, lumber: 7, ironer: 7 },
    { main: 8},
    { academy: 7 },
    { academy: 13 },
    { main: 14, barracks: 5, farm: 11, storage: 13 },
    { stoner: 10, lumber: 15, ironer: 10 },
    { docks: 10 },
  ];

const compareResources = (resources, resources2) => {
	return (
		(resources.wood + resources.iron + resources.stone) >=
		(resources2.wood + resources2.iron + resources2.stone)
	);
};

const hasEnoughtResources = (town, resourcesNeeded) => {
	const resources = ITowns.towns[town].resources();
	if (resources.wood < resourcesNeeded.wood) return false;
	if (resources.iron < resourcesNeeded.iron) return false;
	if (resources.stone < resourcesNeeded.stone) return false;
	return true;
};

const isBlackListed = (name, level, town) => {
	return !!blackList.find(element => (
		element.name === name &&
		element.level === level &&
		element.town === town
	));
};

const townShouldBuild = (name, level, town, buildingData) => {
	return (
		!isBlackListed(name, buildingData.next_level, town) &&
		hasEnoughtResources(town, buildingData.resources_for) &&
		buildingData.level < level
	);
};

const findBuildingOrder = (targets, buildingData, townID) => {
	return Object.entries(targets).reduce((order, [name, level]) => {
		const data = buildingData[name];
		return (
			townShouldBuild(name, level, townID, data) &&
			(
				!order ||
				compareResources(buildingData[order.name].resources_for, data.resources_for)
			)
		) ? {
		    name: name,
		    level: data.next_level,
		    town: townID
		} : order;
	}, null);
};

const findBuildingsTargets = buildingData => {
	return instructions.find(targets => {
		return !!Object.entries(targets).find(([name, level]) => {
			return buildingData[name].level < level;
		});
	});
};

const getOrders = () => {
	const models = Object.values(MM.getModels().BuildingBuildData || {});
	return models.reduce((orders, {attributes}) => {
		const townID = attributes.id;
		const buildingData = attributes.building_data;

		if (
			attributes.is_building_order_queue_full ||
			(isCuratorEnabled && !ITowns.town_group_towns.hasTown(buildingTownGroupId, townID))
		) return orders;

		const buildingsTargets = findBuildingsTargets(buildingData);
		console.log(ITowns.towns[townID].name, buildingsTargets);
		if (!buildingsTargets) return orders;

		const order = findBuildingOrder(buildingsTargets, buildingData, townID);
		if (order) orders.push(order);
		return orders;
	}, []);
};

const buildOrder = async order => {
	return new Promise((resolve, reject) => {
		gpAjax.ajaxPost('frontend_bridge', 'execute', {
			model_url: 'BuildingOrder',
			action_name: 'buildUp',
			arguments: {building_id: order.name},
			town_id: order.town
		}, false, {
			success: resolve,
			error: reject
		});
	});
};

const updateTownGroup = buildingTownGroupName => {
	const buildingTownGroup = ITowns.town_groups.models.find(model => model.getName() === buildingTownGroupName);
	if (buildingTownGroup) buildingTownGroupId = buildingTownGroup.id;
};

const freeze = time => new Promise(resolve => setTimeout(resolve, time));

const build = async () => {
	const orders = getOrders();
	console.log(orders);
	if (orders.length === 0) return;
	for (const order of orders) {
		try {
			await buildOrder(order);
			console.log(`Building ${order.name} level ${order.level} in ${ITowns.towns[order.town].name}`);
		} catch(error) {
			console.log(order);
			blackList.push(order);
		}
		const delay = Math.floor(Math.random() * timeBetweenBuildingsDifference) + minTimeBetweenBuildings;
		await freeze(delay);
	}
	await build();
};

const run = async () => {
	const delay = Math.floor(Math.random() * timeBetweenRunsDifference) + minTimeBetweenRuns;
	await build();
	await freeze(delay);
	await run();
};

jQuery.Observer(GameEvents.game.load).subscribe(async () => {
	await freeze(2000);
	if (buildingTownGroupName && isCuratorEnabled) updateTownGroup(buildingTownGroupName);
	run();
});
