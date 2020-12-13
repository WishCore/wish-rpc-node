import { EventEmitter } from 'events';
import { RequestMessage, ResponseMessage } from 'src';

interface RequestMap {
    [requestId: string]: any
}

export class Client extends EventEmitter {
    private requests: RequestMap = {};
    private id = 0;
    private mtu = 65535;

    constructor(private write: (msg: ResponseMessage) => void, opts?: { mtu: number }) {
        super();

        if(opts && opts.mtu) {
            this.mtu = opts.mtu;
        }
    }

    destroy(): void {
        this.requests = null;
        this.write = null;
    }

    messageReceived(msg): void {
        //console.log("RpcClient received message", msg);
        const end = !!(msg.err || msg.ack || msg.fin);

        const id = msg.ack || msg.err || msg.sig || msg.fin;

        const request = this.requests[id];
        let retval;

        if(request && typeof request.cb === 'function') {
            let err;
            if(msg.fin) {
                // This request closed gracefully
                request.cb.call(request.context, null, null, true);
            } else {
                if(request.canceled) {
                    console.log('This request is canceled. Not calling the callback.');
                } else {
                    // all is good, call the callback function
                    err = msg.err ? msg.data : null;
                    retval = request.cb.call(request.context, err, msg.data, end);
                }
            }
        }

        if(end) {
            //console.log("deleting this request", id);
            delete this.requests[id];
        }

        return retval;
    }

    request(op: string, args: any[], cb?): number | null | Promise<any> {
        this.id++;
        if (typeof cb !== 'function') {
            return new Promise((resolve, reject) => {
                resolve(this.id);
            });
        }

        const msg: RequestMessage = { op };

        if ( Array.isArray(args) ) {
            msg.args = args;
        }

        if (cb) {
            //console.log("we have a cb.", cb, new Error().stack);
            msg.id = this.id;
            this.requests[msg.id] = {
                cb,
                context: {
                    id: msg.id,
                    cancel: () => {
                        setTimeout( ((id) => {
                            return () => {
                                if(this.requests[id]) {
                                    console.log(
                                        'rpc-client.js: timeout, the request has not been removed while it was canceled',
                                        id, this.requests[id]
                                    );
                                }
                            };
                        })(msg.id), 1500);
                        this.requests[msg.id].canceled = true;
                        this.write({ end: msg.id });
                    },
                    emit: (data) => {
                        return this.write({ sig: msg.id, data: data });
                    }
                }
            };
        }

        this.write(msg);

        return msg.id || null;
    }

    send(id: number, data): void {
        this.write({ push: id, data });
    }

    end(id: number): void {
        this.write({ end: id });
    }
}
