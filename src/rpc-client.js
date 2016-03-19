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
    //console.log("RpcClient received message", msg);
    var end = !!(msg.ack || msg.end);
    
    var id = msg.ack || msg.err || msg.sig;
    
    var request = this.requests[id];

    if(request && typeof request.cb === 'function') {
        request.cb.call(request.context, !!msg.err, msg.data, true);
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
            context: { id: msg.id, cancel: self.write.bind(null, {end: msg.id}) }
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
