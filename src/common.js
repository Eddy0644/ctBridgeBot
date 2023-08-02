const log4js = require('log4js');
const fs = require("fs");
const proxy = require("../proxy");
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
        "con": {appenders: ["console"], level: "debug"},
        "ct": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "wx": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
        "wxMsg": {appenders: ["wxMsgDetail_dateLog"], level: "info"},
        "tg": {appenders: ["dateLog", "debug_to_con"], level: "trace"},
    }
});

module.exports = (param) => {
    if (param === "startup") log4js.getLogger("default").debug(`Program Starting...
   ________  ____        __ 
  / ____/ /_/ __ )____  / /_
 / /   / __/ __  / __ \\/ __/
/ /___/ /_/ /_/ / /_/ / /_  
\\____/\\__/_____/\\____/\\__/  
                                                                            
`);
    // else return log4js.getLogger(param);
    else { // noinspection JSUnresolvedVariable
        return {
            wxLogger: log4js.getLogger("wx"),
            tgLogger: log4js.getLogger("tg"),
            // conLogger: log4js.getLogger("con"),
            ctLogger: log4js.getLogger("ct"),
            wxMsgLogger: log4js.getLogger("wxMsg"),

            LogWxMsg: (msg, isMessageDropped) => {
                let msgToStr = `${msg}`;
                // fixed here to avoid contamination of <img of HTML.
                log4js.getLogger("wx").trace(`---Raw ${msgToStr.replaceAll("<img class=\"emoji", "[img class=\"emoji")}\n\t\t${isMessageDropped ? '❌[Dropped]' : ""} Verbose:` +
                    `[age:${msg.age()},uptime:${process.uptime().toFixed(2)}][type:${msg.type()}][ID: ${msg.id} ]`
                    + (isMessageDropped ? '\n' : ''));
                log4js.getLogger("wxMsg").info(`[ID:${msg.id}][ts=${msg.payload.timestamp}][type:${msg.type()}]
            [🗣talkerId=${msg.payload.talkerId}][👥roomId=${msg.payload.roomId}]
            [filename=${msg.payload.filename}]
            ${msg.payload.text}
            ---------------------`);
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
                    {command: '/clear', description: 'Clear Selection'},
                    {command: '/help', description: 'Get a detail of bot commands.'},
                    // {command: '/keyboard', description: 'Get a persistent versatile quick keyboard.'},
                    // {command: '/info', description: 'Get current system variables'},
                    {command: '/placeholder', description: 'Display a placeholder to hide former messages'},
                    // {command: '/slet', description: 'Set last explicit talker as last talker.'},
                    // {command: '/log', description: 'Get a copy of program verbose log of 1000 chars by default.'},
                    {command: '/lock', description: 'Lock the target talker to avoid being interrupted.'},
                    {command: '/spoiler', description: 'Add spoiler to the replied message.'},
                    // Add more commands as needed
                ],
                wxPushMsgFilterWord: [
                    ["公众号", "已更改名称为", "查看详情"],
                    ["关于公众号进行帐号迁移的说明"],
                    ["关于公众号进行账号迁移的说明"], // must f*k WeChat here
                ],
            },
            downloader: {
                httpNoProxy: async function (url, pathName) {
                    return new Promise((resolve, reject) => {
                        const file = fs.createWriteStream(pathName);
                        http.get(url, {}, (response) => {
                            // response.setEncoding("binary");
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
                httpsWithProxy: async function (url, pathName) {
                    return new Promise((resolve, reject) => {
                        if (!pathName) log4js.getLogger("default").error(`Undefined Download target!`);
                        const file = fs.createWriteStream(pathName);
                        const agent = new agentEr.HttpsProxyAgent(proxy);
                        https.get(url, {agent: agent}, (response) => {
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
                    return new Promise((resolve) => {
                        https.get(url, {}, () => {
                            resolve("SUCCESS");
                        }).on('error', () => {
                            console.error(`[Error] Failed on httpsCurl request. Probably network has been disconnected, so notifications have no need to launch now. Wait for Exit...`);
                            setTimeout(() => resolve("NETWORK_DISCONNECTED"), 10000);
                        });
                    });
                },
                httpsWithWx: async function (url, pathName, cookieStr) {
                    return new Promise((resolve, reject) => {
                        const file = fs.createWriteStream(pathName);
                        const options = {
                            headers: {
                                'Cookie': cookieStr
                            },
                            rejectUnauthorized: false
                        };
                        https.get(url, options, (response) => {
                            if (response.statusCode !== 200) {
                                reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
                                return;
                            }
                            response.pipe(file);
                            file.on('finish', () => {
                                file.close();
                                resolve("SUCCESS");
                            });
                        }).on('error', (error) => {
                            fs.unlink(pathName, () => reject(error));
                        }).end();
                    });
                }
            },

            processor: {
                isPreRoomValid: function (preRoomState, targetTopic, forceMerge = false) {
                    try {
                        const _ = preRoomState;
                        // noinspection JSUnresolvedVariable
                        const lastDate = (_.tgMsg) ? (_.tgMsg.edit_date || _.tgMsg.date) : 0;
                        const nowDate = dayjs().unix();
                        return (_.topic === targetTopic && (nowDate - lastDate < 60 || forceMerge));
                    } catch (e) {
                        console.info(`Maybe bug here!`);
                        log4js.getLogger("tg").debug(`Error occurred while validating preRoomState.\n\t${e.toString()}`);
                        return false;
                    }
                },
                isTimeValid: function (targetTS, maxDelay) {
                    const nowDate = dayjs().unix();
                    return (nowDate - targetTS < maxDelay);
                }
            },
        }
    }
}
