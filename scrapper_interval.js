// /lib/battlemetrics_scrapper/scrapper_interval.js

const moment = require('moment');
const { PrismaClient } = require('@prisma/client');

console.log(`Scrapper Single DB URL: ${process.env.PS_DATABASE_URL}`);
const prisma = new PrismaClient();

require('dotenv').config();

const { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYWORDS } = require('./bm_scrapper_attributes');
const {
    BM_API_BASE_URL,
    BASE_FILTER,
    COUNTRY_FILTER,
    DISTANCE_FILTER,
    PLAYERS_FILTER,
    PAGE_LEN_FILTER,
    MY_DATE_FORMAT,
    BM_DATE_FORMAT,
} = require('./bm_scrapper_constants');
const { fetch_server_list, count_keywords_in_string } = require('./scrapper_generic_helper');
const { insert_scrapper_stats, output_stats } = require('./scrapper_stats_helper');
const { create_db_connection } = require('../helpers/db_connection_helper');

class IntervalScrapper {
    constructor() {
        this.page_length = 25; // fetch the most recent 25 bm servers only
        this.distance = 5000;
        this.min_players = 2;
        this.country = 'US';
        this.start_time = null;
        this.end_time = null;
        this.servers_parsed = 0;
        this.servers_posted = 0;
        this.servers_skipped = 0;
        this.server_attribute_stats = {};
        this.logEnabled = true;
        this.logBuffer = [];
        this.bufferLogs = false;
    }

    log(...args) {
        if (this.logEnabled) {
            if (this.bufferLogs) {
                this.logBuffer.push(args.join(' '));
            } else {
                console.log(...args);
            }
        }
    }

    flushLogs() {
        this.logBuffer.forEach((message) => console.log(message));
        this.logBuffer = []; // Reset the buffer
    }

    async run() {
        const db_url = process.env.PS_DATABASE_URL;
        console.log('DB URL:', db_url);

        const dbConnected = await create_db_connection(process.env.PS_DATABASE_URL);
        if (!dbConnected) {
            console.log('Failed to connect to Database. Exiting scrapper...');
            return;
        }

        // Start the scrapper with interval
        const run_interval = 5000;
        this.runInterval(run_interval)
            .then(() => {
                console.log(`Scrapper has been set up to run at ${run_interval / 1000} second intervals.`);
            })
            .catch((err) => {
                console.error('Error setting up scrapper interval run:', err);
            });
    }

    async runInterval(interval) {
        // Error handling and interval running are set here
        const intervalRun = async () => {
            try {
                await this.run_scrapper(); // This is your existing method to run the scrapper
                console.log('Scrapper run completed. Next run scheduled after interval.');
            } catch (error) {
                console.error('Error running scrapper:', error);
            }
        };

        // Run first time immediately
        await intervalRun();

        // Then set to run at intervals
        setInterval(intervalRun, interval);
    }

    async run_scrapper() {
        this.servers_parsed = 0;
        this.servers_posted = 0;
        this.servers_skipped = 0;
        this.server_attribute_stats = {};
        this.start_time = moment();
        this.end_time = null;

        const api_url = this.create_bm_server_list_api_call_string();

        const data = await fetch_server_list(api_url);
        if (data) {
            await this.parse_server_list_data(data);
        }

        this.end_time = moment();
        output_stats(
            this.start_time,
            this.end_time,
            this.servers_parsed,
            this.servers_skipped,
            this.servers_posted,
            this.server_attribute_stats
        );
        await insert_scrapper_stats(prisma, this.start_time, this.end_time, this.servers_parsed, this.servers_skipped, this.servers_posted);
        await prisma.$disconnect();
    }

    async parse_server_list_data(response) {
        if (!response.data) {
            this.log('Response data not present. Response output (Next Line):');
            this.log(response);
            return;
        }

        this.bufferLogs = true; // Start buffering logs

        const tasks = response.data.map((server) => this.parse_single_server(server));
        await Promise.all(tasks);

        this.bufferLogs = false; // Stop buffering logs
        this.flushLogs(); // Flush the buffered logs
    }

    async parse_single_server(server) {
        this.servers_parsed++;
        const attrs = server.attributes;
        if (!attrs) {
            this.servers_skipped++;
            return;
        }

        var { id, rank, name, players, maxPlayers, details, rust_description, rust_last_wipe } = attrs;
        rust_description = details ? details.rust_description : '';
        rust_last_wipe = details ? details.rust_last_wipe : null;

        const wipeDateTime = rust_last_wipe ? moment(new Date(rust_last_wipe)).format(BM_DATE_FORMAT) : null;
        const wipeMoment = rust_last_wipe ? moment(new Date(rust_last_wipe)) : null;
        const wipeWeekday = wipeMoment ? wipeMoment.isoWeekday() : null;
        const wipeDay = wipeMoment ? wipeMoment.date() : null;
        const force_wipe = wipeWeekday === 4 && wipeDay < 8;

        this.log(`BM ID: ${id} | Name: ${name}`);
        this.log(`Rank: ${rank} | Players: ${players}/${maxPlayers}`);
        this.log(`Last Wipe: ${wipeDateTime ? wipeDateTime : 'N/A'} | Force Wipe?: ${force_wipe}`);

        // Server exclusion logic
        // Rank of server greater than set min rank
        if (rank > this.min_rank) {
            this.log(`Not saving servers with rank > ${this.min_rank} in DB. Skipping ${name}. Amount skipped:', this.servers_skipped`);
            this.servers_skipped++;
            return;
        }
        // Server has no wipe time and is not force wipe
        if (wipeDateTime && moment().diff(wipeDateTime, 'days') > this.max_days_old) {
            this.log(`Wipe is older than ${this.max_days_old} days old. Skipping. Amount skipped:', this.servers_skipped`);
            this.servers_skipped++;
            return;
        }
        // Server has no wipe time
        if (!wipeDateTime) {
            this.servers_skipped++;
            this.log('Skipping because wipe time already exists. Amount skipped:', this.servers_skipped);
            return;
        }

        // console.log('Rust Description:\n', rust_description);

        const serverAttributes = this.parse_server_attributes(name, rust_description);
        // console.log('Server Attributes:\n', serverAttributes);

        const maxAttributes = this.parse_grouped_attributes_for_max(serverAttributes);
        // console.log('Max Attributes:\n', maxAttributes);

        // Search for BM_ID already in our DB - if found, append current wipe time to array
        const [wipe_array, most_frequent_wipe, second_frequent_wipe, new_record] = await this.search_existing(id, wipeDateTime, force_wipe);

        if (new_record === false && !wipe_array) {
            this.servers_skipped++;
            this.log('Skipping because wipe time already exists. Amount skipped:', this.servers_skipped);
            return;
        }

        const dataToInsert = {
            bm_id: id,
            rank: rank,
            title: name,
            attributes: maxAttributes,
            wipe_time_array: wipeDateTime,
            most_frequent_wipe: most_frequent_wipe,
            second_frequent_wipe: second_frequent_wipe,
            new_record: new_record,
            force_wipe: force_wipe,
            last_wipe: rust_last_wipe,
        };

        await this.insert_into_db(dataToInsert);
        this.servers_posted++;
        this.log('-'.repeat(60));
    }

    async insert_into_db(data) {
        const {
            bm_id,
            rank,
            title,
            attributes,
            wipe_time_array,
            most_frequent_wipe,
            second_frequent_wipe,
            new_record,
            force_wipe,
            last_wipe,
        } = data;

        let wipe_array = [];
        let force_wipe_array = [];
        let primary_wipe_time = [null, null, null];
        let second_wipe_time = [null, null, null];
        let force_wipe_time = [null, null];

        if (force_wipe) {
            force_wipe_time = most_frequent_wipe;
            force_wipe_array = wipe_time_array;
        } else {
            primary_wipe_time = most_frequent_wipe;
            second_wipe_time = second_frequent_wipe;
            wipe_array = wipe_time_array;
        }

        const [primary_day, primary_hour, last_primary] = primary_wipe_time;
        var { secondary_day, secondary_hour, last_secondary } = second_wipe_time;

        secondary_day = typeof secondary_day === 'number' && !isNaN(secondary_day) ? secondary_day : null;
        secondary_hour = typeof secondary_hour === 'number' && !isNaN(secondary_hour) ? secondary_hour : null;

        const { game_mode, wipe_schedule, resource_rate, group_limit } = attributes;

        // Use Prisma for DB Operations
        if (new_record) {
            // Insert into server_data
            await prisma.server_data.create({
                data: {
                    id: parseInt(bm_id, 10),
                    rank,
                    title,
                    region: this.country,
                    attrs: attributes,
                    wipes: wipe_array,
                    force_wipes: force_wipe_array,
                },
            });

            // Insert into server_parsed
            await prisma.server_parsed.create({
                data: {
                    id: parseInt(bm_id, 10),
                    rank,
                    title,
                    region: typeof attributes.region === String ? attributes.region : 'N/A',
                    wipe_schedule,
                    game_mode,
                    resource_rate,
                    group_limit,
                    primary_day,
                    primary_hour,
                    last_primary,
                    secondary_day,
                    secondary_hour,
                    last_secondary,
                    force_hour: force_wipe ? `${force_wipe_time[1]}` : null,
                    last_force: force_wipe ? force_wipe_array[0] : null,
                    last_wipe: last_wipe,
                },
            });
        } else if (force_wipe) {
            // Update server_data and server_parsed for force_wipes
            await prisma.server_data.update({
                where: { id: parseInt(bm_id, 10) },
                data: {
                    rank,
                    title,
                    attrs: attributes,
                    wipes: wipe_array,
                    force_wipes: force_wipe_array,
                },
            });
            await prisma.server_parsed.update({
                where: { id: parseInt(bm_id, 10) },
                data: {
                    force_hour: `${force_wipe_time[1]}`,
                    last_force: force_wipe_array[0],
                    wipe_schedule,
                    game_mode,
                    resource_rate,
                    group_limit,
                },
            });
        } else {
            // Update server_data and server_parsed for regular wipes
            await prisma.server_data.update({
                where: { id: parseInt(bm_id, 10) },
                data: {
                    rank,
                    title,
                    attrs: attributes,
                    wipes: wipe_array,
                    force_wipes: force_wipe_array,
                },
            });
            await prisma.server_parsed.update({
                where: { id: parseInt(bm_id, 10) },
                data: {
                    primary_day: parseInt(primary_day, 10),
                    primary_hour: parseInt(primary_hour, 10),
                    last_primary,
                    secondary_day: parseInt(secondary_day, 10) || null,
                    secondary_hour: parseInt(secondary_hour, 10) || null,
                    last_secondary: last_secondary || null,
                    wipe_schedule: wipe_schedule || null,
                    game_mode: game_mode || null,
                    resource_rate: resource_rate || null,
                    group_limit: group_limit || null,
                },
            });
        }
    }

    async search_existing(bm_id, wipe_time, force_wipe = false) {
        const field_str = force_wipe ? 'force_wipes' : 'wipes';
        const server_data = await prisma.server_data.findUnique({
            where: { id: parseInt(bm_id, 10) },
            select: { wipes: true, force_wipes: true },
        });

        let new_record = false;

        if (!server_data) {
            this.log(`No existing records found matching Battle Metrics ID: ${bm_id}`);
            new_record = true;

            const wipeMoment = moment(wipe_time);
            const wipe = wipeMoment.format(MY_DATE_FORMAT);
            const weekday = wipeMoment.isoWeekday();
            let hour = wipeMoment.hour();
            const minute = wipeMoment.minute();
            if (minute > 45) hour += 1;

            return [[wipe_time], [weekday, hour, wipe], [null, null, null], new_record];
        }

        this.log(`Found pre-existing data in our DB for Battle Metrics ID: ${bm_id}`);

        var wipe_array = force_wipe ? server_data.force_wipes : server_data.wipes;

        if (typeof wipe_array === 'string') {
            wipe_array = [wipe_array];
        } else if (!wipe_array) {
            this.log('Wipe array is null. Creating a new array...');
            wipe_array = []; // initialize it as an empty array
        }

        if (wipe_array.includes(wipe_time)) {
            this.log('Wipe time already exists in wipe array. Skipping...');
            return [null, null, null, false];
        }

        this.log('Wipe time does not exist in wipe array. Adding current wipe time to wipe array...');
        wipe_array.unshift(wipe_time);

        const wipe_dict = this.create_wipe_timestamp_dict(wipe_array, false);
        const { most_frequent_wipe, second_frequent_wipe } = this.determine_frequent_wipes(wipe_dict);

        return [wipe_array, most_frequent_wipe, second_frequent_wipe, new_record];
    }

    determine_frequent_wipes(wipe_dict) {
        let most_frequent_day = null;
        let most_frequent_hour = null;
        let most_frequent_hour_count = null;
        let most_frequent_timestamp = null;

        let second_frequent_day = null;
        let second_frequent_hour = null;
        let second_frequent_hour_count = null;
        let second_frequent_timestamp = null;

        for (const [day, hours] of Object.entries(wipe_dict)) {
            const first_timestamp = hours['first_timestamp'];

            for (const [hour, hour_count] of Object.entries(hours)) {
                if (hour === 'first_timestamp') continue;

                if (most_frequent_hour_count === null) {
                    most_frequent_hour_count = hour_count;
                    most_frequent_day = day;
                    most_frequent_hour = hour;
                    most_frequent_timestamp = first_timestamp;
                } else if (hour_count > most_frequent_hour_count) {
                    second_frequent_hour_count = most_frequent_hour_count;
                    second_frequent_day = most_frequent_day;
                    second_frequent_hour = most_frequent_hour;
                    second_frequent_timestamp = most_frequent_timestamp;

                    most_frequent_hour_count = hour_count;
                    most_frequent_day = day;
                    most_frequent_hour = hour;
                    most_frequent_timestamp = first_timestamp;
                } else if (
                    second_frequent_hour_count === null ||
                    (hour_count > second_frequent_hour_count && hour !== most_frequent_hour)
                ) {
                    second_frequent_hour_count = hour_count;
                    second_frequent_day = day;
                    second_frequent_hour = hour;
                    second_frequent_timestamp = first_timestamp;
                }
            }
        }

        return {
            most_frequent_wipe: [most_frequent_day, most_frequent_hour, most_frequent_timestamp],
            second_frequent_wipe: [second_frequent_day, second_frequent_hour, second_frequent_timestamp],
        };
    }

    parse_grouped_attributes_for_max(serverAttributes) {
        const maxAttributes = {};

        for (const [groupKey, attributes] of Object.entries(serverAttributes)) {
            if (Object.keys(attributes).length === 0) {
                continue;
            }

            // Your group limit logic
            if (groupKey === 'group_limit') {
                for (const groupLimit of ['no limit', 'quad', 'trio', 'duo', 'solo']) {
                    if (attributes[groupLimit]) {
                        maxAttributes[groupKey] = groupLimit;
                        this.server_attribute_stats[groupLimit] = (this.server_attribute_stats[groupLimit] || 0) + 1;
                        break;
                    }
                }
                continue;
            }

            // Max attributes for other groups
            maxAttributes[groupKey] = Object.keys(attributes).reduce((a, b) => (attributes[a] > attributes[b] ? a : b));
            this.server_attribute_stats[maxAttributes[groupKey]] = (this.server_attribute_stats[maxAttributes[groupKey]] || 0) + 1;
        }

        return maxAttributes;
    }

    parse_server_attributes(title, description) {
        title = title.toLowerCase();
        description = description.toLowerCase();
        //this.log(`Title: ${title}`);

        const serverAttributes = {};
        for (const [groupKey, attributeKeys] of Object.entries(ATTRIBUTE_GROUPS)) {
            // this.log(`Searching title and description for group: ${groupKey} with attributes: ${attributeKeys}`);

            serverAttributes[groupKey] = {};
            this.server_attribute_stats[groupKey] = this.server_attribute_stats[groupKey] || {};

            attributeKeys.forEach((attribute) => {
                //console.log(`Searching for attribute: ${attribute}`);

                const keywords = ATTRIBUTE_KEYWORDS[attribute];
                const count = count_keywords_in_string(keywords, title) + count_keywords_in_string(keywords, description);
                if (count > 0) {
                    this.server_attribute_stats[groupKey][attribute] = (this.server_attribute_stats[groupKey][attribute] || 0) + count;
                }
            });
        }

        return serverAttributes;
    }

    create_wipe_timestamp_dict(wipe_array = [], logOut = false) {
        const wipeDict = {};

        for (const wipe of wipe_array) {
            if (!wipe) continue;

            const wipeDate = moment(wipe);
            const weekday = wipeDate.day() + 1; // Moment's day() gets the day of the week (0 = Sunday, 6 = Saturday). We want 1 = Monday, 7 = Sunday (I think?)
            const hour = wipeDate.hour();
            const minute = wipeDate.minute();

            let roundedHour = minute > 45 ? hour + 1 : hour;
            roundedHour = roundedHour > 23 ? 0 : roundedHour;

            if (logOut) this.log(`Cur day: ${weekday} | Cur Hour: ${roundedHour}`);

            if (!wipeDict[weekday]) {
                wipeDict[weekday] = { [roundedHour]: 1, first_timestamp: wipe };
            } else {
                if (!wipeDict[weekday][roundedHour]) {
                    wipeDict[weekday][roundedHour] = 1;
                } else {
                    wipeDict[weekday][roundedHour] += 1;
                }
            }
        }

        if (logOut) this.log(`WIPE DICT (NEXT LINE): \n${JSON.stringify(wipeDict)}`);
        return wipeDict;
    }

    create_bm_server_list_api_call_string() {
        const api_call_string = `${BM_API_BASE_URL}?${BASE_FILTER}&${COUNTRY_FILTER}=${this.country}&${DISTANCE_FILTER}=${this.distance}&${PLAYERS_FILTER}=${this.min_players}&${PAGE_LEN_FILTER}=${this.page_length}&sort=-details.rust_last_wipe`;
        this.log(`Server List API Call: ${api_call_string}`);
        return api_call_string;
    }
}

module.exports = IntervalScrapper;
