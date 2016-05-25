var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Distributed(send) {
    this.write = send;
    this.id = 0;
    this.requests = {};
}

util.inherits(Distributed, EventEmitter);

Distributed.prototype.destroy = function() {
    this.requests = null;
    this.write = null;
};

module.exports = {
    Distributed: Distributed };
