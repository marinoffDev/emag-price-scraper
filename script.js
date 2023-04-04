require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const puppeteer = require('puppeteer');
const SCRAPING_URL = process.env.SCRAPING_URL;
const URI = process.env.mongoDBString;
const CLIENT_DB = new MongoClient(URI, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const DATABASE = CLIENT_DB.db(process.env.DB_NAME);
const EMAG_PRICE_TRACKER_COLLECTION = DATABASE.collection(process.env.DB_COLLECTION);

async function connectToDb() {
    console.log('Running script...');
	await CLIENT_DB.connect();
};

async function scrapeData() {
    try {
        const BROWSER = await puppeteer.launch({headless: true});
        const PAGE = await BROWSER.newPage();
        await PAGE.goto(SCRAPING_URL);
        await PAGE.waitForSelector('body');
        // Click "SEE MORE" button until all products have loaded before proceeding.
        const ALLOWED_PRODUCTS_PER_PAGE = 25;
        const NUM_PRODUCTS_PAGE_DATA = await PAGE.$eval(`.products-number`, el => el.textContent.split(' '));
        const NUM_PRODUCTS = Number(NUM_PRODUCTS_PAGE_DATA[0]);
        if (NUM_PRODUCTS > ALLOWED_PRODUCTS_PER_PAGE) {
            for (let i = ALLOWED_PRODUCTS_PER_PAGE; i < NUM_PRODUCTS + 1; i) {
                const SEE_MORE_BUTTON = await PAGE.$('.see-more-products-btn');
                if (SEE_MORE_BUTTON) {
                    await SEE_MORE_BUTTON.evaluate(el => el.click());
                    await new Promise(r => setTimeout(r, 600));
                }
                i = i*2;
            };
        };
        const PRODUCT_ID = await PAGE.$$('.product-card-account');
        const PRODUCT_TITLE = await PAGE.$$('.product-title');
        const PRODUCT_PRICE = await PAGE.$$('p.product-new-price');
        const PRODUCT_THUMBNAILS = await PAGE.$$('#list-of-favorites > div > div > div.card-image.flex-item.flex-c > a > div > img');
        const TIMESTAMP_VALUE = new Date().toISOString();
        console.log(`Scraping data for ${PRODUCT_ID.length} products.`);
        for (let i = 0; i < PRODUCT_TITLE.length; i++) {
            const TITLE_VALUE = await PRODUCT_TITLE[i].evaluate(el => el.textContent.trim())
            const PRICE_VALUE = await PRODUCT_PRICE[i].evaluate(el => el.textContent.trim().split(','))
            const PRODUCT_ID_VALUE = await PRODUCT_ID[i].evaluate(el => el.getAttribute('data-product-id'));
            const PRODUCT_THUMBNAILS_VALUE = await PRODUCT_THUMBNAILS[i].evaluate(el => el.getAttribute('src'));
            const DB_OPTIONS = { upsert: true };
            const FILTER = { productId: PRODUCT_ID_VALUE }
            const UPDATE_DATA = {
                $set: {
                    'productId': PRODUCT_ID_VALUE,
                    'title': TITLE_VALUE,
                    'thumbnailUrl': PRODUCT_THUMBNAILS_VALUE
                },
                $push : {
                    'historicalData' : {
                            'price': Number(PRICE_VALUE[0]),
                            'timestamp': TIMESTAMP_VALUE
                        }
                }
            }
            await EMAG_PRICE_TRACKER_COLLECTION.updateOne(FILTER, UPDATE_DATA , DB_OPTIONS);
        }
        await BROWSER.close();
        await CLIENT_DB.close()
        console.log('Done.');
    } catch (error) {
        console.error('An error occured:', error);
    }
};

connectToDb()
    .then(() => {
        scrapeData();
    })
.catch((error) => {
    console.error(error);
});