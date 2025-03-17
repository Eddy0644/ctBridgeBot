const log4js = require('log4js');
const fs = require("fs");
const proxy = require((fs.existsSync('data/proxy.js')) ? '../data/proxy.js' : '../proxy.js');
const dayjs = require("dayjs");
const https = require("https");
const http = require("http");
const agentEr = require("https-proxy-agent");
const logger_pattern = "[%d{hh:mm:ss.SSS}] %3.3c:[%5.5p] %m";
const logger_pattern_console = "%[[%d{dd/hh:mm:ss}] %1.1p/%c%] %m";

process.env.TZ = 'Asia/Shanghai';
log4js.configure({
    appenders: {
        "console": {
            type: "console",
            layout: {
                type: "pattern",
                pattern: logger_pattern_console
            },
        },
        "dateLog": {
            type: "dateFile",
            filename: "log/day",
            pattern: "yy-MM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: logger_pattern
            },
        },
        "wxMsgDetail_dateLog": {
            type: "dateFile",
            filename: "log/msgDT/wx",
            pattern: "yy-MM-dd.log",
            alwaysIncludePattern: true,
            layout: {
                type: "pattern",
                pattern: "[%d{hh:mm:ss.SSS}] %m%n%n"
            },
        },
        "debug_to_con": {
            type: "logLevelFilter",
            appender: "console",
            level: "debug",
        }
    },
    categories: {
        "default": {appenders: ["dateLog"], level: "debug"},
        "con": {appenders: ["console"], level: "trace"},
        "ct": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "wx": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "wxMsg": {appenders: ["wxMsgDetail_dateLog"], level: "info"},
        "tg": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
    }
});

const commonEnv = {};

module.exports = (param, ext = null) => {
    if (param === "startup") {
        log4js.getLogger("default").debug(`Program Starting...
   ________  ____        __ 
  / ____/ /_/ __ )____  / /_
 / /   / __/ __  / __ \\/ __/
/ /___/ /_/ /_/ / /_/ / /_  
\\____/\\__/_____/\\____/\\__/  
                                                                            
`);
        commonEnv.tgNotifier = ext.tgNotifier || null;
    }
    // else return log4js.getLogger(param);
    else { // noinspection JSUnresolvedVariable
        const part1 = {
            wxLogger: log4js.getLogger("wx"),
            tgLogger: log4js.getLogger("tg"),
            conLogger: log4js.getLogger("con"),
            ctLogger: log4js.getLogger("ct"),
        };
        if (param === "lite") return part1;

        //// End Lite Version ---------------

        const part2 = {
            LogWxMsg: (msg, type) => {
                const isMessageDropped = type === 1;
                if (type === 2) log4js.getLogger("wxMsg").info(`--------A recalled message is below: -------------`);
                let msgToStr = `${msg}`;
                // fixed here to avoid contamination of <img of HTML.
                part1.wxLogger.trace(`${isMessageDropped ? '❌[Dropped] ' : ""}---Raw ${msgToStr.replaceAll("<img class=\"emoji", "[img class=\"emoji")}\t   ` +
                  `[age:${msg.age()},uptime:${process.uptime().toFixed(2)}][type:${msg.type()}][ID: ${msg.id} ]`);
                //+ (isMessageDropped ? '\n' : ''));
                log4js.getLogger("wxMsg").info(`[ID:${msg.id}][ts=${msg.payload.timestamp}][type:${msg.type()}]
            [🗣talkerId=${msg.payload.talkerId}][👥roomId=${msg.payload.roomId}]
            [filename=${msg.payload.filename}]
            ${JSON.stringify(msg.payload.wcfraw)}${type === 0 ? '\n\t' + msg.log_payload : ''}
            ---------------------`);
                if (msg.log_payload) delete msg.log_payload;
            },

            errorLog: (logger, text, e, stackMax = 7) => {
                logger.error(text);
                logger.debug(`[Stack] ${e.stack.split("\n").slice(0, stackMax).join("\n")}`);
                if (commonEnv.tgNotifier) commonEnv.tgNotifier(text, 1);
            },
            //////-----------Above is mostly of logger ---------------------//////
            delay: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            _T: {},
            STypes: {
                Chat: 1,
                FindMode: 2,
            },
            CommonData: {
                TGBotCommands: [
                    // {command: '/find', description: 'Find Person or Group Chat'},
                    {command: '/clear', description: 'Clear Current Selection'},
                    {command: '/help', description: 'Get a detail of more bot commands.'},
                    // {command: '/keyboard', description: 'Get a persistent versatile quick keyboard.'},
                    // {command: '/info', description: 'Get current system variables'},
                    // {command: '/placeholder', description: 'Display a placeholder to hide former messages | Output a blank message to cover your sensitive data.'},
                    // {command: '/slet', description: 'Set last explicit talker as last talker.'},
                    // {command: '/log', description: 'Get a copy of program verbose log of 1000 chars by default.'},
                    {command: '/lock', description: 'Lock the target talker to avoid being interrupted.'},
                    {command: '/spoiler', description: 'Add spoiler to the replied message.'},
                    // TODO fix /drop_toggle
                    {command: '/drop_toggle', description: 'Toggle /drop status. (Incomplete)'},
                    {
                        command: '/reloginWX_2',
                        description: 'Immediately invalidate current WX login credential and reboot.'
                    },

                    // Add more commands as needed
                ],
                // Explanation: ein -> on, aus -> off
                TGBotHelpCmdText: (state) => `/drop_on & /drop_off : [msg drop]
/sync_on & /sync_off : [self sync]
/info ; /placeholder ; /try_edit 
/reloginWX_2 ; /create_topic ; 
/reboot ; 
Lock: (${state.v.targetLock}) Last: [${(state.last && state.last.name) ? state.last.name : "-"}]`,
                wxPushMsgFilterWord: [
                    ["公众号", "已更改名称为", "查看详情"],
                    ["关于公众号进行帐号迁移的说明"],
                    ["关于公众号进行账号迁移的说明"], // must f*k WeChat here
                ],
            },
            downloader: {
                httpsWithProxy: async function (url, pathName) {
                    return new Promise((resolve, reject) => {
                        if (!pathName) log4js.getLogger("default").error(`Undefined Download target!`);
                        const file = fs.createWriteStream(pathName);
                        const https_opt = proxy === "" ? {} : {agent: new agentEr.HttpsProxyAgent(proxy)};
                        https.get(url, https_opt, (response) => {
                            response.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                resolve("SUCCESS");
                            });
                        }).on('error', (error) => {
                            fs.unlink(pathName, () => reject(error));
                        });
                    });
                },
                httpsCurl: async function (url) {
                    if (url.includes("YourBarkAddress")) {
                        log4js.getLogger("ct").debug(`A notification was skipped because bark notification not configured!\n${url}`);
                        return new Promise((resolve) => {
                            resolve(0);
                        });
                    }
                    return new Promise((resolve) => {
                        https.get(url, {}, (res) => {
                            if (res.statusCode === 200) resolve("SUCCESS");
                            else resolve(res.statusMessage);
                        }).on('error', () => {
                            console.error(`[Error] Failed on httpsCurl request. Probably network has been disconnected, so notifications have no need to launch now. Wait for Exit...`);
                            setTimeout(() => resolve("NETWORK_DISCONNECTED"), 5000);
                        });
                    });
                },
                httpsGet: async function (url) {
                    return new Promise((resolve) => {
                        https.get(url, (res) => {
                            let data = '';

                            // A chunk of data has been received.
                            res.on('data', (chunk) => {
                                data += chunk;
                            });

                            // The whole response has been received.
                            res.on('end', () => {
                                resolve([res.statusCode, data]);
                            });

                        }).on('error', (err) => {
                            // An error occurred, set opcode to 0 and return the error message.
                            resolve([0, err.message]);
                        });
                    });
                },
            },

            processor: {
                isTimeValid: function (targetTS, maxDelay) {
                    const nowDate = dayjs().unix();
                    return (nowDate - targetTS < maxDelay);
                },
                parseUnknown_tgMsg: function (tgMsg, logger) {
                    const propList = Object.getOwnPropertyNames(tgMsg).filter(e => !['message_id', 'from', 'chat', 'date'].includes(e)).join(', ');
                    const info1 = `Chat_id: (${tgMsg.chat.id}) Title:(${tgMsg.chat.title}) `;
                    for (let prop of ['message_id', 'from', 'chat', 'date']) {
                        if (tgMsg.hasOwnProperty(prop)) {
                            delete tgMsg[prop];
                        }
                    }
                },
                filterFilename: function (orig) {
                    return orig.replaceAll(/[\/\\]/g, ",");
                },
            },
        };

        return {...part1, ...part2};
    }
}
