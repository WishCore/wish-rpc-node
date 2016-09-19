
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
    this.requestId = 0; // internal request id counter
    this.invokeId = 0; // counting id for rpc invoke function
    this.acl;
    if(methods) {
        this.insertMethods(methods);
    }
}

util.inherits(RPC, EventEmitter);

RPC.prototype.destroy = function() {
    for(var i in this.requests) {
        for(var j in this.requests[i]) {
            if (typeof this.requests[i][j].end === 'function') {
                this.requests[i][j].end();
            }
        }
        delete this.requests[i];
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

                        var acl = this.modules[prefix + ip].acl;
                        var public = this.modules[prefix + ip].public;
                        
                        // public property is deprecated, use acl = false instead
                        if(public) { delete this.modules[prefix + ip]['public']; }
                        
                        if (acl === false || public === true) {
                            // access control is explicitly disabled, allow access
                            this.modules[prefix + ip].acl = false;
                            //console.log("This is public:", prefix+ip);
                        } else if( acl === true || typeof acl === 'undefined' ) {
                            this.modules[prefix + ip].acl = ['_call']; 
                            //console.log("This requires permission:", prefix+ip);
                        }

                        if( Array.isArray(acl) ) { if(acl.indexOf('_call')===-1) { this.modules[prefix + ip].acl.push('_call'); } };
                        
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
            try {
                if(self.modules[i].acl === false) {
                    // access control is explicitly disabled, allow access
                    result[i] = copy(self.modules[i], filter);
                    return checkAcl();
                } else if (Array.isArray(self.modules[i].acl)) {
                    self.acl(i, self.modules[i].acl, context, function(err, allowed, permissions) {
                        if(err || !allowed) { checkAcl(); return; }
                        //console.log("added:", i);
                        result[i] = copy(self.modules[i], filter);
                        checkAcl();
                    });
                } else {
                    // not false or array: deny
                    checkAcl();
                }
            } catch(e) {
                console.log("rpc-server.js/listMethods, failed acl check", e, e.stack);
                checkAcl();
            }
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

RPC.prototype.clientOffline = function(clientId) {
    for(var i in this.requests[clientId]) {
        if (typeof this.requests[clientId][i].end === 'function') {
            this.requests[clientId][i].end();
        }
        //console.log("Ended due to client offline:", this.requests[clientId][i]);
        delete this.requests[clientId][i];
    }
};

RPC.prototype.closeAll = function() {
    for(var i in this.requests) {
        for(var j in this.requests[i]) {
            if (typeof this.requests[i][j].end === 'function') {
                this.requests[i][j].end();
            }
            //console.log("Ended due to client offline:", this.requests[i][j]);
            delete this.requests[i][j];
        }
    }
};

RPC.prototype.parse = function(msg, respond, context, clientId) {
    var self = this;

    if(!clientId || typeof clientId !== 'string') {
        //console.log("Got RPC request from unspecified client, setting clientId to __none.");
        clientId = '__none';
    }
    
    try {
        if( msg.end ) {
            var id = msg.end;
            //console.log("end this request:", clientId, id, this.requests[clientId] ? this.requests[clientId][id] : this.requests);
            
            if(this.requests[clientId] && this.requests[clientId][id]) {
                if (typeof this.requests[clientId][id].end === 'function') {
                    this.requests[clientId][id].end();
                }
                console.log("request to end", id);
                respond({ fin: id });
                delete this.requests[clientId][id];
                self.emit('ended', id);
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
                respond({ack: msg.id, data: data});
            });            
            return;
        }
        if ( typeof this.methods[msg.op] === "undefined" ) {
            // service not found
            respond({ack: msg.id, err: msg.id, data: { code: 300, msg: "No method found: "+msg.op } });
            return;
        } else if ( typeof this.acl === 'function' ) {
            if( this.modules[msg.op].acl === false ) {
                // no access control just invoke
                context.acl = {};
                self.invokeRaw(msg, respond, context, clientId);
            } else {
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

                    process.nextTick(function() { self.invokeRaw(msg, respond, context, clientId); });
                });
            }
        } else {
            // no access control, just invoke
            self.invokeRaw(msg, respond, context, clientId);
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

RPC.prototype.invokeRaw = function(msg, respond, context, clientId) {
    var self = this;
    var requestId = ++this.requestId;
    
    if(!clientId || typeof clientId !== 'string') {
        console.log("rpc-server.js/invokeRaw: Got RPC request from unspecified client, setting clientId to __none.", clientId, new Error().stack);
        clientId = '__none';
    }

    var acl = function (resource, permission, cb) {
        if(!Array.isArray(permission)) {
            permission = [permission];
        }
        //console.log("ACL check on", arguments);
        self.acl(resource, permission, context, function (err, allowed, permissions) {
            //console.log("   rpc-server: permissions:", context, resource, permissions);
            cb(err, allowed, permissions);
        });
    };

    if(typeof msg.id === 'undefined') {
        // this is an event
        var reqCtx = { 
            acl: acl
        };
        this.methods[msg.op].call(
            reqCtx,
            { args: msg.args },
            {
                send: function() { debug("Trying to send response to event ("+msg.op+"). Dropping."); },
                emit: function() { debug("Trying to emit response to event ("+msg.op+"). Dropping."); },
                error: function() { debug("Trying to respond with error to event ("+msg.op+"). Dropping."); },
                close: function() { debug("Trying to close event ("+msg.op+"). Dropping."); }
            },
            context);
    } else {
        // this is a regular rpc request
        var reqCtx = { 
            id: msg.id,
            op: msg.op,
            args: msg.args,
            end: null,
            acl: acl
        };
        
        if(!this.requests[clientId]) { this.requests[clientId] = {}; }
        if(this.requests[clientId][msg.id]) {
            console.log("Serious warning. There is already a request by that id, we'll kill it off! This session is likely not clean. clientId:", clientId, 'msg', msg);
            if(typeof this.requests[clientId][msg.id].end === 'function') {
                this.requests[clientId][msg.id].end();
            }
            delete this.requests[clientId][msg.id];
            console.log("Removed old request by same id from same client...");
        }
        this.requests[clientId][msg.id] = reqCtx;
        
        // call the actual method
        try {
            this.methods[msg.op].call(
                reqCtx,
                { args: msg.args },
                {
                    send: function(data) {
                        if(typeof reqCtx.end === 'function') { reqCtx.end(); }
                        self.emit('ended', msg.id);

                        if(self.requests[clientId][msg.id]) {
                            delete self.requests[clientId][msg.id];
                        }
                        respond({ ack: msg.id, data: data });
                    },
                    emit: function(data) {
                        if(!self.requests[clientId][msg.id]) {
                            if(typeof reqCtx.end === 'function') { reqCtx.end(); }
                        }
                        respond({ sig: msg.id, data: data }); 
                    },
                    error: function(data) {
                        if(typeof reqCtx.end === 'function') { reqCtx.end(); }
                        self.emit('ended', msg.id);
                        delete self.requests[clientId][msg.id];
                        respond({ err: msg.id, data: data }); 
                    },
                    close: function(data) {
                        if(typeof reqCtx.end === 'function') { reqCtx.end(); }
                        self.emit('ended', msg.id);
                        delete self.requests[clientId][msg.id];
                        respond({ fin: msg.id }); 
                    }
                },
                context);
        } catch(e) {
            console.log("Calling the method in RPC failed:", msg.op, msg.args, e.stack);
            delete self.requests[clientId][msg.id];
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
    
    this.parse(msg, response, context, '__invoke');
};

module.exports = {
    Server: RPC
};
