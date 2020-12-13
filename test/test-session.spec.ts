import { RequestMessage } from 'src';
import { Client } from '../src/rpc-client';
import { Server } from '../src/rpc-server';
import * as expect from 'expect';

describe('RPC Session', function () {

    let server: Server;

    before(function (done) {
        server = new Server();

        server.insertMethods({
            _login: { doc: 'Login to service' },
            login: function (req, res) {
                res.send('world');
            },
            _signals: { doc: 'Get a list' },
            signals: function (req, res, context) {
                this.end = () => { console.log('signals cleanup...'); };
                res.emit('ok');
            },
            _logout: { doc: 'Logout from service' },
            logout: function (req, res) {
                res.send('done');
            }
        });

        done();
    });

    let client: Client;
    let clientId: number;

    it('should set up client', function(done) {
        client = new Client((data) => {
            server.parse(data as RequestMessage, function(data) {
                client.messageReceived(data);
            }, {}, clientId);
        });
        done();
    });

    it('should open and close session', function (done) {
        clientId = server.open();
        client.request('signals', [], (err, data) => {
            expect(data).toStrictEqual('ok');
            server.close(clientId);
            done();
        });
    });
});
