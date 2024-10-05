const dayjs = require("dayjs");
const {downloader} = require('./common')();
let env;

async function triggerCheck() {
    const {secret, state, wxLogger} = env;
    const t_conf = secret.mods.keepalive;
    const t_state = state.v.keepalive;
    // Parse trigger timespan
    const {start, end} = t_conf.trigger_v1[0];
    const [startHour, startMinute] = start.split(':').map(Number), [endHour, endMinute] = end.split(':').map(Number);
    const startTime = dayjs().startOf('minute').hour(startHour).minute(startMinute);
    const endTime = dayjs().startOf('minute').hour(endHour).minute(endMinute);
    const isNowBetween = dayjs().isAfter(startTime) && dayjs().isBefore(endTime);

    if (isNowBetween) {  // If time between range, start checking
        if (secret.misc.debug_show_additional_log) wxLogger.debug("Report on keepalive.triggerCheck/msgCount: ", t_state.msgCounter_prev, " ", state.v.wxStat.MsgTotal);

        if (t_state.msgCounter_prev < state.v.wxStat.MsgTotal) {
            // There are new messages since last timer run, so update idle timer
            t_state.msgCounter_prev = state.v.wxStat.MsgTotal;
            t_state.idle_start_ts = dayjs().unix();
            if (t_state.state === -1) {
                // The bot is operational again! Reset state.
                t_state.state = 0;
            }
        } else {
            // No new messages since last timer run, so check if idle timer exceeds
            const idle_length = dayjs().unix() - t_state.idle_start_ts;
            const idle_max = t_conf.trigger_v1[0].max_idle_minutes * 60;
            if (t_state.idle_start_ts !== 0 && idle_length > idle_max) {
                if (t_state.state === -1) {
                    // User did not solve the last fail check, so let's just skip
                    return;
                }
                // Idle timer exceeds, so trigger keepalive
                wxLogger.info(`Keepalive triggered: last update of idle timer is ${dayjs(t_state.idle_start_ts).format("HH:mm")}, which exceeds ${t_conf.trigger_v1[0].max_idle_minutes} minutes from now.`);
                // Check functions should be executed here...
                // First perform avatar-url check
                if (t_conf.check_byAvatarUrl.switch === "on") await check_byAvatarUrl();    // skip his response
                // Then perform send-msg check
                let ok = 0;
                if (t_conf.check_bySendMsg.switch === "on") ok = await check_bySendMsg();
                if (ok === 1) {
                    // "False positive", Reset idle timer...
                    wxLogger.info(`[Keepalive check] Not in suspended status, discarding "false positive".`);
                    t_state.msgCounter_prev = state.v.wxStat.MsgTotal;
                    t_state.idle_start_ts = dayjs().unix();
                } else if (ok === 0) {
                    t_state.state = -1;
                    // avoid the test message affects checks
                    t_state.msgCounter_prev++;
                    // Notify user
                    wxLogger.warn(`[Keepalive check] failed, no response received.`);
                    with (secret.notification) await downloader.httpsCurl(baseUrl + prompt_wx_suspended + default_arg);
                }
            }
        }
    }
}

async function check_byAvatarUrl() {
    const {wxLogger, wxbot, secret} = env;
    const t_conf2 = secret.mods.keepalive.check_byAvatarUrl;
    // wxbot.currentUser.avatar().then(e => e.toBase64().then(console.log)); // Fallback
    const str = await (await wxbot.currentUser.avatar()).toBase64();
    wxLogger.info(`Current avatar base64 length: ${str.length}`);
    wxLogger.trace(str.substring(0, str.length > 200 ? 200 : str.length));
    // TO-DO (compare with default avatar) continue development after collecting data
    // This check method is not feasible, maybe because it's hard to bypass the cache, so we cannot get real statuses with wechaty api.
    return -1;   // refer to other check methods
}

async function check_bySendMsg() {
    const {wxLogger, state, secret, wxbot} = env;
    const t_conf2 = secret.mods.keepalive.check_bySendMsg;
    const originalCounter = state.v.wxStat.notSelfTotal;
    state.v.keepalive.state = 1;    // Mark the process of this check.
    // Preparing variables
    let msgTarget = await wxbot.Contact.find({name: t_conf2.sendTarget});
    msgTarget = msgTarget || await wxbot.Contact.find({alias: t_conf2.sendTarget});
    const msgText = t_conf2.sendContents[Math.floor(Math.random() * t_conf2.sendContents.length)];
    wxLogger.debug(`[Keepalive check] sending {${msgText}} to {${msgTarget}}...`);
    await msgTarget.say(msgText);
    // Check in 20s period
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, t_conf2.watchTimeRange_sec * 200));
        console.log(`\t[Keepalive check] waiting for response... ${i + 1}/5`);
        if (state.v.wxStat.notSelfTotal > originalCounter) {
            state.v.keepalive.state = 0;
            wxLogger.debug(`[Keepalive check] Received Response, check completed.`);
            return 1;
        }
    }
    // No response received, should notify user now.
    return 0;
}

async function util_resetState() {
    const {} = env;
}

async function a() {
    const {} = env;
}

function b() {
    const {} = env;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {triggerCheck, check_byAvatarUrl, check_bySendMsg};
};