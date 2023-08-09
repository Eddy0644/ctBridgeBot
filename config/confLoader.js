// confLoader.js

const defaultConfig = require("./def.conf.js");
const userConfigPath = require("path").join(__dirname, "user.conf.js");
const {ctLogger} = require('../src/common')("lite");

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
        ctLogger.error("Error loading user configuration:", error, "\nProgram Will take default Config!!");
        return defaultConfig;
    }
}

const config = loadConfig();

config.bundle = {
    getTGFileURL: suffix => `https://api.telegram.org/file/bot${config.tgbot.botToken}/${suffix}`,
};

module.exports = config;
