import { EventEmitter } from 'events';
import { Client } from '../src/rpc-client';
import { Server } from '../src/rpc-server';

describe('RPC Stream Control', function () {

    let server: Server;

    before(function (done) {
        server = new Server();

        const signaler = new EventEmitter();
        const onlineInterval = setInterval(function() { signaler.emit('online', { luid: 'l1', ruid: 'r4' }); }, 50);

        server.insertMethods({
            _event: {},
            event: {
                _frame: { event: true },
                frame: true,
                _peers: { doc: 'Get peers and updates' },
                peers: function (req, res) {
                    const online = function(peer) {
                        res.emit(peer);
                    };

                    this.end = function() {
                        signaler.removeListener('online', online);
                        clearInterval(onlineInterval);
                    };

                    res.emit({ I: [
                        { luid: 'l1', ruid: 'r1', online: true },
                        { luid: 'l1', ruid: 'r2', online: false },
                        { luid: 'l1', ruid: 'r3', online: true }
                    ]
                    });

                    //res.emit({ online: {luid: 'l1', ruid: 'r1'} });
                    signaler.on('online', online);

                    res.emit({ offline: { luid: 'l1', ruid: 'r1' } });
                },
                _identities: { doc: 'Get identities and updates' },
                identities: function (req, res) {
                    res.emit({ a: true, b: false, c: true });
                    res.emit({ b: true });
                    res.close();
                },
                _nothing: { doc: 'Does nothing' },
                nothing: (req, res) => {
                    /**/
                }
            }
        });

        done();
    });

    let client: Client;

    it('should set up client', function(done) {
        const session = server.open();
        const bsonStream = {
            write: function(data) {
                //console.log("about to send to rpc.parse:", data);
                server.parse(data, (data) => {
                    //console.log("client received message:", data);
                    client.messageReceived(data);
                }, {}, session);
            }
        };

        client = new Client(bsonStream.write);
        done();
    });

    it('should get event.peers', function(done) {
        client.request('event.peers', [], (err, data, end) => {
            if (end) { return done(); }

            if(err || end) { return; }

            if(data.offline && data.offline.ruid === 'r1') {
                // requesting to cancel request
                setTimeout(this.cancel, 100);
            }
        });
    });

    it('should be ended by remote host', function(done) {
        client.request('event.identities', [], (err, data, end) => {
            //console.log("event.identities", err, data, end);
            if(end) {
                done();
            }
        });
    });
});

