
let lastMs = 0;
let additional = 0;

export function microSeconds() {
    const ms = new Date().getTime();
    if (ms === lastMs) {
        additional++;
        return ms * 1000 + additional;
    } else {
        lastMs = ms;
        additional = 0;
        return ms * 1000;
    }
}

export const type = 'native';

export function create(channelName, options?) {
    const state = {
        messagesCallback: null,
        bc: new BroadcastChannel(channelName),
        subFns: [] // subscriberFunctions
    };

    state.bc.onmessage = msg => {
        if (state.messagesCallback) {
            state.messagesCallback(msg.data);
        }
    };

    return state;
}

export function close(channelState) {
    channelState.bc.close();
    channelState.subFns = [];
}

export function postMessage(channelState, messageJson) {
    try {
        channelState.bc.postMessage(messageJson, false);
        return Promise.resolve();
    } catch (err) {
        return Promise.reject(err);
    }
}

export function onMessage(channelState, fn) {
    channelState.messagesCallback = fn;
}

export function canBeUsed() {
    if (typeof BroadcastChannel === 'function') {
        return true;
    } else return false;
}


export function averageResponseTime() {
    return 150;
}

export default {
    create,
    close,
    onMessage,
    postMessage,
    canBeUsed,
    type,
    averageResponseTime,
    microSeconds
};
