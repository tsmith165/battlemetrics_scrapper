import axios from 'axios';
import { db, rw_parsed_server } from '../db/db.js';
import { eq } from 'drizzle-orm';
import {
    BM_API_BASE_URL,
    BASE_FILTER,
    COUNTRY_FILTER,
    DISTANCE_FILTER,
    PLAYERS_FILTER,
    PAGE_LEN_FILTER,
} from '../utils/bm_scrapper_constants.js';
import { ATTRIBUTE_GROUPS, ATTRIBUTE_KEYWORDS } from '../utils/bm_scrapper_attributes.js';
import { logError } from '../utils/stats_logger.js';

async function fetch_api_url(api_url) {
    try {
        const response = await axios.get(api_url);
        console.log('API call successful. Returning data.');
        return response.data;
    } catch (error) {
        console.error('API call failed:', error);
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            } else if (error.request) {
                console.error('No response received:', error.request);
            } else {
                console.error('Error message:', error.message);
            }
        } else {
            console.error('Unknown error:', error);
        }
        return null;
    }
}

function count_keywords_in_string(keywords, string) {
    const lowerCaseString = string.toLowerCase();

    return keywords.reduce((count, keyword) => {
        const lowerCaseKeyword = keyword.toLowerCase();
        return count + (lowerCaseString.split(lowerCaseKeyword).length - 1);
    }, 0);
}

function create_bm_server_list_api_call_string(country, distance, min_players, page_length) {
    const api_call_string = `${BM_API_BASE_URL}?${BASE_FILTER}&${COUNTRY_FILTER}=${country}&${DISTANCE_FILTER}=${distance}&${PLAYERS_FILTER}=${min_players}&${PAGE_LEN_FILTER}=${page_length}&sort=-details.rust_last_wipe`;
    console.log(`Server List API Call: ${api_call_string}`);
    return api_call_string;
}

function parse_server_attributes(title, description) {
    title = title ? title.toLowerCase() : '';
    description = description ? description.toLowerCase() : '';

    const server_attributes = {};

    for (const [groupKey, attributeKeys] of Object.entries(ATTRIBUTE_GROUPS)) {
        server_attributes[groupKey] = {};

        attributeKeys.forEach((attribute) => {
            const keywords = ATTRIBUTE_KEYWORDS[attribute];
            const count = count_keywords_in_string(keywords, title || '') + count_keywords_in_string(keywords, description || '');
            if (count > 0) {
                server_attributes[groupKey][attribute] = (server_attributes[groupKey][attribute] || 0) + count;
            }
        });

        if (groupKey === 'group_limit' && Object.keys(server_attributes[groupKey]).length === 0) {
            console.log('Checking for group limit with alternative method as it wasnt found with keywords');
            let group_limit_key = 'no limit';
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

            server_attributes[groupKey][group_limit_key] = (server_attributes[groupKey][group_limit_key] || 0) + 1;
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

        max_attributes[groupKey] = '';

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

        max_attributes[groupKey] = Object.keys(attributes).reduce((a, b) => (attributes[a] > attributes[b] ? a : b));
        server_attribute_stats[max_attributes[groupKey]] = (server_attribute_stats[max_attributes[groupKey]] || 0) + 1;
    }

    return [max_attributes, server_attribute_stats];
}

async function search_for_existing_and_combine(bm_id, data_to_compare) {
    try {
        const existing_data = await db
            .select()
            .from(rw_parsed_server)
            .where(eq(rw_parsed_server.id, parseInt(bm_id, 10)))
            .execute();

        if (!existing_data || existing_data.length === 0) {
            console.log(`No existing BM ID ${bm_id} records found - inserting new record.`);
            return data_to_compare;
        }

        const parsedExistingData = {
            ...existing_data[0],
            last_wipe: safeParseDateString(existing_data[0].last_wipe),
            next_wipe: safeParseDateString(existing_data[0].next_wipe),
            next_full_wipe: safeParseDateString(existing_data[0].next_full_wipe),
        };

        const combined_data = { ...parsedExistingData, ...data_to_compare };

        // Ensure date fields are properly handled
        combined_data.last_wipe = safeParseDateString(combined_data.last_wipe);
        combined_data.next_wipe = safeParseDateString(combined_data.next_wipe);
        combined_data.next_full_wipe = safeParseDateString(combined_data.next_full_wipe);

        return combined_data;
    } catch (error) {
        console.error('Error searching for existing data:', error);
        await logError(`Error searching for existing data: ${error}`);
        throw error;
    }
}

function isValidDate(d) {
    return d instanceof Date && !isNaN(d);
}

function safeParseDateString(dateString) {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isValidDate(date) ? date : null;
}

async function insert_into_db(data) {
    try {
        const processedData = {
            ...data,
            last_wipe: safeParseDateString(data.last_wipe),
            next_wipe: safeParseDateString(data.next_wipe),
            next_full_wipe: safeParseDateString(data.next_full_wipe),
        };

        console.log('Processed data before insertion:', processedData);

        await db
            .insert(rw_parsed_server)
            .values(processedData)
            .onConflictDoUpdate({
                target: rw_parsed_server.id,
                set: processedData,
            })
            .execute();

        console.log('Data inserted successfully');
    } catch (error) {
        console.error('Error inserting data into database:', error);
        console.error('Problematic data:', data);
        await logError(`Error inserting data into database: ${error}`);
        throw error;
    }
}

export {
    fetch_api_url,
    count_keywords_in_string,
    create_bm_server_list_api_call_string,
    parse_server_attributes,
    parse_grouped_attributes_for_max,
    search_for_existing_and_combine,
    insert_into_db,
    safeParseDateString,
};
