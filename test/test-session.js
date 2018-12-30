var { Client, Server } = require('../src/index.js');
var assert = require('assert');

describe('RPC Session', function () {

    var server;

    before(function (done) {
        server = new Server();

        server.insertMethods({
            _login: {doc: 'Login to service'},
            login: function (req, res) {
                res.send('world');
            },
            _signals: {doc: 'Get a list'},
            signals: function (req, res, context) {
                this.end = () => { console.log('signals cleanup...'); }
                res.emit('ok');
            },
            _logout: {doc: 'Logout from service'},
            logout: function (req, res) {
                res.send('done');
            }
        });

        done();
    });

    it('should make a basic request', function (done) {
        server.invoke('login', [], function (err, data) {
            assert.equal(data, 'world');
            done();
        });
    });

    var client;
    var clientId;

    it('should set up client', function(done) {
        client = new Client(function(data) {
            server.parse(data, function(data) {
                client.messageReceived(data, function() {});
            }, {}, clientId);
        });
        done();
    });

    it('should open and close session', function (done) {
        clientId = server.open();
        client.request('signals', [], function (err, data) {
            assert.equal(data, 'ok');
            server.close(clientId);
            done();
        });
    });
});
