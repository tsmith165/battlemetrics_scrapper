// /rust_wipes/lib/battlemetrics_scrapper/run_single_scrapper.js

require('dotenv').config();
console.log(`run_single_scrapper DB URL: ${process.env.PS_DATABASE_URL}`);

const AllServersScrapper = require('./scrapper_all_servers.js');

const scrapper = new AllServersScrapper({
    max_days_old: 150,
    min_rank: 5000,
});

scrapper
    .run()
    .then(() => {
        console.log('Scrapper has finished running.');
    })
    .catch((err) => {
        console.log('Something went wrong:', err);
    });
