var Rpc = require('../src/rpc.js').RPC;
var Client = require('../src/rpc-client.js').Client;
var assert = require('assert');
var stream = require('stream');
var fs = require('fs');

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
                    var b = 0;
                    var writable = new stream.Writable({highWaterMark: 1024});
                    writable._write = function (chunk, encoding, next) {
                        b += chunk.length;
                        setTimeout(next, 13);
                    };                    
                    req.pipe(writable);
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
        this.timeout(14000);

        var readable = new stream.Readable();
        var rs = 0;
        readable._read = function () {
            if(rs>200) {
                this.push(null);
            } else {
                var chunk = new Buffer('Bahamas buys return ticket to America etc '+(++rs)+'!');
                while ( this.push(chunk) ) {}
            }
        };        
        
        var id = client.request('stream.uploadSlow', ['output.txt'], readable, function(err, data) {
            console.log("stream.upload response:", err, data);
            if(data === 'fine!') {
                done();
            }
        });
        
        console.log("got an id:", id);
    });
});

