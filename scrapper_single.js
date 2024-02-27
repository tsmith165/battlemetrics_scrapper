// /lib/battlemetrics_scrapper/scrapper_single.js

const moment = require('moment');
const { PrismaClient } = require('@prisma/client');

console.log(`Scrapper Single DB URL: ${process.env.PS_DATABASE_URL}`);
const prisma = new PrismaClient();

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
const { create_db_connection } = require('./db_connection_helper');

class SingleScrapper {
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

        // Start the scrapper
        await this.run_scrapper(); // This is your existing method to run the scrapper
        console.log('Scrapper run completed. Next run scheduled after interval.');
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

        var { id, ip, port, rank, name, players, maxPlayers, details, rust_description, rust_last_wipe } = attrs;
        var rust_next_wipe_map, rust_next_wipe_full, rust_next_wipe_bp, rust_next_wipe, next_wipe_is_bp;

        const extra_debug = false;
        if (extra_debug) {
            this.log(`*`.repeat(140));
            this.log(`*`.repeat(20) + ` Attributes for Server ${id} ${name} ` + `-`.repeat(20));
            this.log(`Server ${id} ${name} Full Attributes (Next Line):`);
            for (const [key, value] of Object.entries(attrs)) {
                this.log(`${key}: ${value}`);
            }

            this.log(`-`.repeat(20) + ` Details ` + `-`.repeat(20));
            for (const [key, value] of Object.entries(details)) {
                this.log(`${key}: ${value}`);
            }
        }

        rust_description = details ? details.rust_description : '';
        rust_last_wipe = details ? details.rust_last_wipe : null;
        rust_next_wipe = details ? details.rust_last_wipe : null;
        rust_next_wipe_map = details ? details.rust_next_wipe_map : null;
        rust_next_wipe_full = details ? details.rust_next_wipe_full : null;
        rust_next_wipe_bp = details ? details.rust_next_wipe_bp : null;

        rust_next_wipe = rust_next_wipe_map ? rust_next_wipe_map : rust_next_wipe;
        rust_next_wipe = rust_next_wipe ? moment(new Date(rust_next_wipe)).format(BM_DATE_FORMAT) : null;
        rust_next_wipe_full = rust_next_wipe_bp ? rust_next_wipe_bp : rust_next_wipe_full;
        rust_next_wipe_full = rust_next_wipe_full ? moment(new Date(rust_next_wipe_full)).format(BM_DATE_FORMAT) : null;

        // check if next wipe is force wipe by comparing which date from rust_next_wipe or rust_next_wipe_full is closer to current date
        next_wipe_is_bp = false;
        if (rust_next_wipe && rust_next_wipe_full) {
            const next_wipe_moment = moment(new Date(rust_next_wipe));
            const next_wipe_full_moment = moment(new Date(rust_next_wipe_full));
            const current_moment = moment();

            const next_wipe_diff = Math.abs(next_wipe_moment.diff(current_moment));
            const next_wipe_full_diff = Math.abs(next_wipe_full_moment.diff(current_moment));

            next_wipe_is_bp = next_wipe_diff > next_wipe_full_diff;
        }

        this.log(`-`.repeat(20) + ` Parsed Attrs ` + `-`.repeat(20));
        this.log(`BM ID: ${id} | Name: ${name}`);
        this.log(`IP: ${ip} | Port: ${port}`);
        this.log(`Rank: ${rank} | Players: ${players}/${maxPlayers}`);
        this.log(`Rust Next Wipe: ${rust_next_wipe ? rust_next_wipe : 'N/A'}`);
        this.log(`Rust Next Wipe Full: ${rust_next_wipe_full ? rust_next_wipe_full : 'N/A'}`);
        this.log(`Next Wipe is BP: ${next_wipe_is_bp}`);

        // Server exclusion logic
        // Rank of server greater than set min rank
        if (rank > this.min_rank) {
            this.log(`Not saving servers with rank > ${this.min_rank} in DB. Skipping ${name}. Amount skipped:', this.servers_skipped`);
            this.servers_skipped++;
            return;
        }

        // console.log('Rust Description:\n', rust_description);

        const serverAttributes = this.parse_server_attributes(name, rust_description);
        //console.log('Server Attributes:\n', serverAttributes);

        const maxAttributes = this.parse_grouped_attributes_for_max(serverAttributes);
        //console.log('Max Attributes:\n', maxAttributes);

        var next_wipe_hour = '-1';
        var next_wipe_dow = '-1';
        var next_wipe_week = '-1';
        if (rust_next_wipe !== null) {
            next_wipe_hour = moment(rust_next_wipe).format('H'); // 0-23
            next_wipe_dow = moment(rust_next_wipe).format('d'); // 0 = Sunday, 6 = Saturday
            next_wipe_week = moment(rust_next_wipe).format('W'); // 1-52
        }

        const dataToInsert = {
            bm_id: id,
            rank: rank,
            ip: `${ip}:${port}`,
            title: name,
            region: this.country,
            players: players,
            attributes: maxAttributes,
            last_wipe: rust_last_wipe,
            next_wipe: next_wipe_is_bp ? rust_next_wipe_full : rust_next_wipe,
            next_wipe_full: rust_next_wipe_full,
            next_wipe_is_bp: next_wipe_is_bp,
            next_wipe_hour: next_wipe_hour,
            next_wipe_dow: next_wipe_dow,
            next_wipe_week: next_wipe_week,
        };

        // pull current data for BM ID and if data from current data is better than new data, only update fields that are better
        const final_data_to_insert = await this.search_for_existing_and_combine(id, dataToInsert);

        await this.insert_into_db(final_data_to_insert);
        this.servers_posted++;
    }

    async insert_into_db(data) {
        const {
            bm_id,
            rank,
            ip,
            title,
            region,
            players,
            attributes,
            last_wipe,
            next_wipe,
            next_wipe_full,
            next_wipe_is_bp,
            next_wipe_hour,
            next_wipe_dow,
            next_wipe_week,
        } = data;
        const { game_mode, wipe_schedule, resource_rate, group_limit } = attributes;

        // Check if the server already exists in the DB
        const existing_data = await prisma.server_parsed.findUnique({
            where: { id: parseInt(bm_id, 10) },
        });
        const new_record = existing_data ? false : true;

        // Use Prisma for DB Operations
        if (new_record) {
            // Insert into server_parsed
            await prisma.server_parsed.create({
                data: {
                    id: parseInt(bm_id, 10),
                    rank: rank,
                    ip: ip,
                    title: title,
                    region: typeof region === String ? region : 'NA',
                    players: players,
                    wipe_schedule: 'N/A', // Havent re-implemented wipe_schedule parsing yet
                    game_mode: game_mode || null,
                    resource_rate: resource_rate || null,
                    group_limit: group_limit || null,
                    last_wipe: last_wipe || null,
                    next_wipe: next_wipe || null,
                    next_wipe_full: next_wipe_full || null,
                    next_wipe_is_bp: next_wipe_is_bp || null,
                    next_wipe_hour: parseInt(next_wipe_hour) || null,
                    next_wipe_dow: parseInt(next_wipe_dow) || null,
                    next_wipe_week: parseInt(next_wipe_week) || null,
                },
            });
        } else {
            await prisma.server_parsed.update({
                where: { id: parseInt(bm_id, 10) },
                data: {
                    rank: rank,
                    title: title,
                    region: typeof attributes.region === String ? attributes.region : 'NA',
                    players: players,
                    wipe_schedule: 'N/A', // Havent re-implemented wipe_schedule parsing yet
                    game_mode: game_mode || null,
                    resource_rate: resource_rate || null,
                    group_limit: group_limit || null,
                    last_wipe: last_wipe || null,
                    next_wipe: next_wipe || null,
                    next_wipe_full: next_wipe_full || null,
                    next_wipe_is_bp: next_wipe_is_bp || null,
                    next_wipe_hour: parseInt(next_wipe_hour) || null,
                    next_wipe_dow: parseInt(next_wipe_dow) || null,
                    next_wipe_week: parseInt(next_wipe_week) || null,
                },
            });
        }
    }

    async search_for_existing_and_combine(bm_id, data_to_compare) {
        const existing_data = await prisma.server_parsed.findUnique({
            where: { id: parseInt(bm_id, 10) },
        });

        if (!existing_data) {
            console.log(`No existing records found matching Battle Metrics ID: ${bm_id}`);
            return data_to_compare;
        }

        // loop the data_to_compare and combine existing data with new data.  If fields are missing in new data, use existing data fields
        const combined_data = {};

        for (const [key, value] of Object.entries(data_to_compare)) {
            if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'null') {
                combined_data[key] = existing_data[key];
            } else {
                combined_data[key] = value;
            }
        }

        return combined_data;
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
        try {
            title = title.toLowerCase() || '';
        } catch (e) {
            console.error('Error parsing server Title:', e);
            title = '';
        }
        try {
            description = description.toLowerCase() || '';
        } catch (e) {
            console.error('Error parsing server description:', e);
            description = '';
        }

        // console.log(`Title: ${title}`);
        // console.log(`Description: ${description}`);

        const serverAttributes = {};
        for (const [groupKey, attributeKeys] of Object.entries(ATTRIBUTE_GROUPS)) {
            // console.log(`Searching title and description for group: ${groupKey} with attributes: ${attributeKeys}`);

            serverAttributes[groupKey] = {};
            this.server_attribute_stats[groupKey] = this.server_attribute_stats[groupKey] || {};

            attributeKeys.forEach((attribute) => {
                // console.log(`Searching for attribute: ${attribute}`);

                const keywords = ATTRIBUTE_KEYWORDS[attribute];
                const count = count_keywords_in_string(keywords, title) + count_keywords_in_string(keywords, description);
                if (count > 0) {
                    // console.log(`Found attribute: ${attribute} with count: ${count}`);
                    if (serverAttributes[groupKey][attribute] === undefined) {
                        serverAttributes[groupKey][attribute] = parseInt(count);
                    } else {
                        serverAttributes[groupKey][attribute] += parseInt(count);
                    }
                    this.server_attribute_stats[groupKey][attribute] = (this.server_attribute_stats[groupKey][attribute] || 0) + count;
                }
            });
        }
        // console.log('Returning server attributes: ');
        // console.log(serverAttributes);
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

module.exports = SingleScrapper;
