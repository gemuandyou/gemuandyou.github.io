/* controller.js
 * license: NCSA
 * copyright: Senko's Pub
 * website: https://www.guilded.gg/senkospub
 * authors:
 * - Senko-san (Merijn Hendriks)
 * - BALIST0N
 * - Emperor06
 */

"use strict";

class Controller
{

    // 自定义随机价格的倍数
    customPriceMultiplier = 2.8;
    // 物品价格最大持续时间。单位是小时
    offerMaxTime = 0.5;
    // 购买的基础数量。若不限制，这里值改为-1就行了；
    offerCount = 10;


    offerCache = {};
    isBullet = false;

    initialize()
    {
        // initialize base offer expire date (1 week after server start)
        const time = common_f.time.getTimestamp();

        database_f.server.tables.ragfair.offer.startTime = time;
        database_f.server.tables.ragfair.offer.endTime = time + 3600;

        // get all trader offers
        database_f.server.tables.ragfair.offers = {
            "categories": {},
            "offers": [],
            "offersCount": 100,
            "selectedCategory": "5b5f78dc86f77409407a7f8e"
        };

        for (const traderID in database_f.server.tables.traders)
        {
            this.addTraderAssort(traderID);
        }
    }

    addTraderAssort(traderID)
    {
        let base = database_f.server.tables.ragfair.offers;

        // skip ragfair and fence trader
        if (traderID === "ragfair" || traderID === "579dc571d53a0658a154fbec")
        {
            return;
        }

        const assort = database_f.server.tables.traders[traderID].assort;

        for (const item of assort.items)
        {
            if (item.slotId !== "hideout")
            {
                // only use base items
                continue;
            }

            // items
            let items = [];

            items.push(item);
            items = [...items, ...helpfunc_f.helpFunctions.findAndReturnChildrenByAssort(item._id, assort.items)];

            // barter scheme
            let barter_scheme = null;

            for (const barter in assort.barter_scheme)
            {
                if (item._id === barter)
                {
                    barter_scheme = assort.barter_scheme[barter][0];
                    break;
                }
            }

            // loyal level
            let loyal_level = 0;

            for (const loyalLevel in assort.loyal_level_items)
            {
                if (item._id === loyalLevel)
                {
                    loyal_level = assort.loyal_level_items[loyalLevel];
                    break;
                }
            }

            // add the offer
            base.offers = base.offers.concat(this.createTraderOffer(items, barter_scheme, loyal_level, traderID));
        }

        database_f.server.tables.ragfair.offers = base;
    }

    createTraderOffer(itemsToSell, barter_scheme, loyal_level, traderID, counter = 911)
    {
        const time = common_f.time.getTimestamp();

        let offerId = itemsToSell[0]._id;
        const cacheOffer = this.offerCache[offerId];
        if (cacheOffer && cacheOffer.endTime > time && cacheOffer.items[0].upd.StackObjectsCount > 0) {
            return [cacheOffer];
        }

        const trader = database_f.server.tables.traders[traderID].base;
        
        let offerBase = common_f.json.clone(database_f.server.tables.ragfair.offer);

        offerBase.startTime = time;
        offerBase.endTime = time + parseInt(Math.random() * this.offerMaxTime * 3600);

        offerBase._id = offerId;
        offerBase.intId = counter;
        offerBase.user = {
            "id": trader._id,
            "memberType": 4,
            "nickname": trader.surname,
            "rating": 1,
            "isRatingGrowing": true,
            "avatar": trader.avatar
        };
        offerBase.root = itemsToSell[0]._id;
        offerBase.items = itemsToSell;
        offerBase.requirements = barter_scheme;
        offerBase.loyaltyLevel = loyal_level;

        this.offerCache[offerBase._id] = offerBase;

        return [offerBase];
    }

    createOffer(template, onlyFunc, usePresets = true)
    {
        // Some slot filters reference bad items
        if (!(template in database_f.server.tables.templates.items))
        {
            common_f.logger.logWarning("Item " + template + " does not exist");
            return [];
        }

        let offerBase = common_f.json.clone(database_f.server.tables.ragfair.offer);
        const time = common_f.time.getTimestamp();
        offerBase.startTime = time;
        offerBase.endTime = time + parseInt(Math.random() * this.offerMaxTime * 3600);

        let offers = [];

        // Preset
        if (usePresets && preset_f.controller.hasPreset(template))
        {
            let presets = common_f.json.clone(preset_f.controller.getPresets(template));

            for (let p of presets)
            {

                let multiple = ragfair_f.config.priceMultiplier * Math.random() * this.customPriceMultiplier;

                let offerId = p._id;
                const cacheOffer = this.offerCache[offerId];
                if (cacheOffer && cacheOffer.endTime > time && cacheOffer.items[0].upd.StackObjectsCount > 0) {
                    offers.push(cacheOffer);
                } else {
                    let offer = common_f.json.clone(offerBase);
                    let mods = p._items;
                    let rub = 0;
    
                    for (let it of mods)
                    {
                        rub += helpfunc_f.helpFunctions.getTemplatePrice(it._tpl);
                    }
    
                    mods[0].upd = mods[0].upd || {}; // append the stack count
                    let stackCount = offerBase.items[0].upd.StackObjectsCount;
                    stackCount = this.offerCount < 0 ? stackCount : (this.offerCount < stackCount ? this.offerCount : stackCount);
                    mods[0].upd.StackObjectsCount = parseInt(Math.ceil(stackCount * Math.random() * multiple) / 2);
    
                    offer._id = p._id;               // The offer's id is now the preset's id
                    offer.root = mods[0]._id;        // Sets the main part of the weapon
                    offer.items = mods;
                    // offer.requirements[0].count = Math.round(rub * ragfair_f.config.priceMultiplier);
                    offer.requirements[0].count = Math.round(rub * multiple);

                    this.offerCache[offerId] = offer;
                    offers.push(offer);
                }
            }
        }

        // Single item
        if (!preset_f.controller.hasPreset(template) || !onlyFunc)
        {
            let multiple = ragfair_f.config.priceMultiplier * Math.random() * this.customPriceMultiplier;

            let offerId = template;
            const cacheOffer = this.offerCache[offerId];
            if (cacheOffer && cacheOffer.endTime > time && cacheOffer.items[0].upd.StackObjectsCount > 0) {
                offers.push(cacheOffer);
            } else {
                // let rubPrice = Math.round(helpfunc_f.helpFunctions.getTemplatePrice(template) * ragfair_f.config.priceMultiplier);
                let rubPrice = Math.round(helpfunc_f.helpFunctions.getTemplatePrice(template) * multiple);
                offerBase._id = template;
                offerBase.items[0]._tpl = template;
                offerBase.requirements[0].count = rubPrice;
                offerBase.itemsCost = rubPrice;
                offerBase.requirementsCost = rubPrice;
                offerBase.summaryCost = rubPrice;
                
                let stackCount = offerBase.items[0].upd.StackObjectsCount;
                stackCount = this.offerCount < 0 ? stackCount : (this.offerCount < stackCount ? this.offerCount : stackCount);
                offerBase.items[0].upd.StackObjectsCount = parseInt(Math.ceil(stackCount * (this.isBullet ? parseInt(Math.random() * 20) + 10 : 1) * multiple));
                
                this.offerCache[offerId] = offerBase;
                
                offers.push(offerBase);
            }
        }

        return offers;
    }

    sortOffersByID(a, b)
    {
        return a.intId - b.intId;
    }

    sortOffersByRating(a, b)
    {
        return a.user.rating - b.user.rating;
    }

    sortOffersByName(a, b)
    {
        // @TODO: Get localized item names
        try
        {
            let aa = helpfunc_f.helpFunctions.getItem(a._id)[1]._name;
            let bb = helpfunc_f.helpFunctions.getItem(b._id)[1]._name;

            aa = aa.substring(aa.indexOf("_") + 1);
            bb = bb.substring(bb.indexOf("_") + 1);

            return aa.localeCompare(bb);
        }
        catch (e)
        {
            return 0;
        }
    }

    sortOffersByPrice(a, b)
    {
        return a.requirements[0].count - b.requirements[0].count;
    }

    sortOffersByPriceSummaryCost(a, b)
    {
        return a.summaryCost - b.summaryCost;
    }

    sortOffersByExpiry(a, b)
    {
        return a.endTime - b.endTime;
    }

    sortOffers(request, offers)
    {
        // Sort results
        switch (request.sortType)
        {
            case 0: // ID
                offers.sort(this.sortOffersByID);
                break;

            case 3: // Merchant (rating)
                offers.sort(this.sortOffersByRating);
                break;

            case 4: // Offer (title)
                offers.sort(this.sortOffersByName);
                break;

            case 5: // Price
                if (request.offerOwnerType === 1)
                {
                    offers.sort(this.sortOffersByPriceSummaryCost);
                }
                else
                {
                    offers.sort(this.sortOffersByPrice);
                }

                break;

            case 6: // Expires in
                offers.sort(this.sortOffersByExpiry);
                break;
        }

        // 0=ASC 1=DESC
        if (request.sortDirection === 1)
        {
            offers.reverse();
        }

        return offers;
    }

    getOffers(sessionID, request)
    {
        // console.log('get offer', request);
        if ("5b47574386f77428ca22b33b" == request.handbookId) {
            this.isBullet = true;
        } else {
            this.isBullet = false;
        }

        //if its traders items, just a placeholder it will be handled differently later
        if (request.offerOwnerType ===  1)
        {
            return this.getOffersFromTraders(sessionID, request);
        }

        let response = {"categories": {}, "offers": [], "offersCount": 10, "selectedCategory": "5b5f78dc86f77409407a7f8e"};

        let itemsToAdd = [];
        let offers = [];

        if (!request.linkedSearchId && !request.neededSearchId)
        {
            response.categories = (trader_f.controller.getAssort(sessionID, "ragfair")).loyal_level_items;
        }

        if (request.buildCount)
        {
            // Case: weapon builds
            itemsToAdd = itemsToAdd.concat(Object.keys(request.buildItems));
        }
        else
        {
            // Case: search
            if (request.linkedSearchId)
            {
                itemsToAdd = this.getLinkedSearchList(request.linkedSearchId);
            }
            else if (request.neededSearchId)
            {
                itemsToAdd = this.getNeededSearchList(request.neededSearchId);
            }

            // Case: category
            if (request.handbookId)
            {
                let handbook = this.getCategoryList(request.handbookId);

                if (itemsToAdd.length)
                {
                    itemsToAdd = helpfunc_f.helpFunctions.arrayIntersect(itemsToAdd, handbook);
                }
                else
                {
                    itemsToAdd = handbook;
                }
            }
        }

        for (let item of itemsToAdd)
        {
            offers = offers.concat(this.createOffer(item, request.onlyFunctional, request.buildCount === 0));
        }

        // merge trader offers with player offers display offers is set to 'ALL'
        if (request.offerOwnerType === 0)
        {
            const traderOffers = this.getOffersFromTraders(sessionID, request).offers;

            offers = [...offers, ...traderOffers];
        }

        response.offers = this.sortOffers(request, offers);
        this.countCategories(response);
        return response;
    }

    getOffersFromTraders(sessionID, request)
    {
        let jsonToReturn = database_f.server.tables.ragfair.offers;
        let offersFilters = []; //this is an array of item tpl who filter only items to show

        jsonToReturn.categories = {};

        for (let offerC of jsonToReturn.offers)
        {
            jsonToReturn.categories[offerC.items[0]._tpl] = 1;
        }

        if (request.buildCount)
        {
            // Case: weapon builds
            offersFilters = Object.keys(request.buildItems) ;
            jsonToReturn = this.fillCatagories(jsonToReturn, offersFilters);
        }
        else
        {
            // Case: search
            if (request.linkedSearchId)
            {
                offersFilters = [...offersFilters, ...this.getLinkedSearchList(request.linkedSearchId) ];
                jsonToReturn = this.fillCatagories(jsonToReturn, offersFilters);
            }
            else if (request.neededSearchId)
            {
                offersFilters = [...offersFilters, ...this.getNeededSearchList(request.neededSearchId) ];
                jsonToReturn = this.fillCatagories(jsonToReturn, offersFilters);
            }

            if (request.removeBartering === true)
            {
                jsonToReturn = this.removeBarterOffers(jsonToReturn);
                jsonToReturn = this.fillCatagories(jsonToReturn, offersFilters);
            }

            // Case: category
            if (request.handbookId)
            {
                let handbookList = this.getCategoryList(request.handbookId);

                if (offersFilters.length)
                {
                    offersFilters = helpfunc_f.helpFunctions.arrayIntersect(offersFilters, handbookList);
                }
                else
                {
                    offersFilters = handbookList;
                }
            }
        }

        let offersToKeep = [];

        for (let offer in jsonToReturn.offers)
        {
            for (let tplTokeep of offersFilters)
            {
                if (jsonToReturn.offers[offer].items[0]._tpl === tplTokeep)
                {
                    jsonToReturn.offers[offer].summaryCost = this.calculateCost(jsonToReturn.offers[offer].requirements);

                    // check if offer is really available, removes any quest locked items not in current assort of a trader
                    let tmpOffer = jsonToReturn.offers[offer];
                    let traderId = tmpOffer.user.id;
                    let items = trader_f.controller.getAssort(sessionID, traderId).items;

                    for (let item of items)
                    {
                        if (item._id === tmpOffer.root)
                        {
                            offersToKeep.push(jsonToReturn.offers[offer]);
                            break;
                        }
                    }
                }
            }
        }

        jsonToReturn.offers = offersToKeep;
        jsonToReturn.offers = this.sortOffers(request, jsonToReturn.offers);

        return jsonToReturn;
    }

    calculateCost(barter_scheme)//theorical , not tested not implemented
    {
        let summaryCost = 0;

        for (let barter of barter_scheme)
        {
            summaryCost += helpfunc_f.helpFunctions.getTemplatePrice(barter._tpl) * barter.count;
        }

        return Math.round(summaryCost);
    }

    fillCatagories(response, filters)
    {
        response.categories = {};

        for (let filter of filters)
        {
            response.categories[filter] = 1;
        }

        return response;
    }

    getCategoryList(handbookId)
    {
        let result = [];

        // if its "mods" great-parent category, do double recursive loop
        if (handbookId === "5b5f71a686f77447ed5636ab")
        {
            for (let categ2 of helpfunc_f.helpFunctions.childrenCategories(handbookId))
            {
                for (let categ3 of helpfunc_f.helpFunctions.childrenCategories(categ2))
                {
                    result = result.concat(helpfunc_f.helpFunctions.templatesWithParent(categ3));
                }
            }
        }
        else
        {
            if (helpfunc_f.helpFunctions.isCategory(handbookId))
            {
                // list all item of the category
                result = result.concat(helpfunc_f.helpFunctions.templatesWithParent(handbookId));

                for (let categ of helpfunc_f.helpFunctions.childrenCategories(handbookId))
                {
                    result = result.concat(helpfunc_f.helpFunctions.templatesWithParent(categ));
                }
            }
            else
            {
                // its a specific item searched then
                result.push(handbookId);
            }
        }

        return result;
    }

    removeBarterOffers(response)
    {
        let override = [];

        for (const offer of response.offers)
        {
            if (helpfunc_f.helpFunctions.isMoneyTpl(offer.requirements[0]._tpl) === true)
            {
                override.push(offer);
            }
        }

        response.offers = override;
        return response;
    }

    getNeededSearchList(neededSearchId)
    {
        let result = [];

        for (let item of Object.values(database_f.server.tables.templates.items))
        {
            if (this.isInFilter(neededSearchId, item, "Slots")
            || this.isInFilter(neededSearchId, item, "Chambers")
            || this.isInFilter(neededSearchId, item, "Cartridges"))
            {
                result.push(item._id);
            }
        }

        return result;
    }

    getLinkedSearchList(linkedSearchId)
    {
        let item = database_f.server.tables.templates.items[linkedSearchId];

        // merging all possible filters without duplicates
        let result = new Set([
            ...this.getFilters(item, "Slots"),
            ...this.getFilters(item, "Chambers"),
            ...this.getFilters(item, "Cartridges")
        ]);

        return Array.from(result);
    }

    /* Because of presets, categories are not always 1 */
    countCategories(response)
    {
        let categ = {};

        for (let offer of response.offers)
        {
            let item = offer.items[0]; // only the first item can have presets

            categ[item._tpl] = categ[item._tpl] || 0;
            categ[item._tpl]++;
        }

        // not in search mode, add back non-weapon items
        for (let c in response.categories)
        {
            if (!categ[c])
            {
                categ[c] = 1;
            }
        }

        response.categories = categ;
    }

    /* Like getFilters but breaks early and return true if id is found in filters */
    isInFilter(id, item, slot)
    {
        if (slot in item._props && item._props[slot].length)
        {
            for (let sub of item._props[slot])
            {
                if ("_props" in sub && "filters" in sub._props)
                {
                    for (let filter of sub._props.filters)
                    {
                        if (filter.Filter.includes(id))
                        {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    /* Scans a given slot type for filters and returns them as a Set */
    getFilters(item, slot)
    {
        let result = new Set();
        if (slot in item._props && item._props[slot].length)
        {
            for (let sub of item._props[slot])
            {
                if ("_props" in sub && "filters" in sub._props)
                {
                    for (let filter of sub._props.filters)
                    {
                        for (let f of filter.Filter)
                        {
                            result.add(f);
                        }
                    }
                }
            }
        }

        return result;
    }
}

module.exports.Controller = Controller;
