# Wish RPC

## Usage

Need to have permission to fetch packages from `wish.cto.fi:8080` (sinopia server), and `npm` configured to download from there.

```sh
npm install wish-bson
```

### Register methods

```js
var RPC = require('wish-rpc').RPC;

var rpc = new RPC();

rpc.insertMethods({
    _: {name: 'message'},
    _add: { async: true },
    add: function (req, res) {
        res.send('Added: '+req.args[0]);
    },
    _list: { async: true },
    list: function (req, res) {
        res.send([
            { title: 'Blah,blah', body: 'This is some message' }
        ]);
    }
});
```

### Accept requests

```js
this.messaging.on('rpc-request', function(err, msg) {
    rpc.parse({
        op: msg.data.op,
        args: msg.data.args,
        reply: function(data) {
            msg.send({data: data});
        }
    }, {/* context */});
});
```

### Send request 

```js
this.messaging.emit({ 
    data: { 
        op: 'message.add', 
        args: [] 
    },
    send: function(data) { 
        console.log("RPC response", data); 
    } 
});
```



