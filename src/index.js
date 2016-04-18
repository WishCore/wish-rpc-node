
module.exports = {
    Server: require('./rpc-server.js').Server,
    Client: require('./rpc-client.js').Client,
    // Backwards compatible
    RPC: require('./rpc-server.js').Server
};
