const ATTRIBUTE_KEYWORDS = {
    biweekly: ['biweekly', 'bi-weekly', 'twice per week'],
    weekly: ['weekly'],
    bimonthly: ['bi-monthly', 'bimonthly', '2week', '2 week'],
    monthly: ['monthly'],
    pvp: ['pvp'],
    pve: ['pve'],
    arena: ['arena', 'gun game', 'deathmatch', 'aim train'],
    build: ['build', 'creative', 'noclip'],
    '1x': ['1x'],
    '1.5x': ['1.5x'],
    '2x': ['2x'],
    '3x': ['3x'],
    '5x': ['5x'],
    '10x': ['10x'],
    '100x': ['100x'],
    '1000x': ['1000x'],
    solo: ['solo'],
    duo: ['duo'],
    trio: ['trio'],
    quad: ['quad'],
    'no limit': ['5 man', '6 man', 'no group limit', 'no limit', 'no max group', 'clan', 'big group', 'large group'],
};

const ATTRIBUTE_GROUPS = {
    wipe_schedule: ['biweekly', 'weekly', 'bimonthly', 'monthly'],
    game_mode: ['pvp', 'pve', 'arena', 'build'],
    resource_rate: ['1x', '1.5x', '2x', '3x', '5x', '10x', '100x', '1000x'],
    group_limit: ['solo', 'duo', 'trio', 'quad', 'no limit'],
};

export { ATTRIBUTE_KEYWORDS, ATTRIBUTE_GROUPS };
