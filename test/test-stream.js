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
                if(context.stream) {
                    // stream data
                    //console.log("It seems there is an open stream already!", req);
                    var duplex = context.stream;
                    if(req._ack === 0 || req._ack) {
                        //console.log("OOoh and an ack it is!");
                        context.canSend = true;
                        duplex.emit('readable');
                    }
                } else {
                    // open new stream
                    var duplex = new RpcStream();
                    context.stream = duplex;
                    
                    res.emit({_readable: true});
                    context.eof = 300;
                    context.offset = 0;

                    context.canSend = true;

                    duplex.on('readable', function () {
                        if (context.eof <= 0) {
                            duplex.read(16*1024);
                            return;
                        }
                        
                        while ( true ) {
                            if(!context.canSend) {
                                console.log("We have more data to send, but cant push it forward.");
                                break;
                            }
                            var chunk = duplex.read(1536);
                            if (chunk === null) {
                                break;
                            }
                            //console.log("sending chunk", typeof chunk, chunk, chunk.length);
                            context.canSend = res.emit({ offset: context.offset, payload: chunk});
                            context.offset += chunk.length;
                            context.eof--;
                            if (!context.canSend) {
                                console.log("We cant send more... waiting.");
                                break;
                            }
                            if (context.eof <= 0) {
                                //console.log("We have sent everything, we're done!");
                                res.send({ _end: true });
                                break;
                            }
                        }
                    });
                    
                    duplex.on('end', function() {
                        res.send({ _end: true });
                    });
                }
            }
        });

        var clientWriteBuffer = [];
        var serverWriteBuffer = [];

        var bufferedServerWrite = function(data) { 
            //console.log("server: buffered write:", data);
            
            if(serverWriteBuffer.length > 3) {
                //console.log("Write buffer is full.");
                return false;
            }
            
            serverWriteBuffer.push(data);

            var pushed = client.messageReceived(data, function() {});
            
            if(true || pushed) {
                serverWriteBuffer.shift();
            } else {
                console.log("data not accepted by client:", typeof pushed, pushed);
            }
            
            return true;
        };

        var bufferedClientWrite = function(data) { 
            //console.log("client: buffered write:", data);
            
            if(clientWriteBuffer.length > 3) {
                console.log("Write buffer is full.");
                return false;
            }
            
            clientWriteBuffer.push(data);

            var pushed = rpc.parse(clientWriteBuffer[0], bufferedServerWrite, {});
            
            clientWriteBuffer.shift();

            //console.log("rpc.parse returned:", pushed);

            return true;
        };
        
        client = new Client(bufferedClientWrite, { mtu: 128 });
        
        done();
    });


    it('should stream data to a client file stream', function(done) {
        var state = 0;
        client.request('stream', [], function(err, data, end) {
            var self = this;
            //console.log("stream", err, data, end);
            
            switch(state) {
                case 0:
                    if(data._readable) {
                        //console.log("We got a stream response.");
                        state = 1;
                        this.stream = new RpcClientStream();
                        var out = fs.createWriteStream('./test-stream.data');
                        out.on('close', function() { done(); });
                        this.stream.pipe(out);
                        this.len = 0;
                    }
                    break;
                case 1:
                    //console.log("reading a stream...", data, 'context:', this);
                    setTimeout(function() { self.emit({_ack: data.offset}); }, 189);
                    if(data.payload) {
                        this.len += data.payload.length;
                        //console.log("got more payload", data.payload, data.payload.length, this.len);
                        //msg += data.payload.toString();
                        var canPush = this.stream.push(data.payload);
                        if(!canPush) {
                            console.log("we can't push more to the read stream. STOP!");
                        } else {
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

var len = 0;

RpcStream.prototype._read = function(n) {
    //console.log("reading data, ", n, 'bytes');
    var self = this;
    var curlen = 0;
    while (true) {
        var chunk = new Buffer(new Date().toString()+'\n');
        len += chunk.length;
        curlen += chunk.length;
        //console.log("got a chunk", chunk.length, len);
        if (len > 256 * 1000) {
            //console.log("We have pushed everything to read buffers:", len, 'bytes');
            self.push(null);
            break;
        }
        if (!self.push(chunk) || curlen > 256 * 4) {
            //console.log("stop writing to read buffer");
            break; // false from push, stop reading
        }
    }
};

/* for write stream just ouptut to stdout */
RpcStream.prototype._write = function (chunk, enc, cb) {
    console.log('write: ', chunk.toString());
    cb();
};

/*
 duplex.write('Hello \n');
 duplex.write('World');
duplex.end();
*/


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
    //console.log("ClientStream wanting ", n, 'bytes'); //, this._readableState);
};
