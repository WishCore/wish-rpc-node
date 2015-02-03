# Wish RPC

## Usage

Need to have permission to fetch packages from `wish.cto.fi:8080` (sinopia server), and `npm` configured to download from there.

```sh
npm install wish-rpc
```

### Register methods

```js
var RPC = require('wish-rpc').RPC;

var rpc = new RPC();

rpc.insertMethods({
    _: {name: 'message'},
    _add: { 
        doc: 'Add a message', 
        examples: [
            'message.add("Green fields")' ],
        stability: 2,
        async: true },
    add: function (req, res) {
        res.send('Added: '+req.args[0]);
    },
    _list: {
        doc: 'List messages', 
        stability: 3,
        async: true },
    list: function (req, res) {
        res.send([
            { title: 'Blah,blah', body: 'This is some message' }
        ]);
    }
});
```

### Invoke a method

```js
rpc.invoke('message.add', ['Hello RPC world!'], function(err, data) {
    console.log("A response was received from rpc:", data);
});
```

### List registered methods

```js
rpc.invoke('methods', [], function(err, data) {
    console.log("Methods in rpc:", data);
});
```

### Accept requests

Using WebSockets or HTTP requests alike, you can now call the `rpc.parse(request, context)`. The request object should contain `op`, `args` and `reply`.

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



