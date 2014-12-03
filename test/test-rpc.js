var Rpc = require('../src/rpc.js').RPC;
var assert = require('assert');

describe('RPC test', function () {

    var rpc;

    before(function (done) {
        rpc = new Rpc();
        rpc.insertMethods({
            _: {name: 'fw-update'},
            _state: {doc: 'Send a ucp write request'},
            state: function (req, res) {
                res.send('hello '+ req.args[0]);
            },
            _updateState: {doc: 'Send a ucp write request'},
            updateState: function (req, res) {
                self.localStorage.save({applicationState: req.args[0]}, function (err, oids) {
                    console.log("updated app state.");
                });
            }
        });

        rpc.insertMethods({
            _: {name: 'signaling'},
            _login: {doc: 'Send a ucp write request'},
            login: function (req, res) {
                res.emit('hello');
                res.send('world');
            }
        });
        
        done();
    });
    
    it('should make a basic request', function (done) {
        rpc.invoke('fw-update.state', ['world'], function (err, data) {
            assert.equal(data, 'hello world');
            done();
        });
    });

    it('should throw error when no callback specified', function (done) {
        try {
            rpc.invoke('fw-update.state', ['world']);
        } catch(e) {
            done();
            return;
        }
        done(new Error('Invoke did not throw error when expected.'));
    });

    it('should list available methods', function (done) {
        rpc.invoke('methods', [], function (err, data) {
            try {
                assert.equal(data['signaling.login'].fullname, 'signaling.login');
            } catch(e) {
                done(e);
                return;
            }
            done();
        });
    });

    it('should receive a signal and then end', function (done) {
        var state = 0;
        rpc.invoke('signaling.login', [], function (err, data) {
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