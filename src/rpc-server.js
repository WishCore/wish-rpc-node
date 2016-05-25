
/**
 * The idea is to be able to easily register methods/functions to be called 
 * remotely, to enable access control and return data directly, asyncronoulsy or
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

var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('rpc');
var util = require('util');

function RPC(methods) {
    this.modules = {};
    this.methods = {};
    //this.selfs = {};
    this.requests = {};
    // counting id for rpc invoke function
    this.invokeId = 0;
    this.acl;
    if(methods) {
        this.insertMethods(methods);
    }
}

util.inherits(RPC, EventEmitter);

RPC.prototype.destroy = function() {
    for(var i in this.requests) {
        if (typeof this.requests[i].end === 'function') {
            this.requests[i].end();
        }
    }
};

RPC.prototype.insertMethods = function(o) {
    var path = '';
    this.addMethods(path, o);
};

RPC.prototype.addMethods = function(path, o) {
    //console.log("addMethods", path, o);
    var prefix = (path?path+'.':'');
    for (var i in o) {
        if( i === '_' ) {
            // module meta
        } else if (i.substring(0, 1) !== '_') {
            if (o['_' + i]) {
                // publish is _funcName exists for funcName
                
                if (typeof o[i] === 'function') {
                    var ip = o['_' + i].name || i;
                    o['_' + i].fullname = prefix + ip;

                    try {
                        this.modules[prefix + ip] = o['_' + i];
                        this.methods[prefix + ip] = o[i];
                        //this.selfs[prefix + ip] = o;
                    } catch (e) {
                        console.log("Kaboom! ", e);
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
};

/**
 * plugin: function(resource, acl, context, cb) { cb(err, allowed, permissions) }
 * plugin: function('core.login', { access: true }, { custom data }, cb) { cb(err, allowed, permissions) }
 */
RPC.prototype.accessControl = function(plugin) {
    this.acl = plugin;
};

RPC.prototype.listMethods = function(args, context, cb) {
    var self = this;
    var result = {};
    
    function copy(s, filter) {
        var d = {}; 
        var filter = { 'fullname': true };
        for(var j in s) {
            if(filter[j]) { continue; }
            d[j] = s[j];
        }
        return d;
    }

    var filter = { 'fullname': true };

    if(typeof this.acl === 'function') {
        var l = [];
        for (var i in this.modules) {
            l.push(i);
        }

        function checkAcl() {
            var i = l.pop();
            //console.log("checkAcl", i);
            
            if(!i) {
                // we're done
                //console.log("yoman:", result);
                return cb(null, result);
            }
            
            //console.log("acl--:", i, self.modules[i].acl, context);
            self.acl(i, self.modules[i].acl, context, function(err, allowed, permissions) {
                if(err || !allowed) { checkAcl(); return; }
                //console.log("added:", i);
                result[i] = copy(self.modules[i], filter);
                checkAcl();
            });
        }

        checkAcl();
    } else {
        //console.log("no acl.");
        for (var i in this.modules) {
            result[i] = copy(this.modules[i], filter);
        }
        cb(null, result);
    }
};

RPC.prototype.parse = function(msg, respond, context) {
    var self = this;
    try {
        if( msg.end ) {
            var id = msg.end;
            //console.log("end this request:", this.requests[id], id);
            if( !this.requests[id] ) {
                return console.log("No such request...", id);
            }
            if (typeof this.requests[id].end === 'function') {
                this.requests[id].end();
            }
            respond({ end: id });
            delete this.requests[id];
            self.emit('ended', id);
            return;
        }
        
        if ( msg.op === 'methods' ) {
            this.listMethods(msg.args, context, function(err, data) {
                respond({ack: msg.id, data: data});
            });            
            return;
        }
        if ( typeof this.methods[msg.op] === "undefined" ) {
            // service not found
            respond({ack: msg.id, err: msg.id, data: { code: 300, msg: "No method found: "+msg.op } });
            return;
        } else if ( typeof this.acl === 'function' && !this.modules[msg.op].public ) {
            this.acl(this.modules[msg.op].fullname, this.modules[msg.op].acl, context, function(err, allowed, permissions) {
                if(err) {
                    return respond({ack: msg.id, err: msg.id, data: { code: 301, msg: "Access control error: "+msg.op } });
                } else if (!allowed) {
                    return respond({ack: msg.id, err: msg.id, data: { code: 302, msg: "Permission denied: "+msg.op } });
                }

                context.permissions = {};
                if(permissions) {
                    for(var i in permissions) {
                        context.permissions[permissions[i]] = true;
                    }
                }
                
                process.nextTick(function() { self.invokeRaw(msg, respond, context); });
            });
            return;
        } else if (this.modules[msg.op].public) {
            // no access control, just invoke
            context.acl = {};
            self.invokeRaw(msg, respond, context);
        } else {
            // no access control, just invoke
            self.invokeRaw(msg, respond, context);
        }
    } catch(e) {
        debug("Dynamic RPC failed to execute ", msg.op, e, e.stack);
        try {
            console.log("RPC caught error", e.stack);
            respond({ack: msg.id, err: msg.id, data: 'caught error in '+msg.op+': '+e.toString(), debug: e.stack});
        } catch(e) {
            respond({err: msg.id, data: "rpc", errmsg:e.toString()});
        }
    }
};

// emit event to client
/*
RPC.prototype.emit = function(client, event, payload) {
    this.clients[client]
};
*/

RPC.prototype.invokeRaw = function(msg, respond, context) {
    var self = this;

    var acl = function (resource, permission, cb) {
        //console.log("ACL check on", arguments);
        self.acl(resource, [permission], context, function (err, allowed, permissions) {
            //console.log("   rpc-server: permissions:", permissions);
            cb(err, allowed, permissions);
        });
    };

    if(typeof msg.id === 'undefined') {
        // this is an event
        var reqCtx = { 
            acl: acl
        };
        this.methods[msg.op].call(
            null,
            { args: msg.args },
            {
                send: function() { console.log("Trying to send response to event ("+msg.op+"). Dropping."); },
                emit: function() { console.log("Trying to emit response to event ("+msg.op+"). Dropping."); },
                error: function() { console.log("Trying to respond with error to event ("+msg.op+"). Dropping."); },
                close: function() { console.log("Trying to close event ("+msg.op+"). Dropping."); }
            },
            context);
    } else {
        // this is a regular rpc request
        var reqCtx = { 
            id: msg.id, 
            end: null,
            acl: acl
        };
        this.requests[msg.id] = reqCtx;

        // call the actual method
        try {
            this.methods[msg.op].call(
                reqCtx,
                { args: msg.args },
                { 
                    send: function(data) {
                        if(!self.requests[msg.id]) {
                            throw new Error('No such request is active.');
                        }
                        self.emit('ended', msg.id);

                        if(self.requests[msg.id]) {
                            delete self.requests[msg.id];
                        } else {
                            console.log("deleting non-existing request:", msg.op, msg);
                        }
                        respond({ ack: msg.id, data: data }); 
                    },
                    emit: function(data) {
                        if(!self.requests[msg.id]) {
                            console.log("emitting on nonexisting:", msg.id, self.requests);
                            throw new Error('No such request is active. '+msg.id);
                        }
                        respond({ sig: msg.id, data: data }); 
                    },
                    error: function(data) {
                        if(!self.requests[msg.id]) {
                            throw new Error('No such request is active.');
                        }
                        self.emit('ended', msg.id);
                        delete self.requests[msg.id];
                        respond({ err: msg.id, data: data }); 
                    },
                    close: function(data) {
                        if(!self.requests[msg.id]) {
                            throw new Error('No such request is active.');
                        }
                        self.emit('ended', msg.id);
                        delete self.requests[msg.id];
                        respond({ end: msg.id }); 
                    }
                },
                context);
        } catch(e) {
            console.log("Calling the method in RPC failed:", msg.op, msg.args, e.stack);
            respond({ err: msg.id, data: { msg: 'rpc failed during execution of '+msg.op, code: 578 } });
        }
    }
};

RPC.prototype.invoke = function(op, args, stream, cb) {
    var self = this;
    if(typeof stream === 'function') { cb = stream; stream = null; };
    
    if( !Array.isArray(args) ) {
        args = [args];
    }
    
    if (typeof cb !== 'function') {
        throw new Error('RPC invoke requires callback function as third argument');
    }
    
    var msg = {
        op: op,
        args: args,
        stream: stream,
        id: ++this.invokeId
    };
    var context = {
        clientType: 'invoke',
        clientId: 'invokedViaRPCInvoke'
    };
    
    var response = function(reply) {
        var ctx = { cancel: function() { self.parse({ end: msg.id }, function(){}); }, id: msg.id };
        process.nextTick(function() {
            cb.call(ctx, reply.err ? true : null, reply.data); 
        });
    };
    
    this.parse(msg, response, context);
};

module.exports = {
    Server: RPC
};
