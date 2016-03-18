var fs = require('fs');
var stream = require('stream');

//var f = fs.createReadStream('/home/akaustel/Downloads/qt-unified-linux-x64-2.0.2-2-online.run');

var chunk;
var chunkSize = 64*1024;

var len = 0;

var readable = new stream.Readable();
var rs = 0;
readable._read = function () {
    if(rs>10000) {
        this.push(null);
    } else {
        var chunk = new Buffer('Bahamas buys return ticket to America etc '+(++rs)+'!');
        //console.log("readable pushing stuff", chunk.length, readable._readableState);
        //console.log("_read start: readable length:", readable._readableState.length);
        while ( this.push(chunk) ) {}
        //console.log("_read done: readable length:", readable._readableState.length);
    }
};

var transform = new stream.Transform({highWaterMark: 100});
transform._transform = function (data, encoding, callback) {
    this.push(data);
    setTimeout(callback, 20);
};

var writable = new stream.Writable({highWaterMark: 16*1024});
var wrlen = 0;
writable._write = function (chunk, encoding, next) {
    // sets this._write under the hood
    wrlen += chunk.length;
    console.log("writable writing stuff", chunk, wrlen);
    // An optional error can be passed as the first argument
    setTimeout(next, 5);
};

//readable.pipe(transform).pipe(writable);

var f = readable;

setInterval(function() { 
    console.log('mem:', process.memoryUsage()); 
}, 2000);

function read() {
    while (null !== (chunk = f.read(chunkSize))) {
        len += chunk.length;
        if(chunk.length !== chunkSize) {
            console.log("We got this different piece.", chunk.length, 'ended:', f._readableState.ended);            
        } else {
            //process.stdout.write('.');
        }
    }    
}

f.on('readable', read);
f.on('end', function() {
    console.log("We're all done, read bytes", len);
});



/*

{ _readableState: 
   { highWaterMark: 65536,
     buffer: 
      [ <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ...>,
        <Buffer 60 00 40 00 00 00 00 00 00 40 00 08 00 00 00 00 08 00 73 0b 1c 0f 07 0e 00 02 00 00 01 00 00 01 01 00 50 58 24 01 6d 41 00 00 00 00 41 6d 01 00 00 00 00 ...> ],
     length: 94762,
     pipes: null,
     pipesCount: 0,
     flowing: false,
     ended: false,
     endEmitted: false,
     reading: false,
     calledRead: true,
     sync: false,
     needReadable: false,
     emittedReadable: false,
     readableListening: true,
     objectMode: false,
     defaultEncoding: 'utf8',
     ranOut: false,
     awaitDrain: 0,
     readingMore: false,
     decoder: null,
     encoding: null },
  readable: true,
  domain: null,
  _events: 
   { end: [Function],
     readable: 
      [ [Function],
        [Function],
        [Function],
        [Function] ] },
  _maxListeners: 10,
  path: '/home/akaustel/Downloads/linuxmint-17.3-cinnamon-64bit.iso',
  fd: 10,
  flags: 'r',
  mode: 438,
  start: undefined,
  end: undefined,
  autoClose: true,
  pos: undefined }


*/