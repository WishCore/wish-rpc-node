import { Server } from 'src/rpc-server';
import * as expect from 'expect';

describe('RPC Access Control', function () {

    let rpc;

    before(function (done) {
        rpc = new Server();

        rpc.insertMethods({
            _fwupdate: {},
            fwupdate: {
                _state: { doc: 'Firmware Update State' },
                state: function (req, res) {
                    res.send('hello '+ req.args[0]);
                }
            },
            _login: { doc: 'Login to service' },
            login: function (req, res) {
                res.send('hello world');
            },
            _logout: { doc: 'Logout from service' },
            logout: function (req, res, context) {
                //console.log("Logging out with context:", context);
                if(context.permissions.user) {
                    res.send('done');
                } else {
                    res.error({ code: 302, msg: 'Logout access denied.' });
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
            expect(err).toStrictEqual(true);
            expect(data.code).toEqual(302);
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
            expect(err).toStrictEqual(true);
            expect(data.msg).toEqual('Logout access denied.');
            expect(data.code).toEqual(302);
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
            expect(err).toStrictEqual(null);
            done();
        });
    });


    it('should filter methods according to acl', function (done) {
        const allow = {
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
                expect(typeof data['login']).toEqual('undefined');
                expect(typeof data['logout']).toEqual('object');
                expect(data['fwupdate.state'].doc).toEqual('Firmware Update State');
            } catch(e) {
                done(e);
                return;
            }
            done();
        });
    });
});