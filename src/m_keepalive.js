const dayjs = require("dayjs");
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

    // If within range, start checking
    if (isNowBetween) {
        if (secret.misc.debug_show_additional_log) wxLogger.debug("Report on keepalive.triggerCheck #1: ", t_state.msgCounter_prev, " ", state.v.wxStat.MsgTotal);

        if (t_state.msgCounter_prev < state.v.wxStat.MsgTotal) {
            // There are new messages since last timer run, so update idle timer
            t_state.msgCounter_prev = state.v.wxStat.MsgTotal;
            t_state.idle_start_ts = dayjs().unix();
        } else {
            // No new messages since last timer run, so check if idle timer exceeds
            const idle_length = dayjs().unix() - t_state.idle_start_ts;
            const idle_max = t_conf.trigger_v1[0].max_idle_minutes * 60;
            if (t_state.idle_start_ts !== 0 && idle_length > idle_max) {
                // Idle timer exceeds, so trigger keepalive
                wxLogger.info(`Keepalive triggered: last update of idle timer is ${dayjs(t_state.idle_start_ts).format("HH:mm")}, which exceeds ${t_conf.trigger_v1[0].max_idle_minutes} minutes from now.`);
                // Check functions should be executed here...
                // First perform avatar-url check
                if (t_conf.check_byAvatarUrl.switch === "on") await check_byAvatarUrl();
            }
        }
    }
}

async function check_byAvatarUrl() {
    const {wxLogger, wxbot, secret} = env;
    const t_conf2 = secret.mods.keepalive.check_byAvatarUrl;
    wxbot.currentUser.avatar().then(e => e.toBase64().then(console.log)); // Fallback
    const str = await (await wxbot.currentUser.avatar()).toBase64();
    wxLogger.info(`Avatar base64 length: ${str.length}`);
    wxLogger.trace(str);
    // TODO (compare with default avatar) continue development after collecting data
}

async function check_bySendMsg() {
    const {} = env;
    const t_conf2 = secret.mods.keepalive.check_bySendMsg;
    // TO-DO I decide to continue developing this function only if the check_byAvatarUrl is not feasible.

}

async function a() {
    const {} = env;
}

function b() {
    const {} = env;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {triggerCheck, check_byAvatarUrl};
};