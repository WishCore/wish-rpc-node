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
                    res.emit('hello '+ req.args[0]);
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

    it('should write a stream', function (done) {
        rpc.invokeRaw({
            op: 'stream.upload',
            args: ['./stream.output'],
            id: '1'
        }, function() {});

        rpc.invokeRaw({
            write: '1',
            data: new Buffer('Just a random buffer')
        });
        rpc.invokeRaw({
            write: '1',
            data: new Buffer('...and another random buffer')
        });
        rpc.invokeRaw({
            write: '1',
            data: new Buffer('... yes, more...')
        });
        rpc.invokeRaw({
            end: '1'
        });
        done();
    });

    it('should write a stream', function (done) {
        rpc.invokeRaw({
            op: 'stream.upload',
            args: ['./stream.output2'],
            id: '2'
        }, function() {});

        var input = fs.createReadStream('./stream.input');
        input.on('readable', function () {
            var chunk;
            while (null !== (chunk = input.read(8))) {
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
        
    });

    it('should stream test', function (done) {
        var writable = new stream.Writable({highWaterMark: 10});
        writable._write = function (chunk, encoding, next) {
            // sets this._write under the hood
            console.log("writable writing stuff", chunk);
            // An optional error can be passed as the first argument
            setTimeout(next, 200);
        };
        
        var i = 0;
        var chunks = [
            new Buffer('boomboom!'),
            new Buffer('go!'),
            new Buffer('Goo!'),
            new Buffer('Goo!'),
            new Buffer('Goo!'),
            new Buffer('Goo!'),
            new Buffer('Goooo!'),
            new Buffer('Goooooo!')
        ];

        function push() {
            var loop = true;
            console.log("pushing");
            while(loop) {
                if(!chunks[i]) { return done(); }
                loop = writable.write(chunks[i]);
                i++;
                console.log("yes?", loop);
            }
        }
        writable.on('drain', push);
        push();
    });

});