
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

var debug = require('debug')('rpc');

// counting id for rpc invoke function
var invokeId = 0;

function RPC() {
    this.modules = {};
    this.methods = {};
    this.selfs = {};
    this.writeStreams = {};
    this.readStreams = {};
    this.acl;
}

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
                        this.selfs[prefix + ip] = o;
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
        if ( msg.so ) {
            //console.log("writing to stream:", msg.data);
            var ok = this.writeStreams[msg.so].write(msg.data);
            if (ok) {
                console.log("We can take more!", msg.so);
            } else {
                console.log('stop stream:', msg.so);
                respond({ stop: msg.so });
                this.writeStreams[msg.so].on('drain', respond.bind({ drain: msg.so }));
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
                
                self.invokeRaw(msg, respond, context);
            });
            return;
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

RPC.prototype.write = function(id, buffer) {
    this.writeStreams[id].write(buffer);
};

RPC.prototype.end = function(id) {
    delete this.writeStreams[id];
};

RPC.prototype.invokeRaw = function(msg, respond, context) {
    var self = this;
    
    //console.log("invokeRaw: ", msg.stream);
    
    if(msg.write) {
        return this.write(msg.write, msg.data);
    } else if (msg.end) {
        return this.end(msg.end);
    }
    
    this.methods[msg.op].call(
        this.selfs[msg.op],
        { 
            args: msg.args,
            pipe: function(writeStream) {
                console.log("Got a write stream for ", msg.op, msg.id);
                self.writeStreams[msg.id] = writeStream;
                //msg.stream.pipe(writeStream);
            }
        }, 
        { send: function(data) {
            respond({ack: msg.id, data: data }); },
          emit: function(data) {
            respond({sig: msg.id, data: data }); },
          error: function(data) {
            respond({err: msg.id, data: data }); },
          close: function(data) {
            respond({close: msg.id }); },
          pipe: function(readStream) {
            console.log("Got a read stream for ", msg.op);
          }
        },
        context);
};

RPC.prototype.invoke = function(op, args, stream, cb) {
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
        id: ++invokeId
    };
    var context = {
        clientType: 'invoke',
        clientId: 'invokedViaRPCInvoke'
    };
    
    var response = function(reply) {
        if ( reply.err ) {
            cb(true, reply.data);
        } else {
            cb(null, reply.data);
        }
    };
    
    this.parse(msg, response, context);
};

module.exports = {
    RPC: RPC
};
