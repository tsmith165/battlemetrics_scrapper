// /rust_wipes/lib/battlemetrics_scrapper/run_single_scrapper.js

require('dotenv').config();
console.log(`run_single_scrapper DB URL: ${process.env.PS_DATABASE_URL}`);

const WholeDBUpdate = require('./whole_db_update.js');

const whole_db_updater = new WholeDBUpdate({});

whole_db_updater
    .run()
    .then(() => {
        console.log('Whole DB Updater has finished running.');
    })
    .catch((err) => {
        console.log('Something went wrong:', err);
    });
