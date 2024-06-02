// /tests/run_scrapper.ts
import Scrapper from '../libs/Scrapper.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
const argv = yargs(hideBin(process.argv)).options({
    i: { type: 'boolean', alias: 'interval', default: false },
    a: { type: 'boolean', alias: 'all', default: false },
    c: { type: 'string', alias: 'country', default: 'US' },
    m: { type: 'number', alias: 'min_players', default: 2 },
    p: { type: 'number', alias: 'page_length', default: 25 },
    d: { type: 'number', alias: 'distance', default: 5000 },
}).argv;
const scrapper = new Scrapper({
    max_days_old: 300,
    min_rank: 5000,
    interval: argv.interval,
    all: argv.all,
    country: argv.country,
    min_players: argv.min_players,
    page_length: argv.page_length,
    distance: argv.distance,
});
scrapper.run();
