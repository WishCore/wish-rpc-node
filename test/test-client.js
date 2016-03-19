var Rpc = require('../src/rpc.js').RPC;
var Client = require('../src/rpc-client.js').Client;
var assert = require('assert');
var stream = require('stream');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

describe('RPC Stream Control', function () {

    var rpc;

    before(function (done) {
        rpc = new Rpc();

        var signaler = new EventEmitter();
        setInterval(function() { signaler.emit('online', { luid: 'l1', ruid: 'r4' }); }, 100);
        
        rpc.insertMethods({
            _event: {},
            event: {
                _peers: {doc: 'Get peers and updates'},
                peers: function (req, res) {
                    var online = function(peer) {
                        res.emit(peer);
                    };
                    
                    this.end = function() {
                        signaler.removeListener('online', online);
                    };
                    
                    res.emit({ I: [
                            {luid: 'l1', ruid: 'r1', online: true},
                            {luid: 'l1', ruid: 'r2', online: false},
                            {luid: 'l1', ruid: 'r3', online: true}
                        ] 
                    });
                    
                    //res.emit({ online: {luid: 'l1', ruid: 'r1'} });
                    signaler.on('online', online);
                    
                    res.emit({ offline: {luid: 'l1', ruid: 'r1'} });
                }
            }
        });
        
        done();
    });

    var client;

    it('should go client', function(done) {
        var bsonStream = {
            write: function(data) { 
                //console.log("about to send to rpc.parse:", data);
                rpc.parse(data, function(data) {
                    //console.log("client received message:", data);
                    client.messageReceived(data, function() { });
                }); 
            }
        };
        
        client = new Client(bsonStream.write);
        client.on('ready', done);
    });

    it('should stream upload', function(done) {
        var reqid = client.request('event.peers', [], function(err, data) {
            if(data.offline && data.offline.ruid === 'r1') {
                //console.log("requesting to cancel request", this.id);
                setTimeout(this.cancel, 200);
            }
        });
        
        rpc.on('ended', function(id) {
            if (id === reqid) {
                done();
            }
        });
    });
});

