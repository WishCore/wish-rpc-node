import { Client } from '../src/rpc-client';
import { Server } from '../src/rpc-server';
import * as expect from 'expect';

describe('RPC test', function () {

    let server: Server;
    let client: Client;
    let session: number;

    before(function (done) {
        server = new Server();
        server.insertMethods({
            _fwupdate: {},
            fwupdate: {
                _debug: { doc: 'Bunch of debug related functions.' },
                debug: {
                    _enable: { doc: 'Enable debug mode' },
                    enable: (req, res) => {
                        res.send('enabled');
                    },
                    _disable: { doc: 'Disable debug mode' },
                    disable: (req, res) => {
                        res.send('disabled');
                    }
                },
                _state: { doc: 'Send a ucp write request' },
                state: (req, res) => {
                    res.send('hello '+ req.args[0]);
                },
                _updateState: { doc: 'Send a ucp write request' },
                updateState: (req, res) => {
                    res.send('That is done.');
                }
            },
            _list: { doc: 'Get a list' },
            list: function (req, res) {
                res.send(['hello', 'this', 'is', 'the', 'list', { that: 'is', great: true }]);
            }
        });

        server.insertMethods({
            _login: { doc: 'Login to service' },
            login: function (req, res) {
                res.emit('hello');
                res.send('world');
            },
            _logout: { doc: 'Logout from service' },
            logout: function (req, res) {
                res.send('done');
            }
        });

        session = server.open();

        /** Simulates a bidirectional connection between client and server */
        const connection = {
            write: (data) => {
                // console.log('about to send to rpc.parse:', data);
                server.parse(
                    data,
                    (data) => {
                        // console.log('client received message:', data);
                        client.messageReceived(data);
                    },
                    {},
                    session
                );
            }
        };

        client = new Client(connection.write);

        done();
    });

    it('should make a basic request', function (done) {
        client.request('fwupdate.state', ['world'], function (err, data) {
            expect(data).toStrictEqual('hello world');
            done();
        });
    });

    it('should make a basic request deep', function (done) {
        client.request('fwupdate.debug.enable', [], function (err, data) {
            expect(data).toStrictEqual('enabled');
            done();
        });
    });

    xit('should throw error when no callback specified', async function () {
        await client.request('fwupdate.state', ['world']);
    });

    it('should list available methods', function (done) {
        client.request('methods', [], function (err, data) {
            //console.log("list of methods", err, data);
            try {
                expect(typeof data['login']).toStrictEqual('object');
                expect(data['fwupdate.debug.enable'].doc).toStrictEqual('Enable debug mode');
            } catch(e) {
                done(e);
                return;
            }
            done();
        });
    });

    it('should receive a signal and then end', function (done) {
        let state = 0;
        client.request('login', [], function (err, data) {
            if (err) {
                done(new Error('Problem in '+JSON.stringify(data)));
                return;
            }

            if (state === 0) {
                if ( data === 'hello') {
                    state = 1;
                } else {
                    // fail
                    done(new Error('Expected "hello", but got "'+data+'"'));
                }
            } else if ( state === 1) {
                if ( data ==='world') {
                    done();
                } else {
                    // fail
                    done(new Error('Expected "world", but got "'+data+'"'));
                }
            }
        });
    });

    it('should get an error', function (done) {
        client.request('nonexisting.method', [], function (err, data) {
            if (err) {
                done();
            } else {
                done(new Error('Got response to non-existing methods which was not an error.'));
            }
        });
    });
});