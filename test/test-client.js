var Rpc = require('../src/rpc.js').RPC;
var Client = require('../src/rpc-client.js').Client;
var assert = require('assert');
var fs = require('fs');
var stream = require('stream');

describe('RPC Stream Control', function () {

    var rpc;

    before(function (done) {
        rpc = new Rpc();
        
        rpc.insertMethods({
            _stream: {},
            stream: {
                _upload: {doc: 'Upload data'},
                upload: function (req, res) {
                    var file = fs.createWriteStream(req.args[0], { flags: 'w', autoClose: true });
                    req.pipe(file);
                    //res.emit('hello '+ req.args[0]);
                },
                _uploadSlow: {doc: 'Upload data, but is slow to receive'},
                uploadSlow: function (req, res) {
                    var writable = new stream.Writable({highWaterMark: 10});
                    writable._write = function (chunk, encoding, next) {
                        // sets this._write under the hood
                        console.log("writeable writing stuff", chunk);
                        // An optional error can be passed as the first argument
                        setTimeout(next, 200);
                    };                    
                    req.pipe(writable);
                    //res.emit('hello '+ req.args[0]);
                },
                _download: {doc: 'Download data'},
                download: function (req, res) {
                    var rs = fs.createReadStream(req.args[0]);
                    res.pipe(rs);
                    res.send('hello '+ req.args[0]);
                }
            }
        });
        
        done();
    });

    var client;

    it('should go client', function(done) {
        var bsonStream = {
            write: function(data) { 
                console.log("about to send to rpc.parse:", data);
                rpc.parse(data, function(data) {
                    client.messageReceived(data, function() { });
                }); 
            }
        };
        
        client = new Client(bsonStream.write);
        client.on('ready', done);
    });

    it('should stream upload', function(done) {
        this.timeout(4000);
        var fstream = fs.createReadStream('./stream.input');
        var id = client.request('stream.uploadSlow', ['output.txt'], fstream, function(err, data) {
            console.log("stream.upload response:", err, data);
        });
        
        console.log("got an id:", id);
        
        //client.send(id, new Buffer('hello,'));
        //client.send(id, new Buffer('hello,'));
        //client.send(id, new Buffer('hello,'));
        //client.send(id, new Buffer('hello,'));
        //client.send(id, new Buffer('hello'));
    });
});



        /*
        bsonStream.on('readable', function() {
            client.messageReceived            
        });
        
        bsonStream.on('readable', function () {
            var chunk;
            while (null !== (chunk = bsonStream.read(8))) {
                rpc.invokeRaw({
                    write: '2',
                    data: chunk
                });
                
            }
            rpc.invokeRaw({
                end: '2'
            });
            done();
        });        
        */
