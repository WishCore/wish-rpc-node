var Server = require('../src/index.js').Server;
var Client = require('../src/index.js').Client;
var assert = require('assert');
var stream = require('stream');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

var util = require('util');
var Duplex = require('stream').Duplex;

describe('RPC Stream Control', function () {

    var rpc;
    var client;

    before(function (done) {
        rpc = new Server();

        rpc.insertMethods({
            _stream: {},
            stream: function(req, res, context) {
                if (context.stream) {
                    // stream data
                    if(req.payload) {
                        //console.log("Got some payload from client", req.payload.length);
                        //context.stream.write(req.payload);
                        var pushed = context.stream.push(req.payload);
                        
                        //console.log("  * Pushed is ", pushed);
                        
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
                            process.nextTick(function() { context.stream.emit('readable'); });
                            context.emitReadable = false;
                        }
                    }
                } else {
                    // open new stream
                    var duplex = new RpcStream();
                    
                    var read = fs.createReadStream('/home/akaustel/mist-ui-2015-11-17.png');
                    var write = fs.createWriteStream('./another.data');
                    //read.pipe(duplex);
                    duplex.pipe(write);
                    
                    context.stream = duplex;
                    
                    res.emit({_readable: true, _writable: true});
                    context.offset = 0;
                    context.canSend = true;

                    duplex.on('readable', function () {
                        console.log("The duplex says readable!");
                    });

                    read.on('readable', function () {
                        console.log("source stream readable.", context.offset);
                        while ( true ) {
                            if(!context.canSend) {
                                //console.log("We have more data to send, but cant push it forward. Waiting for ack.");
                                break;
                            }
                            var chunk = read.read(1536);
                            if (chunk === null) {
                                console.log("no more data to send");
                                break;
                            } else {
                                console.log("more data to send", chunk.length);
                            }
                            //console.log("sending chunk", typeof chunk, chunk, chunk.length, context.offset);
                            context.canSend = res.emit({ offset: context.offset, payload: chunk});
                            context.offset += chunk.length;
                            //context.eof--;
                            if (!context.canSend) {
                                //console.log("We cant send more... waiting.");
                                context.emitReadable = true;
                                break;
                            }
                        }
                    });
                    
                    read.on('end', function() {
                        console.log("End. No more readable signals needed....");
                        res.emit({ _end: true });
                    });
                }
            }
        });

        var clientWriteBuffer = [];
        var serverWriteBuffer = [];

        var bufferedServerWrite = function(data) { 
            //console.log("serverWrite", data);
            serverWriteBuffer.push(data);
            return serverWriteBuffer.length < 500;
        };

        setInterval(function() {
            var it = 0;

            while(serverWriteBuffer.length > 0) {
                //console.log("serverWrite iterations", ++it);
                var pushed = client.messageReceived(serverWriteBuffer[0], function() {});

                //if(pushed) {
                    serverWriteBuffer.shift();
                //} else {
                    //console.log("data not accepted by client:", typeof pushed, pushed);
                //    break;
                //}
            }
        }, 15);
        

        var bufferedClientWrite = function(data) { 
            //console.log("clientWrite", data);
            clientWriteBuffer.push(data);
            return clientWriteBuffer.length < 500;
        };
        
        setInterval(function() {
            while (clientWriteBuffer.length > 0) {
                //console.log("pushing data to server:", clientWriteBuffer[0]);
                var pushed = rpc.parse(clientWriteBuffer[0], bufferedServerWrite, {});
                //console.log("shifting clientWriteBuffer");
                clientWriteBuffer.shift();
            }
        }, 15);
        
        client = new Client(bufferedClientWrite, { mtu: 128 });
        
        done();
    });


    it('should stream data to a client file stream', function(done) {
        var state = 0;
        var attached = false;
        client.request('stream', [], function(err, data, end) {
            var self = this;
            console.log("stream", err, data, end);
            
            if(data._end) {
                console.log("we got an end stream signal, should we do something funny?");
                this.stream.push(null);
                return;
            }
            
            switch(state) {
                case 0:
                    if(data._readable) {
                        console.log("We got a stream response.");
                        state = 1;
                        this.stream = new RpcClientStream();
                        var out = fs.createWriteStream('./test-stream.data');
                        out.on('close', function() { done(); });
                        this.stream.pipe(out);
                        this.len = 0;
                        return true;
                    }
                    break;
                case 1:
                    //console.log("reading a stream...", data, 'context:', this);
                    if(data.payload) {
                        this.len += data.payload.length;
                        //console.log("got more payload", data.payload, data.payload.length, this.len);
                        //msg += data.payload.toString();
                        var canPush = this.stream.push(data.payload);
                        if(!canPush) {
                            //console.log("we can't push more to the read stream. STOP!");
                            //console.log('cant push state:', this.stream._readableState.reading);
                            if(!attached) {
                                this.stream.on('more', function() { self.emit({_ack: 9999 }); });
                                attached = true;
                            }
                        } else {
                            self.emit({_ack: data.offset});
                            //console.log('read stream can take more data. Pushed:', data.payload.length, 'bytes');
                        }
                        return canPush;
                    }
                    break;
            }
            
            
            if(end) {
                console.log("Done. Saved to test-stream.data. We got this much data:\n", err, data, this.len);
                this.stream.push(null);
                this.stream.emit('readable');
                //done();
            }
            return true;
        });
    });


    it('should stream data to a server stream', function(done) {
        client.request('stream', [], function(err, data, end) {
            var self = this;
            this.canSend = true;
            this.offset = 0;
            
            if(!data._writable) {
                if(data._readable || data._end || data.payload) {
                    // we are not interested in the server stream 
                    return;
                }
            }
            
            console.log("client stream callback", err, data, end);

            if(end) {
                console.log("Done. Saved to test-stream.data. We got this much data:\n", err, data, this.len);
                //this.stream.push(null);
                //this.stream.emit('readable');
                done();
                return;
            }

            var len = 0;
            var clientFileStream = fs.createReadStream('./src/rpc-server.js');
            clientFileStream.on('readable', function() {
                console.log("source stream readable on client side", self.offset);
                while ( true ) {
                    if(!self.canSend) {
                        console.log("We have more data to send, but cant push it forward. Waiting for ack.");
                        break;
                    }
                    var chunk = clientFileStream.read(1536);
                    if (chunk === null) {
                        break;
                    } else {
                        len += chunk.length;
                    }
                    //console.log("sending chunk", typeof chunk, chunk, chunk.length, self.offset);
                    self.canSend = self.emit({ offset: self.offset, payload: chunk});
                    self.offset += chunk.length;
                    if (!self.canSend) {
                        //console.log("We cant send more... waiting.");
                        self.emitReadable = true;
                        break;
                    }
                }
            });

            clientFileStream.on('end', function() {
                console.log("End. No more readable signals needed....");
                self.emit({ _end: true });
            });
                
            return true;
        });
    });
});



/**
 * Duplex stream which:
 *  - generates current time every sec for rstream
 *  - outputs the write stream to stdout
 *
 * Stop the read stream by calling stopTimer
 */
function RpcStream(options) {
    Duplex.call(this, options); // init
}

util.inherits(RpcStream, Duplex);

RpcStream.prototype._read = function(n) {
    //console.log("reading data, ", n, 'bytes');
};

/* for write stream just ouptut to stdout */
RpcStream.prototype._write = function (chunk, enc, cb) {
    console.log('====== write:', chunk.length);
    cb();
};


/**
 * Duplex stream which:
 *  - generates current time every sec for rstream
 *  - outputs the write stream to stdout
 *
 * Stop the read stream by calling stopTimer
 */
function RpcClientStream(options) {
    Duplex.call(this, options); // init
}

util.inherits(RpcClientStream, Duplex);

RpcClientStream.prototype._read = function(n) {
    //console.log("in read reading: ", this._readableState.reading);
    this.emit('more');
};

RpcClientStream.prototype._write = function (chunk, enc, cb) {
    console.log('write: ', chunk.toString());
    cb();
};
