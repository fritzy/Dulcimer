var stream = require('stream');
var util = require('util');

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

function createRangeEntryReadStream(db, start, end, reverse) {
    var stream;
    if (reverse) {
        stream = db.createReadStream({
            start: end + '~',
            end: start,
            reverse: true,
        });
    } else {
        stream = db.createReadStream({
            start: start,
            end: end + '~',
        });
    }
    return stream;
}

function createPrefixEntryReadStream(db, prefix, reverse) {
    var stream;
    if (reverse) {
        stream = db.createReadStream({
            start: prefix + '~',
            end: prefix,
            reverse: true,
        });
    } else {
        stream = db.createReadStream({
            start: prefix,
            end: prefix + '~',
        });
    }
    return stream;
}

function OnEachStream(onEach, opts) {
    this.onEach = onEach;
    opts = opts || {};
    if (!opts.highWaterMark) opts.highWaterMark = 5;
    if (!opts.hasOwnProperty('allowHalfOpen')) opts.allowHalfOpen = false;
    if (!opts.hasOwnProperty('objectMode')) opts.objectMode = true;
    stream.Transform.call(this, opts);
}

util.inherits(OnEachStream, stream.Transform);

(function () {
    this._transform = function (chunk, encoding, next) {
        this.onEach(chunk, function (err, result) {
            if (!err && result) {
                this.push(result);
            }
            next();
        }.bind(this));
    };
}).call(OnEachStream.prototype);


function EntryToModelStream(factory, parent, streamopts) {
    this.parent = parent;
    this.factory = factory;
    streamopts = streamopts || {};
    streamopts.highWaterMark = 10;
    streamopts.objectMode = true;
    streamopts.allowHalfOpen = false;
    stream.Transform.call(this, streamopts);
}

util.inherits(EntryToModelStream, stream.Transform);

(function () {
    this._transform = function (chunk, encoding, next) {
        var model = this.factory.create(chunk.value);
        if (this.parent) {
            model.__verymeta.parent = this.parent;
        }
        model.key = chunk.key;
        this.push(model);
        next();
    };
}).call(EntryToModelStream.prototype);

function OffsetCountStream(offset, count) {
    this.offset = offset;
    this.count = count;
    this.size = 0;
    stream.Transform.call(this, {highWaterMark: 1, allowHalfOpen: false, objectMode: true});
}

util.inherits(OffsetCountStream, stream.Transform);

(function () {
    this._transform = function (chunk, encoding, next) {
        if (this.offset > 0) {
            this.offset -= 1;
        } else {
            this.push(chunk);
            this.size++;
            if (this.count !== -1 && this.size >= this.count) {
                this.push(null);
            }
        }
        next();
    };
}).call(OffsetCountStream.prototype);


function KeyValueGetStream(db) {
    stream.Transform.call(this, {highWaterMark: 10, allowHalfOpen: false, objectMode: true});
    this.db = db;
}

util.inherits(KeyValueGetStream, stream.Transform);

(function () {
    this._transform = function (entry, encoding, next) {
        var key = entry.value;
        this.db.get(key, function (err, value) {
            if (!err && value) {
                this.push({key: key, value: value});
            }
            next();
        }.bind(this));
    };
}).call(KeyValueGetStream.prototype);

function FilterModelStream(filter) {
    this.filter = filter;
    stream.Transform.call(this, {highWaterMark: 5, allowHalfOopen: false, objectMode: true});
}

util.inherits(FilterModelStream, stream.Transform);

(function () {
    this._transform = function (entry, encoding, next) {
        if (this.filter(entry)) {
            this.push(entry);
        }
        next();
    };
}).call(FilterModelStream.prototype);

function deleteKeysWithPrefix(db, prefix, callback) {
    createPrefixKeyReadStream(db, prefix).pipe(createDeleteKeyWriteStream(db))
        .on('finish', callback);
}

module.exports = {
    createDeleteKeyWriteStream: createDeleteKeyWriteStream,
    createPrefixKeyReadStream: createPrefixKeyReadStream,
    deleteKeysWithPrefix: deleteKeysWithPrefix,
    createPrefixEntryReadStream: createPrefixEntryReadStream,
    EntryToModelStream: EntryToModelStream,
    OffsetCountStream: OffsetCountStream,
    KeyValueGetStream: KeyValueGetStream,
    OnEachStream: OnEachStream,
    FilterModelStream: FilterModelStream,
    createRangeEntryReadStream: createRangeEntryReadStream,
};
