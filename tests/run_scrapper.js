import { runScrapper } from '../libs/Scrapper.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { initializeStatsLogger } from '../utils/stats_logger.js';

const yargsArgv = yargs(hideBin(process.argv))
    .options({
        i: { type: 'boolean', alias: 'interval', default: true },
        c: { type: 'string', alias: 'country', default: 'US' },
        m: { type: 'number', alias: 'min_players', default: 2 },
        p: { type: 'number', alias: 'page_length', default: 25 },
        d: { type: 'number', alias: 'distance', default: 5000 },
        a: { type: 'boolean', alias: 'all', default: false },
    })
    .parseSync();

const options = {
    interval: yargsArgv.i,
    country: yargsArgv.c,
    min_players: yargsArgv.m,
    page_length: yargsArgv.p,
    distance: yargsArgv.d,
    max_days_old: 300,
    min_rank: 5000,
    all: yargsArgv.a,
};

initializeStatsLogger();
runScrapper(options);
