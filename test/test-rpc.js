var Server = require('../src/index.js').Server;
var assert = require('assert');

describe('RPC test', function () {

    var rpc;

    before(function (done) {
        rpc = new Server();
        rpc.insertMethods({
            _fwupdate: {},
            fwupdate: {
                _debug: { doc: 'Bunch of debug related functions.' },
                debug: {
                    _enable: {doc: 'Enable debug mode'},
                    enable: function (req, res) {
                        res.send('enabled');
                    },
                    _disable: {doc: 'Disable debug mode'},
                    disable: function (req, res) {
                        res.send('disabled');
                    }
                },
                _state: {doc: 'Send a ucp write request'},
                state: function (req, res) {
                    res.send('hello '+ req.args[0]);
                },
                _updateState: {doc: 'Send a ucp write request'},
                updateState: function (req, res) {
                    res.send('That is done.');
                }
            },
            _list: {doc: 'Get a list'},
            list: function (req, res) {
                res.send(['hello', 'this', 'is', 'the', 'list', { that: 'is', great: true }]);
            }
        });

        rpc.insertMethods({
            _login: {doc: 'Login to service'},
            login: function (req, res) {
                res.emit('hello');
                res.send('world');
            },
            _logout: {doc: 'Logout from service'},
            logout: function (req, res) {
                res.send('done');
            }
        });
        
        done();
    });
    
    it('should make a basic request', function (done) {
        rpc.invoke('fwupdate.state', ['world'], function (err, data) {
            assert.equal(data, 'hello world');
            done();
        });
    });
    
    it('should make a basic request deep', function (done) {
        rpc.invoke('fwupdate.debug.enable', [], function (err, data) {
            assert.equal(data, 'enabled');
            done();
        });
    });

    it('should throw error when no callback specified', function (done) {
        try {
            rpc.invoke('fwupdate.state', ['world']);
        } catch(e) {
            done();
            return;
        }
        done(new Error('Invoke did not throw error when expected.'));
    });

    it('should list available methods', function (done) {
        rpc.invoke('methods', [], function (err, data) {
            //console.log("list of methods", err, data);
            try {
                assert.equal(typeof data['login'], 'object');
                assert.equal(data['fwupdate.debug.enable'].doc, 'Enable debug mode');
            } catch(e) {
                done(e);
                return;
            }
            done();
        });
    });

    it('should receive a signal and then end', function (done) {
        var state = 0;
        rpc.invoke('login', [], function (err, data) {
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
        rpc.invoke('nonexisting.method', [], function (err, data) {
            if (err) {
                done();
            } else {
                done(new Error('Got response to non-existing methods which was not an error.'));
            }
        });
    });
});