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

    var bufferServerWriteInterval;
    var bufferClientWriteInterval;

    before(function (done) {
        rpc = new Server();

        rpc.insertMethods({
            _streamUpload: {},
            streamUpload: function(req, res, context) {
                var filename = req.args[0].filename;
                this.pipe(fs.createWriteStream('./'+filename));
            },
            _streamDownload: {},
            streamDownload: function(req, res, context) {
                var filename = req.args[0].filename;
                fs.createReadStream('./'+filename).pipe(this);
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
                            process.nextTick(function() { context.stream.emit('readable'); });
                            context.emitReadable = false;
                        }
                    }
                } else {
                    // open new stream
                    var duplex = new RpcStream();
                    
                    var read = fs.createReadStream(__dirname + '/support/rsmith_single_blade_of_grass_ds.jpg');
                    var write = fs.createWriteStream(__dirname + '/../stream-out.jpg');
                    duplex.pipe(write);
                    
                    context.stream = duplex;
                    
                    res.emit({_readable: true, _writable: true});
                    context.offset = 0;
                    context.canSend = true;
                    
                    read.on('readable', function () {
                        while ( true ) {
                            if(!context.canSend) {
                                break;
                            }
                            var chunk = read.read(1536);
                            if (chunk === null) {
                                break;
                            }
                            context.canSend = res.emit({ offset: context.offset, payload: chunk});
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

        var clientWriteBuffer = [];
        var serverWriteBuffer = [];

        var bufferedServerWrite = function(data) { 
            serverWriteBuffer.push(data);
            return serverWriteBuffer.length < 500;
        };

        bufferServerWriteInterval = setInterval(function() {
            console.log('serverWrite', serverWriteBuffer.length);
            while(serverWriteBuffer.length > 0) {
                var pushed = client.messageReceived(serverWriteBuffer[0], function() {});
                serverWriteBuffer.shift();
            }
        }, 15);
        

        var bufferedClientWrite = function(data) { 
            clientWriteBuffer.push(data);
            return clientWriteBuffer.length < 500;
        };
        
        bufferClientWriteInterval = setInterval(function() {
            console.log('clientWrite', clientWriteBuffer.length);
            while (clientWriteBuffer.length > 0) {
                var pushed = rpc.parse(clientWriteBuffer[0], bufferedServerWrite, {});
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
        var state = 0;
        var attached = false;
        client.request('stream', [], function(err, data, end) {
            var self = this;
            
            if(data._end) {
                // download stream end signal from server
                this.stream.push(null);
                return;
            }
            
            if(data._uend) {
                // upload stream end signal from server
                console.log("upload complete.");
                return;
            }
            
            switch(state) {
                case 0:
                    if(data._readable) {
                        // server accepts data as stream
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
                    // server delivering data to stream
                    if(data.payload) {
                        this.len += data.payload.length;
                        var canPush = this.stream.push(data.payload);
                        if(!canPush) {
                            if(!attached) {
                                this.stream.on('more', function() { self.emit({_ack: 9999 }); });
                                attached = true;
                            }
                        } else {
                            self.emit({_ack: data.offset});
                        }
                        return canPush;
                    }
                    break;
            }
            return true;
        });
    });


    it('should stream data to a server stream', function(done) {
        client.request('stream', [], function(err, data, end) {
            var self = this;
            this.canSend = true;
            this.offset = 0;
            
            if(data._uack) {
                self.canSend = true;
                self.in.emit('readable');
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

            var len = 0;
            var clientFileStream = fs.createReadStream('./src/rpc-server.js');
            this.in = clientFileStream;
            clientFileStream.on('readable', function() {
                while ( true ) {
                    if(!self.canSend) {
                        break;
                    }
                    var chunk = clientFileStream.read(1536);
                    if (chunk === null) {
                        break;
                    } else {
                        len += chunk.length;
                    }
                    self.canSend = self.emit({ offset: self.offset, payload: chunk});
                    self.offset += chunk.length;
                    if (!self.canSend) {
                        self.emitReadable = true;
                        break;
                    }
                }
            });

            clientFileStream.on('end', function() {
                self.emit({ _end: true });
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
    //console.log('write: ', chunk.length);
    cb();
};
