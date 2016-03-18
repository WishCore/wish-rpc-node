var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Client(send) {
    var self = this;
    this.write = send;
    this.id = 0;
    this.requests = {};
    this.outStreams = {};
    
    setTimeout(function() {
        self.request('methods', function(err, data, opts) {
            //console.log("Save these methods.", err, data, opts);
            self.emit('ready');
        });
    });
}

util.inherits(Client, EventEmitter);

Client.prototype.messageReceived = function(msg, next) {
    //console.log("RpcClient received message", msg);
    if(msg.ack) {
        if(typeof this.requests[msg.ack] === 'function') {
            this.requests[msg.ack](null, msg.data);
        }
    } else if( msg.stop ) {
        
    }
    setTimeout(next, 250);
};

Client.prototype.send = function(id, data) {
    return this.write({ so: id, data: data }); // this.outStreams[id].write(data);
};

Client.prototype.request = function(op, args, stream, cb) {
    if(typeof args === 'function') { cb = args; stream = null; args = null; }
    if(typeof stream === 'function') { cb = stream; stream = null; };
    
    if( !Array.isArray(args) ) {
        args = typeof args === 'undefined' || args === null ? null : [args];
    }
    
    if (typeof cb !== 'function') {
        cb = null;
    }
    
    var msg = {
        op: op
    };
    
    if ( Array.isArray(args) ) {
        msg.args = args;
    }
    
    if( cb || !!stream ) {
        msg.id = ++this.id;
        this.requests[msg.id] = cb;
    }
    
    if( !!stream ) {
        msg.stream = true;
        this.outStreams[msg.id] = stream;
        this.startStream(msg.id, stream);
    }
    
    this.write(msg);
    
    if(msg.id) {
        return msg.id;
    } else {
        return null;
    }
};

Client.prototype.startStream = function(id, input) {
    var self = this;
    input.on('readable', function () {
        console.log("the stream is readable...");
        /*
        var chunk;
        while (null !== (chunk = input.read(8))) {
            self.write({
                so: id,
                data: chunk
            });
        }
        //done();
        */
    });    
};

module.exports = {
    Client: Client };
