const axios = require('axios');

const {
    BM_API_BASE_URL,
    BASE_FILTER,
    COUNTRY_FILTER,
    DISTANCE_FILTER,
    PLAYERS_FILTER,
    PAGE_LEN_FILTER,
} = require('@utils/bm_scrapper_constants');
const { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYWORDS } = require('@utils/bm_scrapper_attributes');

async function fetch_api_url(api_url) {
    console.log(`Fetching server list from API with URL: ${api_url}`);
    try {
        const response = await axios.get(api_url);
        return response.data;
    } catch (error) {
        console.error('API call failed: ', error);
        return null;
    }
}

function count_keywords_in_string(keywords, string) {
    //console.log(`Counting keywords: ${keywords} in string: ${string}`);

    // Convert the string to lowercase so that the search is case-insensitive
    const lowerCaseString = string.toLowerCase();

    return keywords.reduce((count, keyword) => {
        // Also convert the keyword to lowercase
        const lowerCaseKeyword = keyword.toLowerCase();

        // Splitting the string by the keyword and subtracting 1 gives the count of this keyword
        // This is because splitting by a delimiter will result in an array larger by one than the number of delimiters
        return count + (lowerCaseString.split(lowerCaseKeyword).length - 1);
    }, 0);
}

function create_bm_server_list_api_call_string(country, distance, min_players, page_length) {
    const api_call_string = `${BM_API_BASE_URL}?${BASE_FILTER}&${COUNTRY_FILTER}=${country}&${DISTANCE_FILTER}=${distance}&${PLAYERS_FILTER}=${min_players}&${PAGE_LEN_FILTER}=${page_length}&sort=-details.rust_last_wipe`;
    console.log(`Server List API Call: ${api_call_string}`);
    return api_call_string;
}

function parse_server_attributes(title, description) {
    if (title === null || title === undefined) {
        title = '';
    }
    if (description === null || description === undefined) {
        description = '';
    }
    title = title.toLowerCase();
    description = description.toLowerCase();

    var server_attributes = {};
    for (const [groupKey, attributeKeys] of Object.entries(ATTRIBUTE_GROUPS)) {
        server_attributes[groupKey] = {};

        attributeKeys.forEach((attribute) => {
            const keywords = ATTRIBUTE_KEYWORDS[attribute];
            const count = count_keywords_in_string(keywords, title) + count_keywords_in_string(keywords, description);
            if (count > 0) {
                if (server_attributes[groupKey][attribute] === undefined) {
                    server_attributes[groupKey][attribute] = parseInt(count);
                } else {
                    server_attributes[groupKey][attribute] += parseInt(count);
                }
            }
        });

        if (groupKey === 'group_limit' && Object.keys(server_attributes[groupKey]).length === 0) {
            console.log('Checking for group limit with alternative method as it wasnt found with keywords');
            group_limit_key = 'no limit';
            // loop lines of description, convert line to lower case, and search for "group limit".  If exists, scan line for integer value and set group_limit to that value
            const lines = description.split('\n');
            for (const line of lines) {
                if (line.includes('group limit') || line.includes('group size') || line.includes('limit')) {
                    const group_limit_int = line.match(/\d+/);
                    if (group_limit_int) {
                        if (group_limit_int[0] === '1') {
                            group_limit_key = 'solo';
                        } else if (group_limit_int[0] === '2') {
                            group_limit_key = 'duo';
                        } else if (group_limit_int[0] === '3') {
                            group_limit_key = 'trio';
                        } else if (group_limit_int[0] === '4') {
                            group_limit_key = 'quad';
                        }
                    }
                }
            }

            if (server_attributes[groupKey][group_limit_key] === undefined) {
                server_attributes[groupKey][group_limit_key] = parseInt(1);
            } else {
                server_attributes[groupKey][group_limit_key] += parseInt(1);
            }
        }
        if (groupKey === 'resource_rate' && Object.keys(server_attributes[groupKey]).length === 0) {
            server_attributes[groupKey]['1x'] = 1;
        }
        if (groupKey === 'game_mode' && Object.keys(server_attributes[groupKey]).length === 0) {
            server_attributes[groupKey]['pvp'] = 1;
        }
    }
    return server_attributes;
}

function parse_grouped_attributes_for_max(server_attributes) {
    const max_attributes = {};
    const server_attribute_stats = {};

    for (const [groupKey, attributes] of Object.entries(server_attributes)) {
        if (Object.keys(attributes).length === 0) {
            continue;
        }

        max_attributes[groupKey] = {};

        if (groupKey === 'group_limit') {
            for (const groupLimit of ['no limit', 'quad', 'trio', 'duo', 'solo']) {
                if (attributes[groupLimit]) {
                    max_attributes[groupKey] = groupLimit;
                    server_attribute_stats[groupLimit] = (server_attribute_stats[groupLimit] || 0) + 1;
                    break;
                }
            }
            continue;
        }

        // Max attributes for other groups
        max_attributes[groupKey] = Object.keys(attributes).reduce((a, b) => (attributes[a] > attributes[b] ? a : b));
        server_attribute_stats[max_attributes[groupKey]] = (server_attribute_stats[max_attributes[groupKey]] || 0) + 1;
    }

    return [max_attributes, server_attribute_stats];
}

async function search_for_existing_and_combine(prisma, bm_id, data_to_compare) {
    const existing_data = await prisma.parsed_server.findUnique({
        where: { id: parseInt(bm_id, 10) },
    });

    if (!existing_data) {
        console.log(`No existing BM ID ${bm_id} records found - inserting new record.`);
        return data_to_compare;
    }

    // loop the data_to_compare and combine existing data with new data.  If fields are missing in new data, use existing data fields
    const combined_data = {};

    console.log(`Found existing BM ID ${bm_id} records - combining existing and new data.`);
    for (const [key, value] of Object.entries(data_to_compare)) {
        if (value === null || value === undefined || value === '' || value === 'N/A' || value === 'null') {
            combined_data[key] = existing_data[key];
        } else {
            combined_data[key] = value;
        }
    }

    return combined_data;
}

async function insert_into_db(prisma, data) {
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
    const existing_data = await prisma.parsed_server.findUnique({
        where: { id: parseInt(bm_id, 10) },
    });
    const new_record = existing_data ? false : true;

    // Use Prisma for DB Operations
    if (new_record) {
        // Insert into server_parsed
        await prisma.parsed_server.create({
            data: {
                id: parseInt(bm_id, 10),
                rank: rank,
                ip: ip,
                title: title,
                region: typeof region === String ? region : 'US',
                players: players,
                wipe_schedule: 'N/A', // Havent re-implemented wipe_schedule parsing yet
                game_mode: game_mode || null,
                resource_rate: resource_rate || null,
                group_limit: group_limit || null,
                last_wipe: last_wipe || null,
                next_wipe: next_wipe || null,
                next_wipe_full: next_wipe_full || null,
                next_wipe_is_bp: String(next_wipe_is_bp) || null, // convert to string
                next_wipe_hour: parseInt(next_wipe_hour) || null,
                next_wipe_dow: parseInt(next_wipe_dow) || null,
                next_wipe_week: parseInt(next_wipe_week) || null,
            },
        });
    } else {
        await prisma.parsed_server.update({
            where: { id: parseInt(bm_id, 10) },
            data: {
                rank: rank,
                title: title,
                region: typeof attributes.region === String ? attributes.region : 'US',
                players: players,
                wipe_schedule: 'N/A', // Havent re-implemented wipe_schedule parsing yet
                game_mode: game_mode || null,
                resource_rate: resource_rate || null,
                group_limit: group_limit || null,
                last_wipe: last_wipe || null,
                next_wipe: next_wipe || null,
                next_wipe_full: next_wipe_full || null,
                next_wipe_is_bp: String(next_wipe_is_bp) || null,
                next_wipe_hour: parseInt(next_wipe_hour) || null,
                next_wipe_dow: parseInt(next_wipe_dow) || null,
                next_wipe_week: parseInt(next_wipe_week) || null,
            },
        });
    }
}

module.exports = {
    fetch_api_url,
    count_keywords_in_string,
    create_bm_server_list_api_call_string,
    parse_server_attributes,
    parse_grouped_attributes_for_max,
    search_for_existing_and_combine,
    insert_into_db,
};
