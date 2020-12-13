import { createReadStream, createWriteStream } from 'fs';
import { Client } from 'src/rpc-client';
import { Server } from 'src/rpc-server';
import { Duplex } from 'stream';

describe('RPC Stream Control', function () {

    let rpc;
    let client;

    let bufferServerWriteInterval;
    let bufferClientWriteInterval;

    before(function (done) {
        rpc = new Server();

        rpc.insertMethods({
            _streamUpload: {},
            streamUpload: function(req, res, context) {
                const filename = req.args[0].filename;
                this.pipe(createWriteStream('./'+filename));
            },
            _streamDownload: {},
            streamDownload: function(req, res, context) {
                const filename = req.args[0].filename;
                createReadStream('./'+filename).pipe(this);
            },
            _stream: {},
            stream: function(req, res, context) {
                if (context.stream) {
                    // stream data
                    if(req.payload) {
                        context.stream.push(req.payload);
                        res.emit({ _uack: true });
                        return;
                    }
                    if(req._end) {
                        //console.log("In streaming mode and got _end signal.", context.stream);
                        context.stream.push(null);
                        res.send({ _uend: true });
                    }
                    if(req._ack === 0 || req._ack) {
                        context.canSend = true;
                        if(context.emitReadable) {
                            process.nextTick(function() { context.stream.emit('readable'); });
                            context.emitReadable = false;
                        }
                    }
                } else {
                    // open new stream
                    const duplex = new RpcStream();

                    const read = createReadStream(__dirname + '/support/rsmith_single_blade_of_grass_ds.jpg');
                    const write = createWriteStream(__dirname + '/../stream-out.jpg');
                    duplex.pipe(write);

                    context.stream = duplex;

                    res.emit({ _readable: true, _writable: true });
                    context.offset = 0;
                    context.canSend = true;

                    read.on('readable', function () {
                        for (;;) {
                            if(!context.canSend) {
                                break;
                            }
                            const chunk = read.read(1536);
                            if (chunk === null) {
                                break;
                            }
                            context.canSend = res.emit({ offset: context.offset, payload: chunk });
                            context.offset += chunk.length;
                            if (!context.canSend) {
                                context.emitReadable = true;
                                break;
                            }
                        }
                    });

                    read.on('end', function() {
                        //console.log("End. No more readable signals needed....");
                        res.emit({ _end: true });
                    });
                }
            }
        });

        const clientWriteBuffer = [];
        const serverWriteBuffer = [];

        const bufferedServerWrite = function(data) {
            serverWriteBuffer.push(data);
            return serverWriteBuffer.length < 500;
        };

        bufferServerWriteInterval = setInterval(function() {
            //console.log('serverWrite', serverWriteBuffer.length);
            while(serverWriteBuffer.length > 0) {
                client.messageReceived(serverWriteBuffer[0], () => { /**/ });
                serverWriteBuffer.shift();
            }
        }, 15);


        const bufferedClientWrite = function(data) {
            clientWriteBuffer.push(data);
            return clientWriteBuffer.length < 500;
        };

        bufferClientWriteInterval = setInterval(function() {
            //console.log('clientWrite', clientWriteBuffer.length);
            while (clientWriteBuffer.length > 0) {
                rpc.parse(clientWriteBuffer[0], bufferedServerWrite, {});
                clientWriteBuffer.shift();
            }
        }, 15);

        client = new Client(bufferedClientWrite, { mtu: 128 });

        done();
    });

    after(function(done) {
        clearInterval(bufferServerWriteInterval);
        clearInterval(bufferClientWriteInterval);
        done();
    });


    it('should stream data to a client file stream', function(done) {
        let state = 0;
        let attached = false;
        client.request('stream', [], function(err, data, end) {
            if(data._end) {
                // download stream end signal from server
                this.stream.push(null);
                return;
            }

            if(data._uend) {
                // upload stream end signal from server
                console.log('upload complete.');
                return;
            }

            switch(state) {
                case 0:
                    if(data._readable) {
                        // server accepts data as stream
                        state = 1;
                        this.stream = new RpcClientStream();
                        const out = createWriteStream('./test-stream.data');
                        out.on('close', function() { done(); });
                        this.stream.pipe(out);
                        this.len = 0;
                        return true;
                    }
                    break;
                case 1:
                    // server delivering data to stream
                    if(data.payload) {
                        this.len += data.payload.length;
                        const canPush = this.stream.push(data.payload);
                        if(!canPush) {
                            if(!attached) {
                                this.stream.on('more', () => { this.emit({ _ack: 9999 }); });
                                attached = true;
                            }
                        } else {
                            this.emit({ _ack: data.offset });
                        }
                        return canPush;
                    }
                    break;
            }
            return true;
        });
    });


    it('should stream data to a server stream', function(done) {
        client.request('stream', [], (err, data, end) => {
            this.canSend = true;
            this.offset = 0;

            if(data._uack) {
                this.canSend = true;
                this.in.emit('readable');
                return;
            }

            if(!data._writable) {
                if(data._readable || data._end || data.payload) {
                    // we are not interested in the server stream
                    return;
                }
            }

            if(data._uend) {
                done();
                return;
            }

            const clientFileStream = createReadStream('./src/rpc-server.js');
            this.in = clientFileStream;
            clientFileStream.on('readable', () => {
                for (;;) {
                    if(!this.canSend) {
                        break;
                    }
                    const chunk = clientFileStream.read(1536);
                    if (chunk === null) {
                        break;
                    }
                    this.canSend = this.emit({ offset: this.offset, payload: chunk });
                    this.offset += chunk.length;
                    if (!this.canSend) {
                        this.emitReadable = true;
                        break;
                    }
                }
            });

            clientFileStream.on('end', function() {
                this.emit({ _end: true });
            });

            return true;
        });
    });

    /*
    it('should stream data to a server stream', function(done) {
        client.request('stream', ['this is my file'], function(err, data, end) {
            fs.createReadStream('./4k-dji-video.mp4').pipe(this);
        });
    });
    */
});



/**
 * Duplex stream which:
 *  - generates current time every sec for rstream
 *  - outputs the write stream to stdout
 *
 * Stop the read stream by calling stopTimer
 */
class RpcStream extends Duplex {
    constructor(options?) {
        super(options);
    }

    _read = function(n) {
        //console.log("reading data, ", n, 'bytes');
    };

    /* for write stream just ouptut to stdout */
    _write = function (chunk, enc, cb) {
        console.log('====== write:', chunk.length);
        cb();
    };
}

/**
 * Duplex stream which:
 *  - generates current time every sec for rstream
 *  - outputs the write stream to stdout
 *
 * Stop the read stream by calling stopTimer
 */
class RpcClientStream extends Duplex {
    constructor(options?) {
        super(options);
    }

    _read = function(n) {
        //console.log("in read reading: ", this._readableState.reading);
        this.emit('more');
    };

    _write = function (chunk, enc, cb) {
        //console.log('write: ', chunk.length);
        cb();
    };
}
