let env;

async function a() {
    const {} = env;
}

function b() {
    const {} = env;
}

module.exports = (incomingEnv) => {
    env = incomingEnv;
    return {};
};