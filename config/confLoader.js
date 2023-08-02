// confLoader.js
const path = require("path");

const defaultConfig = require("./def.conf.js");
const userConfigPath = path.join(__dirname, "user.conf.js");

function mergeConfig(defaultConfig, userConfig) {

    function mergeObjects(defaultObj, userObj) {
        for (const [key, userValue] of Object.entries(userObj)) {
            if (typeof userValue === "object" && "switch" in userValue) {
                if (userValue.switch === "on") {
                    defaultObj[key] = userValue;
                }
            } else if (typeof defaultObj[key] === "object" && typeof userValue === "object") {
                mergeObjects(defaultObj[key], userValue);
            } else {
                defaultObj[key] = userValue;
            }
        }
    }

    mergeObjects(defaultConfig, userConfig);
}

function loadConfig() {
    try {
        const userConfig = require(userConfigPath);
        mergeConfig(defaultConfig, userConfig);
        return defaultConfig;
    } catch (error) {
        console.error("Error loading user configuration:", error);
        return defaultConfig;
    }
}

module.exports = loadConfig();
