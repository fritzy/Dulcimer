var async = require('async');
var keylib = require('./keys');
var dbstreams  = require('./streams');
var concat     = require('concat-stream');

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
        opts.db.get(getkey, {bucket: opts.bucket}, function (err, result) {
            var obj, out;
            if (!err && result) {
                obj = mf.create(result);
                obj.key = key;
                obj.bucket = opts.bucket;
                console.log("loading foreign!");
                obj._loadForeign(opts.db, opts.bucket, opts.depth, opts.cb);
            } else {
                opts.cb(err);
            }
        });
    };

    mf.get = mf.load;

    mf.joinSep = function () {
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift(mf);
        return keylib.joinSep.apply(this, args);
    };

    mf.delete = function (key, opts, callback) {
        mf.options.savelock.runwithlock(function () {
            opts = mf.handleOpts('Factory.delete', opts, callback);
            var optcb = opts.cb;
            mf.get('__main__' + '!' + key, opts, function (err, inst) {
                if (!err && inst) {
                    opts.cb = optcb;
                    mf.options.savelock.release();
                    inst.__delete(opts, optcb);
                } else {
                    mf.options.savelock.release();
                    optcb("Not found");
                }
            });
        }.bind(this));
    };

    mf.wipe = function (opts, callback) {
        opts = mf.handleOpts('Factory.wipe', opts, callback);
        async.series([
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep(mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__index__', mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__meta__', mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                //counters don't trail with ! so no "undefined" parameter
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__counter__', mf.options.name),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__total__', mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__child__', mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__total__', '__index_value__', mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix({
                    db: opts.db,
                    prefix: mf.joinSep('__counter__', '__index_value__', mf.options.name, undefined),
                    bucket: opts.bucket
                }, scb);
            },
        ], function (err) {
            opts.cb(err);
        });
    };

    mf.update = function (key, updated_fields, opts, callback) {
        mf.options.savelock.runwithlock(function () {
            opts = mf.handleOpts('Factory.update', opts, callback);
            if (typeof key === 'undefined') {
                throw new Error("key cannot be undefined for update in " + mf.options.name);
            } else if (typeof key === 'number') {
                key = keylib.joinSep(mf, mf.options.name, keylib.base60Fill(key, 8));
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
        var limit = opts.limit || -1;

        var streamType = 'base';
        //yo dawg, I heard you like streams
        var laststream;

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

        console.log("all", streamType, opts.index);
        console.log(opts.bucket);

        if (streamType === 'base') {
            //read in all of the key and values from prefix -> prefix~
            laststream = dbstreams.createPrefixEntryReadStream({db: opts.db, prefix: '__main__!', reverse: opts.reverse, bucket: opts.bucket, model: mf.options.name});
        } else if (streamType === 'index') {
            //read all of the index-values of the index
            if (opts.index.substr(-4) === '_int') {
                laststream = dbstreams.createIndexRangeEntryReadStream({db: opts.db, start: -9999999999, end: 9999999999, reverse: opts.reverse, index: opts.index, bucket: opts.bucket});
            } else {
                laststream = dbstreams.createIndexRangeEntryReadStream({db: opts.db, start: '!', end: '~', reverse: opts.reverse, index: opts.index, bucket: opts.bucket});
            }
        } else if (streamType === 'index-value') {
            console.log("index-value", opts.index, opts.indexValue);
            //read all of the index-values of a specific value
            laststream = dbstreams.createIndexPrefixEntryReadStream({db: opts.db, prefix: opts.indexValue, reverse: opts.reverse, index: opts.index, bucket: opts.bucket});
        } else if (streamType === 'index-range') {
            laststream = dbstreams.createIndexRangeEntryReadStream({db: opts.db, start: opts.indexRange.start, end: opts.indexRange.end, reverse: opts.reverse, index: opts.index, bucket: opts.bucket});
        }

        //if offset or limit, cull the results
        if (offset > 0 || limit != -1) {
            console.log("offset");
            laststream = laststream.pipe(new dbstreams.OffsetCountStream(offset, limit));
        }

        //turn results into models
        laststream = laststream.pipe(new dbstreams.EntryToModelStream(mf, opts.parent));

        //filter out anything the filters rule say
        if (opts.filter) {
            console.log("filtering");
            laststream = laststream.pipe(new dbstreams.FilterModelStream(opts.filter));
        }

        //if foreign keys, get them for each model
        if (mf.options.foreignkey_fields.length > 0 || mf.options.collection_fields.length > 0) {
            console.log("loading foreign keys");
            laststream = laststream.pipe(new dbstreams.OnEachStream(function (inst, next) {
                inst._loadForeign(opts.db, opts.bucket, opts.depth, next);
            }));
        }

        //called when all is done
        function gotTotal(err, total, models) {
            console.log("gotTotal", total, models.length);
            opts.cb(err, models, {count: models.length, offset: offset, limit: limit, total: total});
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
            } else {
                //get total for just this indexed value (streamType == index-value)
                mf.getIndexTotal(index_field, opts.indexValue, {db: opts.db, bucket: opts.bucket}, function (err, total) {
                    gotTotal(err, total, models);
                });
            }
        }));
    };

    mf.getTotal = function (opts, callback) {
        opts = mf.handleOpts('Factory.getTotal', opts, callback);
        opts.db.get('__total__', {bucket: opts.bucket}, function (err, total) {
            if (!total) {
                total = 0;
            }
            opts.cb(err, total);
        });
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
            console.log("save as", out);
            return out;
        },
        __setBucket: function(bucket) {
            if (this.__verymeta.parent) {
                bucket = [bucket, this.__verymeta.parent.__verymeta.name, '__child__', this.__verymeta.parent.key, mf.options.name];
            } else {
                bucket = [bucket, mf.options.name];
            }
            return bucket;
        },
        __save: function (opts) {
            opts.bucket = this.__setBucket(opts.bucket);
            var indexes = [];
            for (var fidx in mf.options.bin_indexes) {
                indexes.push({
                    key: mf.options.bin_indexes[fidx] + '_bin',
                    value: this[mf.options.bin_indexes[fidx]]
                });
            }
            for (fidx in mf.options.int_indexes) {
                indexes.push({
                    key: mf.options.int_indexes[fidx] + '_int',
                    value: this[mf.options.int_indexes[fidx]]
                });
            }
            if (!this.key) {
                this.getNextKey(opts, function (kerr, key) {
                    opts.db.put('__total__', 1, {type: 'increment', bucket: opts.bucket, model: mf.options.name}, function (err, ctr) {
                        opts.db.put('__main__!' + key, this.prepJSON(), {withVClock: true, indexes: indexes, bucket: opts.bucket, model: mf.options.name}, function (err, vclock) {
                            this.vclock = vclock;
                            this.key = key;
                            if (typeof mf.options.onSave === 'function') {
                                mf.options.onSave.call(this, err, {model: this, changes: this.getChanges(), ctx: opts.ctx, saveOpts: opts}, opts.cb);
                            } else {
                                opts.cb(err);
                            }
                        }.bind(this));
                    }.bind(this));
                }.bind(this));
            } else {
                opts.db.put('__main__!' + this.key, this.prepJSON(), {withVClock: true, vclock: this.vclock, indexes: indexes, bucket: opts.bucket, model: mf.options.name}, function (err, vclock) {

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
                opts.db.put('__total__', -1, {type: 'increment', bucket: opts.bucket, model: mf.options.name}, function (err, ctr) {
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
