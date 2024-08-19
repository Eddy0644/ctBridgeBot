// confLoader.js

const defaultConfig = require("./def.conf.js");
// const userConfigPath = require("path").join(__dirname, "user.conf.js");
const userConfigPath = "../data/user.conf.js";

// const {ctLogger} = require('../src/common')("lite");

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
        console.error("\nError loading user configuration:", error, "\nProgram Will take default Config!!\n\n\n");
        // ctLogger.error("Error loading user configuration:", error, "\nProgram Will take default Config!!");
        return defaultConfig;
    }
}

const config = loadConfig();

config.bundle = {
    getTGFileURL: suffix => `https://api.telegram.org/file/bot${config.tgbot.botToken}/${suffix}`,
    getTGBotHookURL: suffix => `${config.tgbot.webHookUrlPrefix}${suffix}/bot${config.tgbot.botToken}`,
};
delete config.class.C2C_generator["-1001888888888"];

// Prepare and reify C2C-generator
{
    const generator = config.class.C2C_generator;
    const C2C_result = config.class.C2C;
    for (const tgid in generator) if (generator.hasOwnProperty(tgid)) {
        const items = generator[tgid];
        for (const item of items) {
            // item = [1001,"name", false, ""]
            let item_type = item[2] || "P";
            item_type = item_type.replace("Person", "P").replace("Room", "R").replace("Group", "R");
            const newC2C = {
                "tgid": parseInt(tgid),
                "threadId": item[0],
                "wx": [item[1], /* isGroup */item_type === "R"],
                "flag": item[3] || "",
            };
            C2C_result.push(newC2C);
        }
    }
}
// Parsing flags and chatOptions for each C2C
{
    config.class.def.opts = {};
    const def = config.chatOptions;
    // below lists ALL supported internal boolean/number properties
    const single_props = ['mixed', 'merge', 'skipSticker', 'nameType', 'onlyReceive', 'hideMemberName'];
    // apply defaults for default channel first
    for (const propName in def) if (def.hasOwnProperty(propName)) {
        config.class.def.opts[propName] = def[propName];
    }
    // process each C2C
    for (const oneC2C of config.class.C2C) {
        oneC2C.flag = oneC2C.flag || "";  // in case no flag specified
        oneC2C.opts = {};
        for (const propName in def) if (def.hasOwnProperty(propName)) {
            // copy all in def to opts, a.k.a load defaults
            oneC2C.opts[propName] = def[propName];
        }
        // [Applying C2C flag settings]
        for (const prop of oneC2C.flag.split(" ")) {
            if (prop === "") continue;  // skip empty string
            const parts = prop.split("=");  // split by "="
            if (single_props.includes(parts[0])) {
                // -[internal boolean/number properties]--------
                if (parts.length === 1)
                    oneC2C.opts[parts[0]] = true;  // just enable that option
                else if (parts.length === 2) {
                    // user chose the value of that option
                    oneC2C.opts[parts[0]] = parseInt(parts[1]);
                }
            } else if (parts[0].startsWith("rule_")) {
                // -[rules override]--------
// Hereeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
            } else {
                console.error(`Unparsed Flags entry: "${prop}", please check!`);
            }
        }
        // [Applying C2C.chatOptions settings]
        for (const propName in oneC2C.chatOptions) if (oneC2C.chatOptions.hasOwnProperty(propName)) {
            // copy all in chatOptions to opts
            oneC2C.opts[propName] = oneC2C.chatOptions[propName];
        }
    }
    // Now can use C2C.opts in later code
}

module.exports = config;
