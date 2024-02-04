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
    getTGBotHookURL: suffix => `${config.tgbot.webHookUrlPrefix}${suffix}/bot${config.tgbot.botToken}`,
};

// Prepare and reify C2C-generator
{
    const generator = config.class.C2C_generator;
    const C2C_result = config.class.C2C;
    for (const tgid in generator) if (generator.hasOwnProperty(tgid)) {
        const items = generator[tgid];
        for (const item of items) {
            // item = [1001,"name", false, ""]
            let item_type = item[2] || "P";
            item_type = item_type.replace("Person", "P").replace("Room", "R");
            const newC2C = {
                tgid,
                "threadId": item[0],
                "wx": [item[1], /* isGroup */item_type === "R"],
                "flag": item[3] || "",
            };
            C2C_result.push(newC2C);
        }
    }
}

module.exports = config;
