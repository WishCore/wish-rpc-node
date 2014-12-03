
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
 *   core.module = { 
 *      _: { name: 'MyModule' } 
 *      _doThis: { 
 *          doc: "This function does this, and emits progress each second and end.", 
 *          type: 'process' 
 *      },
 *      doThis: function(req,res) {
 *          ...
 *      }
 *      _relay: {
 *          type: 'sub'
 *      },
 *      relay: {
 *          _: {
 *              name: 'relay',
 *              type: 'built-in',
 *              version: '0.0.1'
 *          },
 *          _test: {},
 *          test: function() {},
 *          _list: {},
 *          list: function() {}
 *      },
 *
 *   }
 */

var debug = require('debug')('rpc');

// counting id for rpc invoke function
var invokeId = 0;

function RPC() {
    this.modules = {};
    this.methods = {};
    this.selfs = {};
}

RPC.prototype.insertMethods = function(o) {
    var path = o['_'] ? o['_'].name : false;
    if (path) {
        for (var i in o) {
            if (i.substring(0, 1) !== '_') {
                if (o['_' + i]) {
                    var ip = o['_' + i].name || i;
                    o['_' + i].fullname = path + '.' + ip;
                    
                    try {
                        this.modules[path + '.' + ip] = o['_' + i];
                        this.methods[path + '.' + ip] = o[i];
                        this.selfs[path + '.' + ip] = o;
                    } catch (e) {
                        console.log("Kaboom! ", e);
                    }
                }
            }
        }
    }
};

RPC.prototype.listMethods = function(args, context) {
    var l = {};
    for (var i in this.modules) {
        if ( context.clientType === 'admin' ) {
            l[i] = this.modules[i];
        } else if ( context.clientType === 'service' ) {
            // should test for permissions
            l[i] = this.modules[i];
        } else {
            l[i] = this.modules[i];
        }
    }
    return l;
};

RPC.prototype.parse = function(msg, context) {
    try {
        if ( msg.op === 'methods' ) {
            msg.reply({ack: msg.id, data: this.listMethods(msg.args, context)});
            return;
        }
        if ( typeof this.methods[msg.op] === "undefined" ) {
            // service not found
            msg.reply({ack: msg.id, err: true, data: "No method or permission denied: "+msg.op });
            return;
        } else {
            // service found
            this.methods[msg.op].call(
                    this.selfs[msg.op],
                    { args: msg.args }, 
                    { send: function(data) {
                        msg.reply({ack: msg.id, data: data }); },
                      emit: function(data) {
                        msg.reply({sig: msg.id, data: data }); },
                      error: function(data) {
                        msg.reply({err: msg.id, data: data }); },
                      close: function(data) {
                        msg.reply({close: msg.id }); }
                    },
                    context);
        }
    } catch(e) {
        debug("Dynamic RPC failed to execute ", msg.op, e, e.stack);
        try {
            msg.reply({ack: msg.id, err: true, data: 'caught error in '+msg.op+': '+e.toString(), debug: e.stack});
        } catch(e) {
            msg.reply({err: true, data: "rpc", errmsg:e.toString()});
        }
    }
};

RPC.prototype.invoke = function(op, args, cb) {
    if( !Array.isArray(args) ) {
        args = [args];
    }
    
    if (typeof cb !== 'function') {
        throw new Error('RPC invoke requires callback function as third argument');
    }
    
    var msg = {
        op: op,
        args: args,
        id: ++invokeId,
        reply: function(reply) {
            if ( reply.err ) {
                cb(true, reply.data);
            } else {
                cb(null, reply.data);
            }
        }
    };
    var context = {
        clientType: 'invoke',
        clientId: 'invokedViaRPCInvoke'
    };
    this.parse(msg, context);
};

module.exports = {
    RPC: RPC
};
