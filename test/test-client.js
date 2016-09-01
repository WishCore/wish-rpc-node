var Server = require('../src/index.js').Server;
var Client = require('../src/index.js').Client;
var assert = require('assert');
var stream = require('stream');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

describe('RPC Stream Control', function () {

    var rpc;

    before(function (done) {
        rpc = new Server();

        var signaler = new EventEmitter();
        setInterval(function() { signaler.emit('online', { luid: 'l1', ruid: 'r4' }); }, 50);
        
        rpc.insertMethods({
            _event: {},
            event: {
                _frame: { event: true },
                frame: true,
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
                },
                _identities: {doc: 'Get identities and updates'},
                identities: function (req, res) {
                    res.close();
                },
                _nothing: {doc: 'Does nothing'},
                nothing: function (req, res) {
                }
            }
        });
        
        done();
    });

    var client;

    it('should set up client', function(done) {
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
        done();
    });

    it('should get event.peers', function(done) {
        var reqid = client.request('event.peers', [], function(err, data) {
            if(err) { return; }
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

    it('should be ended by remote host', function(done) {
        var reqid = client.request('event.identities', [], function(err, data, end) {
            console.log("event.identities", err, data, end);
            if(end) {
                done();
            }
        });
    });
});

