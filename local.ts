
let lastMs = 0;
let additional = 0;

export function sleep(time?) {
    if (!time) time = 0;
    return new Promise(res => setTimeout(res, time));
}

export function randomToken() {
    return Math.random().toString(36).substring(2);
}

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

const ObliviousSet = function (ttl) {
    const set = new Set();
    const timeMap = new Map();

    this.has = set.has.bind(set);

    this.add = function (value) {
        timeMap.set(value, now());
        set.add(value);
        _removeTooOldValues();
    };

    this.clear = function () {
        set.clear();
        timeMap.clear();
    };


    function _removeTooOldValues() {
        const olderThen = now() - ttl;
        const iterator = set[Symbol.iterator]();

        while (true) {
            const value = iterator.next().value;
            if (!value) return; // no more elements
            const time = timeMap.get(value);
            if (time < olderThen) {
                timeMap.delete(value);
                set.delete(value);
            } else {
                // we reached a value that is not old enough
                return;
            }
        }
    }
};

function now() {
    return new Date().getTime();
}

function fillOptionsWithDefaults(originalOptions = {}) {
    const options = JSON.parse(JSON.stringify(originalOptions));
    if (typeof options.webWorkerSupport === 'undefined') options.webWorkerSupport = true;
    if (!options.localstorage) options.localstorage = {};
    if (!options.localstorage.removeTimeout) options.localstorage.removeTimeout = 1000 * 60;

    return options;
}

const KEY_PREFIX = 'pubkey.broadcastChannel-';
export const type = 'localstorage';

export function getLocalStorage() {
    let localStorage;
    if (typeof window === 'undefined') return null;
    try {
        localStorage = window.localStorage;
        localStorage = window['ie8-eventlistener/storage'] || window.localStorage;
    } catch (e) {
        
    }
    return localStorage;
}

export function storageKey(channelName) {
    return KEY_PREFIX + channelName;
}

export function postMessage(channelState, messageJson) {
    return new Promise<void>(res => {
        sleep().then(() => {
            const key = storageKey(channelState.channelName);
            const writeObj = {
                token: randomToken(),
                time: new Date().getTime(),
                data: messageJson,
                uuid: channelState.uuid
            };
            const value = JSON.stringify(writeObj);
            getLocalStorage().setItem(key, value);

            const ev: any = document.createEvent('Event');
            ev.initEvent('storage', true, true);
            ev.key = key;
            ev.newValue = value;
            window.dispatchEvent(ev);

            res();
        });
    });
}

export function addStorageEventListener(channelName, fn) {
    const key = storageKey(channelName);
    const listener = ev => {
        if (ev.key === key) {
            fn(JSON.parse(ev.newValue));
        }
    };
    window.addEventListener('storage', listener);
    return listener;
}
export function removeStorageEventListener(listener) {
    window.removeEventListener('storage', listener);
}

export function create(channelName, options) {
    options = fillOptionsWithDefaults(options);
    if (!canBeUsed()) {
        throw new Error('BroadcastChannel: localstorage cannot be used');
    }

    const uuid = randomToken();

    const eMIs = new ObliviousSet(options.localstorage.removeTimeout);

    const state: any = {
        channelName,
        uuid,
        eMIs // emittedMessagesIds
    };


    state.listener = addStorageEventListener(
        channelName,
        (msgObj) => {
            if (!state.messagesCallback) return; // no listener
            if (msgObj.uuid === uuid) return; // own message
            if (!msgObj.token || eMIs.has(msgObj.token)) return; // already emitted
            if (msgObj.data.time && msgObj.data.time < state.messagesCallbackTime) return; // too old

            eMIs.add(msgObj.token);
            state.messagesCallback(msgObj.data);
        }
    );


    return state;
}

export function close(channelState) {
    removeStorageEventListener(channelState.listener);
}

export function onMessage(channelState, fn, time) {
    channelState.messagesCallbackTime = time;
    channelState.messagesCallback = fn;
}

export function canBeUsed() {
    const ls = getLocalStorage();

    if (!ls) return false;

    try {
        const key = '__broadcastchannel_check';
        ls.setItem(key, 'works');
        ls.removeItem(key);
    } catch (e) {
        return false;
    }

    return true;
}


export function averageResponseTime() {
    const defaultTime = 120;
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        return defaultTime * 2;
    }
    return defaultTime;
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
