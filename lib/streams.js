var stream = require('stream');


function createDeleteKeyWriteStream(db) {
    var deleteStream = new stream.Writable({objectMode: true, highWaterMark: 10});
    deleteStream._write = function (c, e, n) {
        db.del(c, function (err) {
            n();
        });
        return false;
    };
    return deleteStream;
}

function createPrefixKeyReadStream(db, prefix, opts) {
    var stream;
    opts = opts || {};
    if (opts.reverse) {
        stream = db.createKeyStream({
            start: prefix + '~',
            end: prefix,
            reverse: true,
        });
    } else {
        stream = db.createKeyStream({
            start: prefix,
            end: prefix + '~',
        });
    }
    return stream;
}

function deleteKeysWithPrefix(db, prefix, callback) {
    createPrefixKeyReadStream(db, prefix).pipe(createDeleteKeyWriteStream(db))
        .on('finish', callback);
}

module.exports = {
    createDeleteKeyWriteStream: createDeleteKeyWriteStream,
    createPrefixKeyReadStream: createPrefixKeyReadStream,
    deleteKeysWithPrefix: deleteKeysWithPrefix,
};
