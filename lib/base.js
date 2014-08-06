var async = require('async');
var dbstreams = require('./streams');
var concat = require('concat-stream');

module.exports = function (mf) {

    mf.load = function (key, opts, callback) {
        //if this isn't a child and the user didn't include the prefix, add it
        opts = mf.handleOpts('Factory.get', opts, callback);
        if (!Array.isArray(opts.bucket)) {
            opts.bucket = [opts.bucket, mf.options.name];
        }

        if (typeof key === 'undefined') {
            throw new Error("key cannot be undefined for get/load in " + mf.options.name);
        }
        if (typeof key !== 'string') {
            opts.cb("Invalid key type");
            return;
        }

        var getkey = key;
        if (key.substr(0, 9) === '__main__!') {
            key = key.substring(9);
        } else {
            getkey = '__main__!' + getkey;
        }
        opts.db.get(getkey, {bucket: opts.bucket}, function (err, result, extra) {
            var obj, out;
            if (!err && result) {
                obj = mf.create(result);
                obj.key = key;
                if (typeof extra === 'object' && extra.hasOwnProperty('vclock')) {
                    obj.vclock = extra.vclock;
                }
                obj.bucket = opts.bucket;
                obj._loadForeign(opts.db, opts.bucket, opts.depth, opts.cb);
            } else {
                opts.cb(err);
            }
        });
    };

    mf.get = mf.load;

    mf.delete = function (key, opts, callback) {
        mf.options.savelock.runwithlock(function () {
            opts = mf.handleOpts('Factory.delete', opts, callback);
            var optcb = opts.cb;
            mf.get('__main__' + '!' + key, opts, function (err, inst) {
                if (!err && inst) {
                    opts.cb = optcb;
                    opts.withoutLock = true;
                    inst.delete(opts, function (err) {
                        mf.options.savelock.release();
                        optcb(err);
                    });
                } else {
                    mf.options.savelock.release();
                    optcb("Not found");
                }
            });
        }.bind(this));
    };

    mf.wipe = function (opts, callback) {
        opts = mf.handleOpts('Factory.wipe', opts, callback);
        opts.cb();
    };

    mf.update = function (key, updated_fields, opts, callback) {
        mf.options.savelock.runwithlock(function () {
            opts = mf.handleOpts('Factory.update', opts, callback);
            if (typeof key === 'undefined') {
                throw new Error("key cannot be undefined for update in " + mf.options.name);
            }
            mf.load(key, {bucket: opts.bucket, db: opts.db}, function (err, result) {
                var cb;
                if (!err && result) {
                    var keys = Object.keys(updated_fields);
                    var errors;
                    for (var idx = 0; idx < keys.length; idx++) {
                        result[keys[idx]] = updated_fields[keys[idx]];
                    }
                    if (opts.validate === true) {
                        errors = result.doValidate();
                    }
                    if (typeof errors === 'undefined' ||  (Array.isArray(errors) && errors.length === 0) || !errors) {
                        cb = opts.cb;
                        opts.cb = function (err) {
                            mf.options.savelock.release();
                            cb(err, result);
                        };
                        result.__save(opts);
                    } else {
                        mf.options.savelock.release();
                        opts.cb(errors);
                    }
                } else {
                    mf.options.savelock.release();
                    opts.cb(err);
                }
            });
        }.bind(this));
    };

    mf.all = function (opts, callback) {
        opts = mf.handleOpts('Factory.all', opts, callback);
        if (!Array.isArray(opts.bucket)) {
            opts.bucket = [opts.bucket, mf.options.name];
        }
        var offset = opts.offset || 0;
        var limit = opts.limit || undefined;
        var count = offset;
        if (limit) {
            count += limit;
        }
        if (count === 0) {
            count = undefined;
        }

        var streamType = 'base';
        //yo dawg, I heard you like streams
        var laststream;
        var continuationKey;
        var continuationType;

        //if we're sorting by an index...
        if (opts.hasOwnProperty('sortBy')) {
            streamType = 'index';
            opts.index = opts.sortBy;
        //if we're sorting by an index value...
        } else if (opts.hasOwnProperty('indexValue')) {
            streamType = 'index-value';
            if (typeof opts.indexValue !== 'number' && typeof opts.indexValue !== 'string') {
                opts.indexValue = String(opts.indexValue);
            }
        } else if (opts.hasOwnProperty('foreign')) {
            streamType = 'foreign';
        } else if (opts.hasOwnProperty('indexRange')) {
            streamType = 'index-range';
        }

        var index_field = opts.index;

        if (opts.index) {
            if (mf.definition[opts.index].index_int === true) {
                opts.index = opts.index + '_int';
            } else {
                opts.index = opts.index + '_bin';
            }
        }

        if (streamType === 'base') {
            //read in all of the key and values from prefix -> prefix~
            laststream = dbstreams.createPrefixEntryReadStream({
                db: opts.db,
                prefix: '__main__!',
                reverse: opts.reverse,
                continuation: opts.continuation,
                limit: count,
                bucket: opts.bucket,
                model: mf.options.name
            });
        } else if (streamType === 'index') {
            //read all of the index-values of the index
            if (opts.index.substr(-4) === '_int') {
                laststream = dbstreams.createIndexRangeEntryReadStream({
                    db: opts.db,
                    start: -9999999999,
                    end: 999999999,
                    continuation: opts.continuation,
                    reverse: opts.reverse,
                    index: opts.index,
                    limit: count,
                    bucket: opts.bucket
                });
            } else {
                laststream = dbstreams.createIndexRangeEntryReadStream({
                    db: opts.db,
                    start: '!',
                    end: '~',
                    continuation: opts.continuation,
                    reverse: opts.reverse,
                    index: opts.index,
                    limit: count,
                    bucket: opts.bucket
                });
            }
        } else if (streamType === 'index-value') {
            //read all of the index-values of a specific value
            laststream = dbstreams.createIndexPrefixEntryReadStream({
                db: opts.db,
                prefix: opts.indexValue,
                reverse: opts.reverse,
                index: opts.index,
                continuation: opts.continuation,
                limit: count,
                bucket: opts.bucket
            });
        } else if (streamType === 'index-range') {
            laststream = dbstreams.createIndexRangeEntryReadStream({
                db: opts.db,
                start: opts.indexRange.start,
                end: opts.indexRange.end,
                continuation: opts.continuation,
                limit: count,
                reverse: opts.reverse,
                index: opts.index,
                bucket: opts.bucket
            });
        } else if (streamType === 'foreign') {
            laststream = opts.db.readForeignKeys(opts.foreign.key, opts.foreign.field, {
                continuation: opts.continuation,
                limit: count,
                reverse: opts.reverse,
                bucket: opts.bucket
            }, opts.foreign.reverse);
        }

        //if offset or limit, cull the results
        if (offset > 0 || limit != -1) {
            laststream = laststream.pipe(new dbstreams.OffsetCountStream(offset, limit));
        }

        //turn results into models
        laststream = laststream.pipe(new dbstreams.EntryToModelStream(mf, opts.parent));

        //filter out anything the filters rule say
        if (opts.filter) {
            laststream = laststream.pipe(new dbstreams.FilterModelStream(opts.filter));
        }

        //if foreign keys, get them for each model
        if (mf.options.foreignkey_fields.length > 0 || mf.options.collection_fields.length > 0) {
            laststream = laststream.pipe(new dbstreams.OnEachStream(function (inst, next) {
                inst._loadForeign(opts.db, opts.bucket, opts.depth, next);
            }));
        }

        //called when all is done
        function gotTotal(err, total, models) {
            var last;
            var continuation;
            //generate or use a continuation token;
            if (models.length > 0 && opts.limit) {
                last = models[models.length - 1];

                if (typeof last.__verymeta.extra === 'object') {
                    if (last.__verymeta.extra.continuation) {
                        continuation = last.__verymeta.extra.continuation;
                    }
                }
            }
            opts.cb(err, models, {count: models.length, offset: offset, limit: limit, continuation: continuation, total: total});
        }

        //if they want the stream rather than results
        if (opts.returnStream) {
            opts.cb(undefined, laststream, {offset: offset, limit: limit});
            return laststream;
        }

        //concat all of the result into one array
        laststream.pipe(concat(function (models) {
            if (streamType === 'base' || streamType === 'index') {
                //get total for all of the model
                mf.getTotal({db: opts.db, bucket: opts.bucket}, function (err, total) {
                    gotTotal(err, total, models);
                });
            } else if (streamType === 'foreign') {
                if (opts.foreign.reverse) {
                    opts.foreign.original.getReverseForeignTotal(opts.foreign.field, {bucket: opts.bucket[0]}, function (err, total) {
                        gotTotal(undefined, total, models);
                    });
                } else {
                    opts.foreign.original.getForeignTotal(opts.foreign.field, {bucket: opts.bucket[0]}, function (err, total) {
                        gotTotal(undefined, total, models);
                    });
                }
            } else {
                mf.getIndexTotal(index_field, opts.indexValue, {bucket: opts.bucket}, function (err, total) {
                    gotTotal(err, total, models);
                });
            }
        }));
    };

    mf.getTotal = function (opts, callback) {
        opts = mf.handleOpts('Factory.getTotal', opts, callback);
        opts.db.getCount('__total__', {bucket: opts.bucket}, callback);
    };

    mf.extendModel({
        getNextKey: function (opts, callback)  {
            mf.options.keyGenerator.call(this, callback);
        },
        prepJSON: function () {
            var field, fidx;
            var out = this.toJSON({withPrivate: mf.options.savePrivate});
            var fields = Object.keys(out);
            for (fidx in mf.options.foreignkey_fields) {
                field = mf.options.foreignkey_fields[fidx];
                if (typeof out[field] === 'object') {
                    out[field] = this[field].key;
                }
            }
            for (fidx in mf.options.collection_fields) {
                field = mf.options.collection_fields[fidx];
                if (Array.isArray(out[field])) {
                    out[field] = this[field].map(function (obj) {
                        if (typeof obj === 'object') {
                            return obj.key;
                        } else {
                            return obj;
                        }
                    });
                }
            }
            for (fidx in fields) {
                if (mf.definition[fields[fidx]].save === false) {
                    delete out[fields[fidx]];
                }
            }
            return out;
        },
        __setBucket: function(bucket) {
            if (this.__verymeta.parent) {
                bucket = [bucket, this.__verymeta.parent.__verymeta.name, '__child__', this.__verymeta.parent.key, mf.options.name];
            } else if (!Array.isArray(bucket)) {
                bucket = [bucket, mf.options.name];
            }
            return bucket;
        },
        __save: function (opts) {
            opts.bucket = this.__setBucket(opts.bucket);
            var indexes = [];
            var value;
            for (var fidx in mf.options.bin_indexes) {
                value = this[mf.options.bin_indexes[fidx]];
                if (typeof value === 'undefined') {
                    value = "";
                }
                indexes.push({
                    key: mf.options.bin_indexes[fidx] + '_bin',
                    value: value
                });
            }
            for (fidx in mf.options.int_indexes) {
                value = this[mf.options.int_indexes[fidx]];
                if (typeof value === 'undefined') {
                    value = 0;
                }
                indexes.push({
                    key: mf.options.int_indexes[fidx] + '_int',
                    value: value
                });
            }
            var writeopts = {
                indexes: indexes,
                bucket: opts.bucket,
                vclock: this.vclock,
            };
            if (!this.key) {
                this.getNextKey(opts, function (kerr, key) {
                    this.key = key;
                    opts.db.increment('__total__', 1, {bucket: opts.bucket}, function (err, ctr) {
                        opts.db.put('__main__!' + key, this.prepJSON(), writeopts, function (err, extra) {
                            if (typeof extra === 'object' && extra.hasOwnProperty('vclock')) {
                                this.vclock = extra.vclock;
                            }
                            if (typeof mf.options.onSave === 'function') {
                                mf.options.onSave.call(this, err, {model: this, changes: this.getChanges(), ctx: opts.ctx, saveOpts: opts}, opts.cb);
                            } else {
                                opts.cb(err);
                            }
                        }.bind(this));
                    }.bind(this));
                }.bind(this));
            } else {
                opts.db.put('__main__!' + this.key, this.prepJSON(), writeopts, function (err, vclock) {

                    this.vclock = vclock;
                    if (typeof mf.options.onSave === 'function') {
                        mf.options.onSave.call(this, err, {model: this, changes: this.getChanges(), ctx: opts.ctx, saveOpts: opts}, opts.cb);
                    } else {
                        opts.cb(err);
                    }
                }.bind(this));
            }
        },
        save: function (opts, callback) {
            opts = mf.handleOpts(mf.options.name + '.save', opts, callback);
            if (!opts.withoutLock) {
                callback = opts.cb;
                opts.cb = function () {
                    mf.options.savelock.release();
                    callback.apply(null, arguments);
                }.bind(this);
                mf.options.savelock.runwithlock(this.__save.bind(this), [opts], this);
            } else {
                this.__save(opts);
            }
        },
        __delete: function (opts) {
            opts.bucket = this.__setBucket(opts.bucket);
            opts.db.del('__main__!' + this.key, {bucket: opts.bucket}, function (err) {
                opts.db.increment('__total__', -1, {bucket: opts.bucket, model: mf.options.name}, function (err, ctr) {
                    if (typeof mf.options.onDelete === 'function') {
                        mf.options.onDelete.call(this, err, {model: this, ctx: opts.ctx, deleteOpts: opts}, opts.cb);
                    } else {
                        opts.cb(err);
                    }
                });
            }.bind(this));
        },
        delete: function (opts, callback) {
            opts = mf.handleOpts(mf.options.name + 'delete', opts, callback);
            if (!opts.withoutLock) {
                callback = opts.cb;
                opts.cb = function () {
                    mf.options.savelock.release();
                    callback.apply(null, arguments);
                }.bind(this);
                mf.options.savelock.runwithlock(this.__delete.bind(this), [opts], this);
            } else {
                this.__delete(opts);
            }
        }
    });
    return mf;
};
