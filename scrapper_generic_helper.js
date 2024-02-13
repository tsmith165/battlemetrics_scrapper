const axios = require('axios');

async function fetch_server_list(api_url) {
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

module.exports = {
    fetch_server_list,
    count_keywords_in_string,
};
