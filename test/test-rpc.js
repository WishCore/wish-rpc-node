var Rpc = require('../src/rpc.js').RPC;


describe('RPC test', function () {

    var rpc;

    before(function (done) {
        rpc = new Rpc();
        done();
    });

    it('should ', function (done) {
        rpc.insertMethods({
            _: {name: 'fw-update'},
            _state: {doc: 'Send a ucp write request', async: true},
            state: function (req, res) {
                res.send('hello '+ req.args[0]);
            },
            _updateState: {doc: 'Send a ucp write request', async: true},
            updateState: function (req, res) {
                self.localStorage.save({applicationState: req.args[0]}, function (err, oids) {
                    console.log("updated app state.");
                });
            }
        });




        rpc.insertMethods({
            _: {name: 'eair-ui'},
            _login: {doc: 'Send a ucp write request', async: true},
            login: function (req, res) {
                res.send('hello '+ req.args[0]);
            }
        });
        
        
        

        rpc.invoke('methods', [], function (err, data) {
            console.log(data);
        });
        
        rpc.invoke('fw-update.state', ['world'], function (err, data) {
            console.log(data);
        });
        
        rpc.invoke('eair-ui.login', ['eAir'], function (err, data) {
            console.log(data);
        });
        setTimeout(done, 1000);
    });
});