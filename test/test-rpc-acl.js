var Server = require('../src/index.js').Server;
var assert = require('assert');

describe('RPC Access Control', function () {

    var rpc;

    before(function (done) {
        rpc = new Server();
        
        rpc.insertMethods({
            _fwupdate: {},
            fwupdate: {
                _state: {doc: 'Firmware Update State'},
                state: function (req, res) {
                    res.send('hello '+ req.args[0]);
                }
            },
            _login: {doc: 'Login to service' },
            login: function (req, res) {
                res.send('hello world');
            },
            _logout: { doc: 'Logout from service' },
            logout: function (req, res, context) {
                //console.log("Logging out with context:", context);
                if(context.permissions.user) {
                    res.send('done');
                } else {
                    res.error({code: 302, msg: 'Logout access denied.'});
                }
            }
        });
        
        done();
    });
    
    it('should get permission denied from rpc', function (done) {
        rpc.accessControl(function(resource, acl, context, cb) {
            //console.log("acl", acl);
            if(resource==='logout') {
                cb(null, false);
            }
        });
        
        rpc.invoke('logout', [], function (err, data, context) {
            //console.log("er,data:", err, data, context);
            assert.equal(err, true);
            assert.equal(data.code, 302);
            done();
        });
    });
    
    it('should get permission denied from function', function (done) {
        rpc.accessControl(function(resource, acl, context, cb) {
            //console.log("acl", acl);
            if(resource==='logout') {
                cb(null, true);
            }
        });
        
        rpc.invoke('logout', [], function (err, data, context) {
            //console.log("er,data:", err, data, context);
            assert.equal(err, true);
            assert.equal(data.msg, 'Logout access denied.');
            assert.equal(data.code, 302);
            done();
        });
    });
    
    it('should get permission allowed', function (done) {
        rpc.accessControl(function(resource, acl, context, cb) {
            if(resource==='logout') {
                cb(null, true, ['user']);
            }
        });
        
        rpc.invoke('logout', [], function (err, data, context) {
            assert.equal(err, null);
            done();
        });
    });
    

    it('should filter methods according to acl', function (done) {
        var allow = {
            logout: true,
            'fwupdate.state': true
        };

        rpc.accessControl(function(resource, acl, context, cb) {
            if(allow[resource]) {
                cb(null, true);
            } else {
                cb(null, false);
            }
        });

        //console.log("Added ACL to rpc.");

        rpc.invoke('methods', [], function (err, data) {
            //console.log("list of methods", err, data);
            try {
                assert.equal(typeof data['login'], 'undefined');
                assert.equal(typeof data['logout'], 'object');
                assert.equal(data['fwupdate.state'].doc, 'Firmware Update State');
            } catch(e) {
                done(e);
                return;
            }
            done();
        });
    });    
});