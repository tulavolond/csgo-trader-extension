function getMyListingIDFromElement(listingElement) {return listingElement.id.split('mylisting_')[1]}

function getMyOrderIDFromElement(orderElement) {return orderElement.id.split('mybuyorder_')[1]}

function getElementByListingID(listingID) {return document.getElementById(`mylisting_${listingID}`)}

function getElementByOrderID(orderID) {return document.getElementById(`mybuyorder_${orderID}`)}

function switchToNextPageIfEmpty(listings) {
    if (listings.querySelectorAll('.market_listing_row.market_recent_listing_row').length === 0 ) {
        document.getElementById('tabContentsMyActiveMarketListings_btn_next').click();
    }
}

function getAppIDAndItemNameFromLink(marketLink) {
    const appID = marketLink.split('listings/')[1].split('/')[0];
    const market_hash_name = marketLink.split('listings/')[1].split('/')[1];
    return {appID, market_hash_name};
}

function addListingStartingAtPricesAndTotal(sellListings) {
    let totalPrice = 0;
    let totalYouReceivePrice = 0;

    // add starting at prices and total
    sellListings.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach(listingRow => {
        // adds selection checkboxes
        const priceElement = listingRow.querySelector('.market_listing_right_cell.market_listing_my_price');
        if (priceElement !== null) {
            priceElement.insertAdjacentHTML('beforebegin', `
            <div class="market_listing_right_cell market_listing_edit_buttons">
                <input type="checkbox">
            </div>`);
        }

        const nameElement = listingRow.querySelector('.market_listing_item_name_link');
        if (nameElement !== null) {
            const marketLink = nameElement.getAttribute('href');
            const appID = getAppIDAndItemNameFromLink(marketLink).appID;
            const market_hash_name = getAppIDAndItemNameFromLink(marketLink).market_hash_name;
            const listingID = getMyListingIDFromElement(listingRow);

            const priceElement = listingRow.querySelector('.market_listing_price');
            const listedPrice = priceElement.querySelectorAll('span')[1].innerText;
            const youReceivePrice = priceElement.querySelectorAll('span')[2].innerText.split('(')[1].split(')')[0];

            totalPrice += parseInt(steamFormattedPriceToCents(listedPrice));
            totalYouReceivePrice += parseInt(steamFormattedPriceToCents(youReceivePrice));

            priceQueue.jobs.push({
                type: 'my_listing',
                listingID,
                appID,
                market_hash_name
            });

            if (!priceQueue.active) workOnPriceQueue();
        }
    });

    const listingsTotal = document.getElementById('listingsTotal');
    if (listingsTotal !== null) listingsTotal.parentNode.removeChild(listingsTotal);

    sellListings.insertAdjacentHTML('afterend',
        `<div id='listingsTotal' style="margin: -15px 0 15px;">
                   Total listed price: ${centsToSteamFormattedPrice(totalPrice)} You will receive: ${centsToSteamFormattedPrice(totalYouReceivePrice)} (on this page)
               </div>`);
}

function addStartingAtPriceInfoToPage(listingID, lowestPrice) {
    const listingRow = getElementByListingID(listingID);

    if (listingRow !== null) { // the listing might not be there for example if the page was switched, the per page listing count was changed or the listing was removed
        const priceElement = listingRow.querySelector('.market_listing_price');
        const listedPrice = priceElement.querySelectorAll('span')[1].innerText;
        const cheapest = listedPrice === lowestPrice ? 'cheapest' : 'not_cheapest';

        priceElement.insertAdjacentHTML('beforeend', `
                                    <div class="${cheapest}" title="This is the price of the lowest listing right now.">
                                        ${lowestPrice}
                                    </div>`);
    }
}

function extractHistoryEvents(result_html) {
    const tempEl = document.createElement('div');
    tempEl.innerHTML = result_html;

    const eventsToReturn = [];

    tempEl.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach((historyRow) => {
        const itemName = historyRow.querySelector('.market_listing_item_name').innerText;
        const gameName = historyRow.querySelector('.market_listing_game_name').innerText;
        const listedOn = historyRow.querySelectorAll('.market_listing_listed_date')[1].innerText.trim();
        const actedOn = historyRow.querySelectorAll('.market_listing_listed_date')[0].innerText.trim();
        const displayPrice = historyRow.querySelector('.market_listing_price').innerText.trim();
        const priceInCents = steamFormattedPriceToCents(displayPrice);
        const partnerElement = historyRow.querySelector('.market_listing_whoactedwith');
        const type = getHistoryType(historyRow);
        let partner = null;

        if (type === 'sale' || type === 'purchase') { // non-transactional (listing creation or cancellation) history events don't have partners
            const partnerName = partnerElement.querySelector('img').title;
            const partnerLink = partnerElement.querySelector('a').getAttribute('href');
            partner = {partnerName, partnerLink};
        }

        eventsToReturn.push({itemName, gameName, listedOn, actedOn, displayPrice, priceInCents, partner, type});
    });

    tempEl.remove();
    return eventsToReturn;
}

function getHistoryType(historyRow) {
    const gainOrLoss = historyRow.querySelector('.market_listing_gainorloss').innerText.trim();
    let historyType;

    switch (gainOrLoss) {
        case '+': historyType = 'purchase'; break;
        case '-': historyType = 'sale'; break;
        default: historyType = historyRow.querySelector('.market_listing_whoactedwith').innerText.trim();
    }
    return historyType;
}

function createCSV() {
    console.log(marketHistoryExport.history);
    const excludeNonTransaction = document.getElementById('excludeNonTransaction').checked;
    let csvContent = 'Item Name,Game Name,Listed On,Acted On, Display Price, Price in Cents, Type, Partner Name, Partner Link\n';

    for (let i = 0; i < marketHistoryExport.to - marketHistoryExport.from; i++) {
        const historyEvent = marketHistoryExport.history[i];
        if (!(excludeNonTransaction && historyEvent.type !== 'purchase' && historyEvent.type !== 'sale')) {
            const lineCSV = historyEvent.partner !== null
                ? `"${historyEvent.itemName}","${historyEvent.gameName}","${historyEvent.listedOn}","${historyEvent.actedOn}","${historyEvent.displayPrice}","${historyEvent.priceInCents}","${historyEvent.type}","${historyEvent.partner.partnerName}","${historyEvent.partner.partnerLink}"\n`
                : `"${historyEvent.itemName}","${historyEvent.gameName}","${historyEvent.listedOn}","${historyEvent.actedOn}","${historyEvent.displayPrice}","${historyEvent.priceInCents}","${historyEvent.type}",,,\n`;
            csvContent += lineCSV;
        }
    }

    const encodedURI = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
    const downloadButton = document.getElementById('market_history_download');
    downloadButton.setAttribute('href', encodedURI);
    downloadButton.classList.remove('hidden');
}

function workOnExport() {
    if (marketHistoryExport.inProgress) {
        const delay = marketHistoryExport.lastRequestSuccessful ? 5000 : 30000;
        getMarketHistory(marketHistoryExport.progress, 50).then(
            history => {
                marketHistoryExport.lastRequestSuccessful = true;
                marketHistoryExport.progress += 50;
                marketHistoryExport.history = marketHistoryExport.history.concat(extractHistoryEvents(history.results_html));

                const requestProgressEl = document.getElementById('requestProgress');
                requestProgressEl.innerText = (parseInt(requestProgressEl.innerText) + 1).toString();
                const timeRemainingEl = document.getElementById('timeRemaining');
                timeRemainingEl.innerText = (parseInt(timeRemainingEl.innerText) - 5).toString();

                if (marketHistoryExport.progress >= marketHistoryExport.to - marketHistoryExport.from) {
                    marketHistoryExport.inProgress = false;
                    createCSV();
                    document.getElementById('exportHelperMessage').innerText = 'Export finished, you can now download the result!';
                    document.getElementById('exportProgress').classList.add('hidden');
                }
                else setTimeout(() => { workOnExport()}, delay);
            }, (error) => {
                marketHistoryExport.lastRequestSuccessful = false;
                console.log(error)
            }
        )
    }
}

const marketHistoryExport = {
    history: [],
    from: 0,
    to: 1000000,
    progress: 0,
    inProgress: false,
    lastRequestSuccessful: true
};

logExtensionPresence();
updateLoggedInUserID();
trackEvent({
    type: 'pageview',
    action: 'marketMainPage'
});

// makes remove/cancel columns narrower
injectStyle(`
.market_listing_edit_buttons {
    width: 120px;
}`, 'editColumnWidth');

const sellListings = document.getElementById('tabContentsMyActiveMarketListingsTable');

if (sellListings !== null) {
    const tabContentRows = document.getElementById('tabContentsMyActiveMarketListingsRows');

    if (tabContentRows !== null) {
        // listens for listing changes like removal, page switching
        MutationObserver = window.MutationObserver;

        let observer = new MutationObserver((changes) => {
            if (sellListings.parentElement.style.display !== 'none') { // only execute if it's the active tab
                addListingStartingAtPricesAndTotal(sellListings);
            }
        });

        observer.observe(tabContentRows, {
            subtree: false,
            childList: true,
            attributes: false
        });
    }

    const tableHeader = sellListings.querySelector('.market_listing_table_header');
    const removeColumnHeader = tableHeader.querySelector('.market_listing_right_cell.market_listing_edit_buttons.placeholder');

    removeColumnHeader.innerText = 'REMOVE ALL';
    removeColumnHeader.setAttribute('title', 'Click here to remove all listings from this page!');
    removeColumnHeader.classList.add('clickable');

    // adds remove selected column header/button
    removeColumnHeader.insertAdjacentHTML('afterend', `
        <span id="removeSelected" class="market_listing_right_cell market_listing_edit_buttons placeholder clickable" title="Click to remove the selected listings.">
            REMOVE
        </span>`);

    document.getElementById('removeSelected').addEventListener('click', () => {
        sellListings.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach(listingRow => {
            if (listingRow.querySelector('input').checked) {
                const listingID = getMyListingIDFromElement(listingRow);
                removeListing(listingID).then(
                    result => {
                        listingRow.parentElement.removeChild(listingRow);
                        switchToNextPageIfEmpty(sellListings);
                    }
                )
            }
        });
    });

    removeColumnHeader.addEventListener('click', () => {
        sellListings.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach(listingRow => {
            const listingID = getMyListingIDFromElement(listingRow);
            removeListing(listingID).then(
                result => {
                    listingRow.parentElement.removeChild(listingRow);
                    switchToNextPageIfEmpty(sellListings);
                }
            )
        });
    });

    addListingStartingAtPricesAndTotal(sellListings);
}

// buy order related functionality, highest buy order price, cancel selected, cancel all
const orders = document.querySelectorAll('.my_listing_section.market_content_block.market_home_listing_table')[1];
if (orders !== null && orders !== undefined) {
    const orderRows = orders.querySelectorAll('.market_listing_row.market_recent_listing_row');
    let totalOrderAmount = 0;

    // add starting at prices and total
    orderRows.forEach(orderRow => {
        // adds selection checkboxes
        const priceElement = orderRow.querySelector('.market_listing_right_cell.market_listing_my_price');
        if (priceElement !== null) {
            priceElement.insertAdjacentHTML('beforebegin', `
            <div class="market_listing_right_cell market_listing_edit_buttons">
                <input type="checkbox">
            </div>`);
        }

        const nameElement = orderRow.querySelector('.market_listing_item_name_link');
        if (nameElement !== null) {
            const marketLink = nameElement.getAttribute('href');
            const appID = getAppIDAndItemNameFromLink(marketLink).appID;
            const market_hash_name = getAppIDAndItemNameFromLink(marketLink).market_hash_name;
            const orderID = getMyOrderIDFromElement(orderRow);

            const orderPrice = orderRow.querySelector('.market_listing_price').innerText;

            totalOrderAmount += parseInt(steamFormattedPriceToCents(orderPrice));

            priceQueue.jobs.push({
                type: 'my_buy_order',
                orderID,
                appID,
                market_hash_name
            });

            if (!priceQueue.active) workOnPriceQueue();
        }
    });

    orders.insertAdjacentHTML('afterend',
        `<div style="margin: -15px 0 15px;">
                   Orders placed total value: ${centsToSteamFormattedPrice(totalOrderAmount)}
               </div>`);

    const tableHeader = orders.querySelector('.market_listing_table_header');
    const cancelColumnHeader = tableHeader.querySelector('.market_listing_right_cell.market_listing_edit_buttons.placeholder');

    cancelColumnHeader.innerText = 'CANCEL ALL';
    cancelColumnHeader.setAttribute('title', 'Click here to cancel all your buy orders!');
    cancelColumnHeader.classList.add('clickable');

    // adds cancel selected column header/button
    cancelColumnHeader.insertAdjacentHTML('afterend', `
        <span id="cancelSelected" class="market_listing_right_cell market_listing_edit_buttons placeholder clickable" title="Click to cancel the selected buy orders.">
            CANCEL
        </span>`);

    document.getElementById('cancelSelected').addEventListener('click', () => {
        orderRows.forEach(orderRow => {
            if (orderRow.querySelector('input').checked) {
                const orderID = getMyOrderIDFromElement(orderRow);
                cancelOrder(orderID).then(
                    result => {
                        orderRow.parentElement.removeChild(orderRow);
                    }
                )
            }
        });
    });

    cancelColumnHeader.addEventListener('click', () => {
        orderRows.forEach(orderRow => {
            const orderID = getMyOrderIDFromElement(orderRow);
            cancelOrder(orderID).then(
                result => {
                    orderRow.parentElement.removeChild(orderRow);
                }
            )
        });
    });
}

// market history features
const marketHistoryTab = document.getElementById('tabContentsMyMarketHistory');
if (marketHistoryTab !== null) {
    // listens for history page changes
    MutationObserver = window.MutationObserver;

    let observer = new MutationObserver((mutationRecord) => {
        if (sellListings.style.display !== 'none') { // only execute if it's the active tab
            if (mutationRecord[0].target.id === 'tabContentsMyMarketHistory' || mutationRecord[0].target.id === 'tabContentsMyMarketHistoryRows') {
                marketHistoryTab.querySelectorAll('.market_listing_row.market_recent_listing_row').forEach(historyRow => {
                    const historyType = getHistoryType(historyRow);
                    historyRow.classList.add(historyType);
                })
            }
        }
    });

    observer.observe(marketHistoryTab, {
        subtree: true,
        childList: true,
        attributes: false
    });
}

// market history export
const marketHistoryButton = document.getElementById('tabMyMarketHistory');
const myListingsButton = document.getElementById('tabMyListings');

if (marketHistoryButton !== null) {
    // inserts export tab button
    marketHistoryButton.insertAdjacentHTML('afterend', `
        <a id="tabMyMarketHistoryExport" class="market_tab_well_tab market_tab_well_tab_inactive" href="#">
            <span class="market_tab_well_tab_contents">Export Market History</span>
        </a>
    `);

    // inserts export tab content
    document.getElementById('myListings').insertAdjacentHTML('beforeend', `
        <div id="tabContentsMyMarketHistoryExport" class="my_listing_section market_content_block" style="display: none;">
            <h1 class="historyExportTitle">Export Market History (<span class="numberOfHistoryEvents">0</span> history events)</h1> 
            <p>
                Exporting your market history can be great if you want to analyse it in a spreadsheet for example.
                A history event is either one of these four actions: a purchase, a sale, a listing creation or a listing cancellation.
                The result is a .csv file that you can open in Microsoft Excel or use programmatically.
                It is in utf-8 charset, if you see weird characters in your Excel you should try
                <a href="https://www.itg.ias.edu/content/how-import-csv-file-uses-utf-8-character-encoding-0" target="_blank">importing it as such</a>.
            </p>
            <p>
                The item names will be in the language you have set on Steam at the moment.
                Unfortunately Steam only returns day accuracy, that means you won't be able to tell at what specific time you transacted.
                You also won't be able to easily tell which year the event is from.
            </p>
            <p>
                The most recent history event is event 0, the first one is the event with the highest number
                (<span class="numberOfHistoryEvents">0</span> in your case).
                Your market history is requested in junks and might take a while if do lots of transactions.
            </p>
            <p>
                Range: Events <input type="number" min="0" max="1000000" value="0" id="exportFrom"/> to <input type="number" min="50" max="1000000" value="50" id="exportTo"/> 
                Exclude non-transaction events<input type="checkbox" id="excludeNonTransaction"/>
                <span id="exportMarketHistory" class="clickable underline"> Start history export!</span>
            </p>
            <div>
                <span id="exportHelperMessage"></span> 
                <span id="exportProgress" class="hidden">
                    Request <span id="requestProgress">0</span>/<span id="numberOfRequests">0</span> Estimated time remaining: <span id="timeRemaining">0</span> seconds
                </span>
            </div>
            <div>
                <a class="hidden" id="market_history_download" href="" download="market_history.csv">Download market_history.csv</a> 
            </div>
        </div>    
    `);

    const marketHistoryExportButton = document.getElementById('exportMarketHistory');
    const marketHistoryExportContent = document.getElementById('tabContentsMyMarketHistoryExport');
    const marketHistoryExportTabButton = document.getElementById('tabMyMarketHistoryExport');

    // hides the export tab when one of the other tabs becomes active
    [marketHistoryButton, myListingsButton].forEach((tabButton) => {
        tabButton.addEventListener('click', () => {
            marketHistoryExportTabButton.classList.remove('market_tab_well_tab_active');
            marketHistoryExportTabButton.classList.add('market_tab_well_tab_inactive');
            marketHistoryExportContent.style.display = 'none';
        })
    });

    document.querySelectorAll('#exportFrom, #exportTo').forEach((range) => {
        range.addEventListener('change', () => {
            const fromElement = document.getElementById('exportFrom');
            const toElement = document.getElementById('exportTo');
            if (parseInt(fromElement.value) >= parseInt(toElement.value)) {
                fromElement.value = 0;
                toElement.value = toElement.getAttribute('max');
            }
        });
    });

    marketHistoryExportButton.addEventListener('click', (event) => {
        if (!marketHistoryExport.inProgress) {
            marketHistoryExport.inProgress = true;
            marketHistoryExport.history = [];

            document.getElementById('exportHelperMessage').innerText = 'Exporting market history...';
            marketHistoryExport.from = parseInt(document.getElementById('exportFrom').value);
            marketHistoryExport.to = parseInt(document.getElementById('exportTo').value);

            const numOfRequests = Math.ceil(((marketHistoryExport.to - marketHistoryExport.from) / 50));
            document.getElementById('numberOfRequests').innerText = numOfRequests.toString();
            document.getElementById('timeRemaining').innerText = (numOfRequests * 5).toString();
            document.getElementById('exportProgress').classList.remove('hidden');

            workOnExport();
        }
        else document.getElementById('exportHelperMessage').innerText = 'Exporting is already in progress!';
    });

    marketHistoryExportTabButton.addEventListener('click', () => {
        marketHistoryExportTabButton.classList.add('market_tab_well_tab_active');
        marketHistoryExportTabButton.classList.remove('market_tab_well_tab_inactive');
        marketHistoryButton.classList.remove('market_tab_well_tab_active');
        marketHistoryButton.classList.add('market_tab_well_tab_inactive');
        myListingsButton.classList.remove('market_tab_well_tab_active');
        myListingsButton.classList.add('market_tab_well_tab_inactive');

        marketHistoryExportContent.style.display = 'block';
        sellListings.parentElement.style.display = 'none';
        marketHistoryTab.style.display = 'none';

        getMarketHistory(0, 50).then(
            history => {
                document.getElementById('exportFrom').setAttribute('max', history.total_count);
                const exportToElement = document.getElementById('exportTo');
                exportToElement.setAttribute('max', history.total_count);
                exportToElement.value = history.total_count;
                document.querySelectorAll('.numberOfHistoryEvents').forEach((numberOfEvents) => {
                    numberOfEvents.innerText = history.total_count;
                });
            }
        )

    });
}

// reloads the page on extension update/reload/uninstall
chrome.runtime.connect().onDisconnect.addListener(() =>{location.reload()});