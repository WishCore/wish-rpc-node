var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Client(send) {
    var self = this;
    this.write = send;
    this.id = 0;
    this.requests = {};
    
    setTimeout(function() {
        self.request('methods', function(err, data, opts) {
            //console.log("Save these methods.", err, data, opts);
            self.emit('ready');
        });
    });
}

util.inherits(Client, EventEmitter);

Client.prototype.messageReceived = function(msg, next) {
    console.log("RpcClient received message", msg);
    var end = !!(msg.ack || msg.end);
    
    var id = msg.ack || msg.err || msg.sig || msg.end;
    
    var request = this.requests[id];

    if(request && typeof request.cb === 'function') {
        var err;
        if(end) {
            err = true;
            msg.data = { str: 'Request terminated by remote host.', code: 101 };
        } else {
            err = !!msg.err ? msg.data : null;
        }
        request.cb.call(request.context, err, msg.data, end);
    }
    if(end) {
        console.log("deleting this request", id);
        delete this.requests[id];
    }
    setTimeout(next, 250);
};

Client.prototype.request = function(op, args, stream, cb) {
    var self = this;
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
    
    if( cb ) {
        msg.id = ++this.id;
        this.requests[msg.id] = { 
            cb: cb, 
            context: { 
                id: msg.id, 
                cancel: function() { 
                    setTimeout(function() {
                        console.log("timeout", msg.id, self.requests[msg.id]);
                    }, 500);
                    self.write({end: msg.id}); 
                }
            }
        };
    }
    
    this.write(msg);
    
    if(msg.id) {
        return msg.id;
    } else {
        return null;
    }
};

module.exports = {
    Client: Client };
