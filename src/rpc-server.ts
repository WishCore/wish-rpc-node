
/**
 * The idea is to be able to easily register methods/functions to be called
 * remotely, to enable access control and return data directly, asynchronously or
 * opening a stream which delivers data for long running tasks or large data
 * transfers.
 *
 * When registerCore is run with the wish core instance, it reads all objects
 * that have a property named "_". It scans those properties for properties
 * which have a descriptor property with the same name prepended with "_".
 *
 * Sub modules are not implemented yet, but an example should look like the
 * relay, module below.
 *
 * Ex.
 *   rpc.insertMethods({
 *       _doThis: {
 *           doc: "This function does this, and emits progress each second and end.",
 *       },
 *       doThis: function(req,res) {
 *           ...
 *       },
 *       _relay: {
 *           doc: "A bunch of relay related functions"
 *       },
 *       relay: {
 *           _test: {},
 *           test: function() {},
 *           _list: {},
 *           list: function() {}
 *       }
 *   });
 */

import { MethodMap, RequestMap, RequestMessage } from 'src';

const debug = console.log;

export class Server {
    private modules = {}
    private methods = {};
    private requests: RequestMap = {};
    private clientIdCounter = 0;
    /** internal request id counter */
    private requestId = 0;
    /** counting id for rpc invoke function */
    private invokeId = 0;

    constructor (methods?: MethodMap) {
        if(methods) {
            this.insertMethods(methods);
        }
    }

    destroy(): void {
        for(const i in this.requests) {
            for(const j in this.requests[i]) {
                if (typeof this.requests[i][j].end === 'function') {
                    this.requests[i][j].end();
                }
            }
            delete this.requests[i];
        }
    }

    insertMethods(o): void {
        const path = '';
        this.addMethods(path, o);
    }

    addMethods(path: string, o: MethodMap): void {
        //console.log("addMethods", path, o);
        const prefix = path ? path + '.' : '';

        for (const i in o) {
            if( i === '_' ) {
                // module meta
            } else if (i.substring(0, 1) !== '_') {
                if (o['_' + i]) {
                    // publish is _funcName exists for funcName

                    if (typeof o[i] === 'function') {
                        const ip = o['_' + i].name || i;
                        o['_' + i].fullname = prefix + ip;

                        try {
                            this.modules[prefix + ip] = o['_' + i];
                            this.methods[prefix + ip] = o[i];
                        } catch (e) {
                            console.log('Kaboom! ', e);
                        }
                    } else if(typeof o[i] === 'object') {
                        // this is a sub item
                        //this.modules[prefix + i] = o['_' + i];
                        this.addMethods( prefix + i, o[i]);
                    }
                } else {
                    // no _funcName found, do not publish via RPC
                }
            }
        }
    }

    listMethods(args, context, cb): void {
        const result = {};

        function copy(s, filter) {
            const d = {};
            for(const j in s) {
                if(filter[j]) { continue; }
                d[j] = s[j];
            }
            return d;
        }

        const filter = { fullname: true };

        //console.log("no acl.");
        for (const i in this.modules) {
            result[i] = copy(this.modules[i], filter);
        }
        cb(null, result);
    }

    clientOffline(clientId: number): void {
        for(const i in this.requests[clientId]) {
            if (typeof this.requests[clientId][i].end === 'function') {
                this.requests[clientId][i].end();
            }
            //console.log("Ended due to client offline:", this.requests[clientId][i]);
            delete this.requests[clientId][i];
        }
    }

    closeAll(): void {
        for(const i in this.requests) {
            for(const j in this.requests[i]) {
                if (typeof this.requests[i][j].end === 'function') {
                    this.requests[i][j].end();
                }
                //console.log("Ended due to client offline:", this.requests[i][j]);
                delete this.requests[i][j];
            }
        }
    }

    parse(msg: RequestMessage, respond, context, clientId: number): void {
        if(typeof clientId !== 'number') {
            //console.log("Got RPC request from unspecified client, setting clientId to __none.");
            return;
        }

        try {
            if( msg.push ) {
                if(this.requests[clientId] && this.requests[clientId][msg.push]) {
                    this.invokeRaw(msg, respond, this.requests[clientId][msg.push].context, clientId);
                }
                return;
            }
            if( msg.sig ) {
                if(this.requests[clientId] && this.requests[clientId][msg.sig]) {
                    this.invokeRaw(msg, respond, this.requests[clientId][msg.sig].context, clientId);
                }
                return;
            }
            if( msg.end ) {
                const id = msg.end;
                //console.log("end this request:", clientId, id, this.requests[clientId] ? this.requests[clientId][id] : this.requests);

                if(this.requests[clientId] && this.requests[clientId][id]) {
                    if (typeof this.requests[clientId][id].end === 'function') {
                        this.requests[clientId][id].end();
                    }
                    respond({ fin: id });
                    delete this.requests[clientId][id];
                    return;
                }
                if( !this.requests[clientId][id] ) {
                    return; // console.log("No such request...", id, clientId, new Error().stack, this.requests[clientId], this.requests);
                }
                if (typeof this.requests[clientId][id].end === 'function') {
                    this.requests[id].end();
                }
                return;
            }

            if ( msg.op === 'methods' ) {
                this.listMethods(msg.args, context, function(err, data) {
                    respond({ ack: msg.id, data: data });
                });
                return;
            }
            if ( typeof this.methods[msg.op] === 'undefined' ) {
                // service not found
                respond({ err: msg.id, data: { code: 300, msg: 'No method found: '+msg.op } });
                return;
            }

            this.invokeRaw(msg, respond, context, clientId);
        } catch(e) {
            debug('Dynamic RPC failed to execute ', msg.op, e, e.stack);
            try {
                console.log('RPC caught error', e.stack);
                respond({ ack: msg.id, err: msg.id, data: 'caught error in '+msg.op+': '+e.toString(), debug: e.stack });
            } catch(e) {
                respond({ err: msg.id, data: 'rpc', errmsg: e.toString() });
            }
        }
    }

    emit(op: string, data): void {
        for (const client in this.requests) {
            if (this.requests[client]) {
                for (const id in this.requests[client]) {
                    if (this.requests[client][id].op === op) {
                        const { send } = this.requests[client][id];
                        send({ sig: id, data });
                    }
                }
            }
        }
    }

    invokeRaw(msg: RequestMessage, respond, context, clientId): void {
        ++this.requestId;

        if (!this.requests[clientId]) {
            return console.log('Session not opened for client. Use Server.open() first');
        }

        if(msg.push) {
            // we got a sig from client... neat, must be streaming!
            const ctx = this.requests[clientId][msg.push];

            //console.log('stream context:', ctx);

            if (msg.data === null) {
                console.log('msg.data is null:', msg);
                return;
            }

            ctx.data(msg.data);

            return;
        }

        if(msg.sig) {
            // we got a sig from client... neat, must be streaming!
            const ctx = this.requests[clientId][msg.sig];

            // call the actual method
            try {
                this.methods[ctx.op].call(
                    this.requests[clientId][msg.sig],
                    msg.data,
                    {
                        send: (data) => {
                            if(typeof ctx.end === 'function') { ctx.end(); }
                            if(this.requests[clientId][msg.sig]) {
                                delete this.requests[clientId][msg.sig];
                            }
                            respond({ ack: msg.sig, data: data });
                        },
                        emit: (data) => {
                            if(!this.requests[clientId][msg.sig]) {
                                if(typeof ctx.end === 'function') { ctx.end(); }
                            }
                            return respond({ sig: msg.sig, data: data });
                        },
                        error: (data) => {
                            if(typeof ctx.end === 'function') { ctx.end(); }
                            delete this.requests[clientId][msg.sig];
                            respond({ err: msg.sig, data: data });
                        },
                        close: (data) => {
                            if(typeof ctx.end === 'function') { ctx.end(); }
                            delete this.requests[clientId][msg.sig];
                            respond({ fin: msg.sig });
                        }
                    },
                    context);
            } catch(e) {
                console.log('Calling the method in RPC failed:', msg.op, msg.args, e.stack);
                delete this.requests[clientId][msg.sig];
                respond({ err: msg.sig, data: { msg: 'rpc failed during execution of '+msg.op, code: 578 } });
            }

            return;
        }

        if(typeof msg.id === 'undefined') {
            // this is an event
            const reqCtx = {
            };
            this.methods[msg.op].call(
                reqCtx,
                { args: msg.args },
                {
                    send: () => { debug('Trying to send response to event ('+msg.op+'). Dropping.'); },
                    emit: () => { debug('Trying to emit response to event ('+msg.op+'). Dropping.'); },
                    error: () => { debug('Trying to respond with error to event ('+msg.op+'). Dropping.'); },
                    close: () => { debug('Trying to close event ('+msg.op+'). Dropping.'); }
                },
                context);
        } else {
            // this is a regular rpc request
            const reqCtx = {
                id: msg.id,
                op: msg.op,
                args: msg.args,
                context,
                end: null,
                send: respond,
            };

            if(!this.requests[clientId]) { this.requests[clientId] = {}; }
            if(this.requests[clientId][msg.id]) {
                console.log(
                    "Serious warning. There is already a request by that id, we'll kill it off! This session is likely not clean. clientId:",
                    clientId,
                    'msg', msg,
                    'stack trace:', new Error().stack
                );

                if(typeof this.requests[clientId][msg.id].end === 'function') {
                    this.requests[clientId][msg.id].end();
                }
                delete this.requests[clientId][msg.id];
                console.log('Removed old request by same id from same client...');
            }
            this.requests[clientId][msg.id] = reqCtx;

            // call the actual method
            try {
                this.methods[msg.op].call(
                    reqCtx,
                    { args: msg.args },
                    {
                        send: (data) => {
                            if (typeof reqCtx.end === 'function') { reqCtx.end(); }
                            if (this.requests[clientId][msg.id]) {
                                delete this.requests[clientId][msg.id];
                            }
                            respond({ ack: msg.id, data: data });
                        },
                        emit: (data) => {
                            if (!this.requests[clientId][msg.id]) {
                                if(typeof reqCtx.end === 'function') { reqCtx.end(); }
                            }
                            return respond({ sig: msg.id, data: data });
                        },
                        error: (data) => {
                            if (typeof reqCtx.end === 'function') { reqCtx.end(); }
                            delete this.requests[clientId][msg.id];
                            respond({ err: msg.id, data: data });
                        },
                        close: (data) => {
                            if (typeof reqCtx.end === 'function') { reqCtx.end(); }
                            delete this.requests[clientId][msg.id];
                            respond({ fin: msg.id });
                        }
                    },
                    context);
            } catch(e) {
                console.log('Calling the method in RPC failed:', msg.op, msg.args, e.stack);
                delete this.requests[clientId][msg.id];
                respond({ err: msg.id, data: { msg: 'rpc failed during execution of '+msg.op, code: 578 } });
            }
        }
    }

    /*
    invoke(op: string, args: any[], stream: any, cb): void {
        if(typeof stream === 'function') { cb = stream; stream = null; }

        if( !Array.isArray(args) ) {
            args = [args];
        }

        if (typeof cb !== 'function') {
            throw new Error('RPC invoke requires callback function as third argument');
        }

        const msg: RequestMessage = {
            op,
            args,
            stream,
            id: ++this.invokeId
        };
        const context = {
            clientType: 'invoke',
            clientId: 'invokedViaRPCInvoke'
        };

        const response = (reply) => {
            const ctx = { cancel: () => { this.parse({ end: msg.id }, () => { }, {}, 0); }, id: msg.id };
            process.nextTick(() => {
                cb.call(ctx, reply.err ? true : null, reply.data);
            });
        };

        this.parse(msg, response, context, '__invoke');
    }
    */

    close(clientId: number): void {
        for (const i in this.requests[clientId]) {
            if (typeof this.requests[clientId][i].end === 'function') {
                this.requests[clientId][i].end();
            }

            delete this.requests[clientId][i];
        }

        delete this.requests[clientId];
    }

    open(): number {
        const clientId = ++this.clientIdCounter;
        this.requests[clientId] = {};
        return clientId;
    }
}
