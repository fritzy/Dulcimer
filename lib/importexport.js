var async = require('async');
var stream = require('stream');
var util= require('util');
var JSONStream = require('JSONStream');

function GetJSON() {
    stream.Transform.call(this, {objectMode: true});
}

util.inherits(GetJSON, stream.Transform);

GetJSON.prototype._transform = function (chunk, t, next) {
    var out = chunk.toJSON({withPrivate: true});
    out.key = out.key.split('!')[1];
    this.push(out);
    next();
};

function importArray(mf, list, cb) {
    async.each(list, function (obj, next) {
        var instance = mf.create(obj);
        instance.save(next);
    }, function (err) {
        if (typeof cb === 'function') cb(err);
    });
}

module.exports = function (mf) {
    mf.exportJSON = function (writeable) {
        if (typeof writeable === 'undefined') {
            writeable = process.stdout;
        }
        var input = mf.all({returnStream: true}, function (err) {
        });
        return input.pipe(new GetJSON()).pipe(JSONStream.stringify()).pipe(writeable);
    };
    mf.importData = function (readable, cb) {
        if (Array.isArray(readable)) {
            return importArray(mf, readable, cb);
        }
        readable.on('data', function (obj) {
            var instance = mf.create(obj);
            instance.save(function () {});
        });
        if (typeof cb === 'function') readable.on('end', cb);
    };
    return mf;
};
