const BM_API_BASE_URL = 'https://api.battlemetrics.com/servers';
const BASE_FILTER = 'filter[game]=rust&filter[status]=online';
const COUNTRY_FILTER = 'filter[countries][]';
const DISTANCE_FILTER = 'filter[maxDistance]';
const PLAYERS_FILTER = 'filter[players][min]';
const PAGE_LEN_FILTER = 'page[size]';
const PAGE_KEY_FILTER = 'page[key]';
const WIPE_FILTER = 'sort=-details.rust_last_wipe';

const MY_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSS[Z]';
const BM_DATE_FORMAT = 'YYYY-MM-DDTHH:mm:ss.SSS[Z]';

const REGION_MAP = {
    US: 'North America',
    BO: 'South America',
    DE: 'Europe',
    CF: 'Africa',
    CN: 'Asia',
    AU: 'Australia',
};

module.exports = {
    BM_API_BASE_URL,
    BASE_FILTER,
    COUNTRY_FILTER,
    DISTANCE_FILTER,
    PLAYERS_FILTER,
    PAGE_LEN_FILTER,
    PAGE_KEY_FILTER,
    WIPE_FILTER,
    MY_DATE_FORMAT,
    BM_DATE_FORMAT,
    REGION_MAP,
};
