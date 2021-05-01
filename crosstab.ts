import NativeMethod from './native';
import LocalstorageMethod from './local';

export class CrossTab {
    name: string;
    method: any;
    options: any;
    _iL: boolean;
    _onML: any;
    _addEL: { message: any[]; internal: any[]; };
    _uMP: Set<any>;
    _befC: any[];
    _prepP: any;
    closed: boolean;
    _state: any

    METHODS = [
        NativeMethod, // fastest
        LocalstorageMethod
    ];

    constructor(name: string) {
        this.name = name;
        this.options = this.fillOptionsWithDefaults();
        this.method = this.chooseMethod(this.options);
        this._iL = false;
        this._onML = null;
        this._addEL = {
            message: [],
            internal: []
        };
        this._uMP = new Set();
        this._befC = [];
        this._prepP = null;
        this._prepareChannel(this);
    }

    isPromise(obj) {
        if (obj &&
            typeof obj.then === 'function') {
            return true;
        } else {
            return false;
        }
    }

    _prepareChannel(channel) {
        const maybePromise = channel.method.create(channel.name, channel.options);
        if (this.isPromise(maybePromise)) {
            channel._prepP = maybePromise;
            maybePromise.then(s => {
                channel._state = s;
            });
        } else {
            channel._state = maybePromise;
        }
    }

    chooseMethod(options) {
        let chooseMethods = [].concat(options.methods, this.METHODS).filter(Boolean);

        if (options.type) {
            const ret = chooseMethods.find(m => m.type === options.type);
            if (!ret) throw new Error('method-type ' + options.type + ' not found');
            else return ret;
        }

        if (!options.webWorkerSupport) {
            chooseMethods = chooseMethods.filter(m => m.type !== 'idb');
        }

        const useMethod = chooseMethods.find(method => method.canBeUsed());
        if (!useMethod)
            throw new Error('No useable methode found:' + JSON.stringify(this.METHODS.map(m => m.type)));
        else
            return useMethod;
    }

    fillOptionsWithDefaults(originalOptions = {}) {
        const options = JSON.parse(JSON.stringify(originalOptions));
        if (typeof options.webWorkerSupport === 'undefined') options.webWorkerSupport = true;
        if (!options.localstorage) options.localstorage = {};
        if (!options.localstorage.removeTimeout) options.localstorage.removeTimeout = 1000 * 60;

        return options;
    }

    postMessage(msg) {
        if (this.closed) {
            throw new Error(
                'BroadcastChannel.postMessage(): ' +
                'Cannot post message after channel has closed'
            );
        }
        return this._post(this, 'message', msg);
    }

    postInternal(msg) {
        return this._post(this, 'internal', msg);
    }

    set onmessage(fn) {
        const time = this.method.microSeconds();
        const listenObj = {
            time,
            fn
        };
        this._removeListenerObject(this, 'message', this._onML);
        if (fn && typeof fn === 'function') {
            this._onML = listenObj;
            this._addListenerObject(this, 'message', listenObj);
        } else {
            this._onML = null;
        }
    }

    addEventListener(type, fn) {
        const time = this.method.microSeconds();
        const listenObj = {
            time,
            fn
        };
        this._addListenerObject(this, type, listenObj);
    }

    removeEventListener(type, fn) {
        const obj = this._addEL[type].find(obj => obj.fn === fn);
        this._removeListenerObject(this, type, obj);
    }

    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        const awaitPrepare = this._prepP ? this._prepP : Promise.resolve();

        this._onML = null;
        this._addEL.message = [];

        return awaitPrepare
            // wait until all current sending are processed
            .then(() => Promise.all(Array.from(this._uMP)))
            // run before-close hooks
            .then(() => Promise.all(this._befC.map(fn => fn())))
            // close the channel
            .then(() => this.method.close(this._state));
    }

    get type() {
        return this.method.type;
    }

    get isClosed() {
        return this.closed;
    }

    /**
 * Post a message over the channel
 * @returns {Promise} that resolved when the message sending is done
 */
    _post(broadcastChannel, type, msg) {
        const time = broadcastChannel.method.microSeconds();
        const msgObj = {
            time,
            type,
            data: msg
        };

        const awaitPrepare = broadcastChannel._prepP ? broadcastChannel._prepP : Promise.resolve();
        return awaitPrepare.then(() => {

            const sendPromise = broadcastChannel.method.postMessage(
                broadcastChannel._state,
                msgObj
            );

            // add/remove to unsend messages list
            broadcastChannel._uMP.add(sendPromise);
            sendPromise
                .catch()
                .then(() => broadcastChannel._uMP.delete(sendPromise));

            return sendPromise;
        });
    }

    _hasMessageListeners(channel) {
        if (channel._addEL.message.length > 0) return true;
        if (channel._addEL.internal.length > 0) return true;
        return false;
    }

    _addListenerObject(channel, type, obj) {
        channel._addEL[type].push(obj);
        this._startListening(channel);
    }

    _removeListenerObject(channel, type, obj) {
        channel._addEL[type] = channel._addEL[type].filter(o => o !== obj);
        this._stopListening(channel);
    }

    _startListening(channel) {
        if (!channel._iL && this._hasMessageListeners(channel)) {
            // someone is listening, start subscribing

            const listenerFn = msgObj => {
                channel._addEL[msgObj.type].forEach(obj => {
                    if (msgObj.time >= obj.time) {
                        obj.fn(msgObj.data);
                    }
                });
            };

            const time = channel.method.microSeconds();
            if (channel._prepP) {
                channel._prepP.then(() => {
                    channel._iL = true;
                    channel.method.onMessage(
                        channel._state,
                        listenerFn,
                        time
                    );
                });
            } else {
                channel._iL = true;
                channel.method.onMessage(
                    channel._state,
                    listenerFn,
                    time
                );
            }
        }
    }

    _stopListening(channel) {
        if (channel._iL && !this._hasMessageListeners(channel)) {
            // noone is listening, stop subscribing
            channel._iL = false;
            const time = channel.method.microSeconds();
            channel.method.onMessage(
                channel._state,
                null,
                time
            );
        }
    }

}