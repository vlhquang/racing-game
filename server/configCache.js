const BASE_CONFIG = require('./Config');

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(target, patch) {
    if (!isPlainObject(target) || !isPlainObject(patch)) return target;
    for (const [k, v] of Object.entries(patch)) {
        if (isPlainObject(v)) {
            if (!isPlainObject(target[k])) target[k] = {};
            deepMerge(target[k], v);
        } else if (Array.isArray(v)) {
            target[k] = [...v];
        } else {
            target[k] = v;
        }
    }
    return target;
}

let cache = deepClone(BASE_CONFIG);

function getConfig() {
    return deepClone(cache);
}

function updateConfig(patch) {
    if (!isPlainObject(patch)) {
        throw new Error('Config patch must be an object');
    }
    cache = deepMerge(cache, patch);
    return getConfig();
}

function resetConfig() {
    cache = deepClone(BASE_CONFIG);
    return getConfig();
}

module.exports = {
    getConfig,
    updateConfig,
    resetConfig
};

