var stream = require('stream');
var util= require('util');
var JSONStream = require('JSONStream');

function GetJSON() {
    stream.Transform.call(this, {objectMode: true});
}

util.inherits(GetJSON, stream.Transform);

GetJSON.prototype._transform = function (chunk, t, next) {
    var out = chunk.toJSON({withPrivate: true});
    var field;
    for (field in out) {
        if (chunk.__verymeta.defs[field].derived) {
            out[field] = undefined;
        }
    }
    if (out.key) {
        out.key = out.key.split('!')[1];
    }
    this.push(out);
    next();
};

module.exports = function (mf) {
    mf.exportJSON = function (writeable) {
        if (typeof writeable === 'undefined') {
            writeable = process.stdout;
        }
        var input = mf.all({returnStream: true}, function () {});
        return input.pipe(new GetJSON()).pipe(JSONStream.stringify()).pipe(writeable);
    };
    return mf;
};
