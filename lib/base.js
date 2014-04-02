var async = require('async');
var keylib = require('./keys');
var dbstreams  = require('./streams');
var concat     = require('concat-stream');
var increment  = require('./increment');

module.exports = function (mf) {

    mf.load = function (key, opts, callback) {
        //if this isn't a child and the user didn't include the prefix, add it
        opts = mf.handleOpts('Factory.get', opts, callback);

        if (typeof key === 'undefined') {
            throw new Error("key cannot be undefined for get/load in " + mf.options.name);
        } else if (typeof key === 'number') {
            key = keylib.joinSep(mf, mf.options.name, keylib.base60Fill(key, 8));
        } 
        if (typeof key !== 'string') {
            opts.cb("Invalid key type");
            return;
        }

        if (keylib.getLastChildPrefix(mf, key) !== this.options.prefix) {
            key = keylib.joinSep(mf, mf.options.name, key);
        }
        opts.db.get(key, function (err, result) {
            var obj, out;
            if (!err) {
                obj = mf.create(result);
                obj.key = key;
                obj._loadForeign(opts.db, opts.depth, opts.cb);
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
            mf.get(key, opts, function (err, inst) {
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
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep(mf.options.name, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__index__', mf.options.name, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__meta__', mf.options.name, undefined), scb);
            },
            function (scb) {
                //counters don't trail with ! so no "undefined" parameter
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__counter__', mf.options.name), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__total__', mf.options.name, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__child__', mf.options.name, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__total__', '__index_value__', mf.options.name, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__counter__', '__index_value__', mf.options.name, undefined), scb);
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
            opts.indexValue = String(opts.indexValue);
        } else if (opts.hasOwnProperty('indexRange')) {
            streamType = 'index-range';
        }

        if (!opts.db.isRiak) {
            if (streamType === 'index' || streamType === 'index-value' || streamType == 'index-range') {
                //if we're looking for an field index, and that field isn't indexed, abort
                if (mf.definition[opts.index].index !== true && mf.definition[opts.index].index_int !== true) {
                    opts.cb("Field " + opts.index + " is not indexed.");
                    return;
                }
                //if the indexed field is indexed as an int, convert it to base60 for sorting
                if (mf.definition[opts.index].index_int === true && streamType == 'index-range') {
                    if (opts.indexRange.start) opts.indexRange.start = keylib.base60Fill(opts.indexRange.start, 10);
                    if (opts.indexRange.end) opts.indexRange.end = keylib.base60Fill(opts.indexRange.end, 10);
                } else if (mf.definition[opts.index].index_int === true) {
                    opts.indexValue = keylib.base60Fill(opts.indexValue, 10);
                }
            }
        }

        var index_field = opts.index;

        if (opts.index) {
            if (opts.db.isRiak && mf.definition[opts.index].index_int === true) {
                opts.index = mf.options.name + '!' + opts.index + '_int';
            } else if (opts.db.isRiak) {
                opts.index = mf.options.name + '!' + opts.index + '_bin';
            }
        }

        if (opts.db.isRiak) {
            if (streamType === 'base') {
                //read in all of the key and values from prefix -> prefix~
                laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep(opts.prefix, undefined), opts.reverse);
            } else if (streamType === 'index') {
                //read all of the index-values of the index
                if (opts.index.substr(-4) === '_int') {
                    laststream = dbstreams.createIndexRangeEntryReadStream(opts.db, -9999999999, 9999999999, opts.reverse, opts.index);
                } else {
                    laststream = dbstreams.createIndexRangeEntryReadStream(opts.db, '!', '~', opts.reverse, opts.index);
                }
            } else if (streamType === 'index-value') {
                //read all of the index-values of a specific value
                laststream = dbstreams.createIndexPrefixEntryReadStream(opts.db, opts.indexValue, opts.reverse, opts.index);
            } else if (streamType === 'index-range') {
                laststream = dbstreams.createIndexRangeEntryReadStream(opts.db, opts.indexRange.start, opts.indexRange.end, opts.reverse, opts.index);
            }
        } else {
            if (streamType === 'base') {
                //read in all of the key and values from prefix -> prefix~
                laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep(opts.prefix, undefined), opts.reverse);
            } else if (streamType === 'index') {
                //read all of the index-values of the index
                laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep('__index__', opts.prefix, opts.sortBy, undefined), opts.reverse, opts.index);
            } else if (streamType === 'index-value') {
                //read all of the index-values of a specific value
                laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep('__index__', opts.prefix, opts.index, opts.indexValue, undefined), opts.reverse, opts.index);
            } else if (streamType === 'index-range') {
                laststream = dbstreams.createRangeEntryReadStream(opts.db, mf.joinSep('__index__', opts.prefix, opts.index, opts.indexRange.start), mf.joinSep('__index__', opts.prefix, opts.index, opts.indexRange.end), opts.reverse, opts.index);
            }
        }

        //if offset or limit, cull the results
        if (offset > 0 || limit != -1) {
            laststream = laststream.pipe(new dbstreams.OffsetCountStream(offset, limit));
        }

        //if we got the values from an index stream, we need to load the actual entries
        if (!opts.db.isRiak && (streamType === 'index' || streamType === 'index-value' || streamType === 'index-range')) {
            laststream = laststream.pipe(new dbstreams.KeyValueGetStream(opts.db));
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
                inst._loadForeign(opts.db, opts.depth, next);
            }));
        }

        //called when all is done
        function gotTotal(err, total, models) {
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
                mf.getTotal({db: opts.db, prefix: opts.prefix}, function (err, total) {
                    gotTotal(err, total, models);
                });
            } else {
                //get total for just this indexed value (streamType == index-value)
                mf.getIndexTotal(index_field, opts.indexValue, {db: opts.db, prefix: opts.prefix}, function (err, total) {
                    gotTotal(err, total, models);
                });
            }
        }));
    };

    mf.getTotal = function (opts, callback) {
        opts = mf.handleOpts('Factory.getTotal', opts, callback);
        var key = keylib.joinSep(mf, '__total__', opts.prefix);
        if (opts.db.isRiak) {
            opts.db.riak.getCounter({bucket: 'default_levelup', key: key}, function (err, reply) {
                var total;
                if (!reply.value) {
                    total = 0;
                } else {
                    total = reply.value.low;
                }
                opts.cb(err, total);
            });
        } else {
            opts.db.get(keylib.joinSep(mf, '__total__', opts.prefix), {valueEncoding: 'utf8'}, function (err, total) {
                opts.cb(null, parseInt(total || 0, 10));
            });
        }
    };
    
    mf.extendModel({
        getNextKey: function (opts, callback)  {
            var prefix = this.getPrefix();
            increment.incrementKey(opts.db, keylib.joinSep(mf, '__counter__', prefix), 1, function (err, ctr) {
                var newkey = keylib.joinSep(mf, prefix, keylib.base60Fill(ctr, 8));
                callback(err, newkey);
            }.bind(this));
        },
        getPrefix: function () {
            var prefix = mf.options.name;
            if (this.__verymeta.parent) {
                prefix = keylib.joinChild(mf, keylib.joinSep(mf, '__child__', this.__verymeta.parent.key), prefix);
            }
            return prefix;
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
                    delete out[field];
                }
            }
            return out;
        },
        __save: function (opts) {
            if (opts.db.isRiak) {
                var indexes = [];
                for (var fidx in mf.options.bin_indexes) {
                    indexes.push({
                        key: mf.options.name + '!' + mf.options.bin_indexes[fidx] + '_bin',
                        value: this[mf.options.bin_indexes[fidx]]
                    });
                }
                for (fidx in mf.options.int_indexes) {
                    indexes.push({
                        key: mf.options.name + '!' + mf.options.int_indexes[fidx] + '_int',
                        value: this[mf.options.int_indexes[fidx]]
                    });
                }
                if (!this.key) {
                    this.getNextKey(opts, function (kerr, key) {
                        increment.incrementKey(opts.db, keylib.joinSep(mf, '__total__', this.getPrefix()), 1, function (err, ctr) {
                            opts.db.put(key, this.prepJSON(), {withVClock: true, indexes: indexes}, function (err, vclock) {
                                this.vclock = vclock;
                                this.key = key;
                                opts.cb(err);
                            }.bind(this));
                        }.bind(this));
                    }.bind(this));
                } else {
                    opts.db.put(this.key, this.prepJSON(), {withVClock: true, vclock: this.vclock, indexes: indexes}, function (err, vclock) {

                        this.vclock = vclock;
                        opts.cb(err);
                    }.bind(this));
                }
            } else {
                async.waterfall([
                    function (acb) {
                        //generate key if we need one
                        if (this.key) {
                            acb(null, this.key);
                        } else {
                            this.getNextKey(opts, function (kerr, key) {
                                increment.incrementKey(opts.db, keylib.joinSep(mf, '__total__', this.getPrefix()), 1, function (err, ctr) {
                                    acb(kerr, key);
                                });
                            }.bind(this));
                        }
                    }.bind(this),
                    function (key, acb) {
                        //save the key
                        this.key = key;
                        var out = this.prepJSON();
                        opts.db.put(this.key, out, acb);
                    }.bind(this),
                    function (acb) {
                        //update indexes
                        if (mf.options.int_indexes.length || mf.options.bin_indexes.length) {
                            this._updateIndexes({bucket: opts.bucket, db: opts.db}, acb);
                        } else {
                            acb();
                        }
                    }.bind(this),
                ],
                function (err) {
                    //call onsave and callback
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
            callback = opts.cb;
            opts.cb = function () {
                mf.options.savelock.release();
                callback.apply(null, arguments);
            }.bind(this);
            mf.options.savelock.runwithlock(this.__save.bind(this), [opts], this);
        },
        __delete: function (opts) {
            if (opts.db.isRiak) {
                opts.db.del(this.key, function (err) {
                    increment.incrementKey(opts.db, keylib.joinSep(mf, '__total__', this.getPrefix()), -1, function (err, ctr) {
                        opts.cb();
                    });
                }.bind(this));
            } else {
                async.waterfall([
                    function (wcb) {
                        opts.db.del(this.key, wcb);
                    }.bind(this),
                    function (wcb) {
                        opts.db.get(keylib.joinSep(mf, '__meta__', this.key), function (err, meta) {
                            if (err) {
                                meta = {bin_indexes: {}, int_indexes: {}};
                            }
                            wcb(null, meta);
                        });
                    }.bind(this),
                    function (meta, wcb) {
                        increment.incrementKey(opts.db, keylib.joinSep(mf, '__total__', this.getPrefix()), -1, function (err, ctr) {
                            wcb(err, meta);
                        });
                    }.bind(this),
                    function (meta, wcb) {
                        async.each(meta.bin_indexes,
                        function (field, ecb) {
                            this._deleteIndex(opts.db, field, this[field], this.key, ecb);
                        }.bind(this),
                        function (err) {
                            wcb(err, meta);
                        });
                    }.bind(this),
                    function (meta, wcb) {
                        async.each(meta.int_indexes, function (field, acb) {
                            var value = keylib.base60Fill(parseInt(this[field], 10));
                            this._deleteIndex(opts.db, field, value, this.key, acb);
                        }.bind(this),
                        wcb);
                    }.bind(this),
                    function (wcb) {
                        opts.db.del(keylib.joinSep(mf, '__meta__', this.key), function (err) {
                            wcb(null);
                        });
                    }.bind(this)
                ],
                function (err) {
                    if (typeof mf.options.onDelete === 'function') {
                        mf.options.onDelete.call(this, err, {model: this, ctx: opts.ctx, deleteOpts: opts}, opts.cb);
                    } else {
                        opts.cb(err);
                    }
                }.bind(this));
            }
        },
        delete: function (opts, callback) {
            opts = mf.handleOpts(mf.options.name + 'delete', opts, callback);
            callback = opts.cb;
            opts.cb = function () {
                mf.options.savelock.release();
                callback.apply(null, arguments);
            }.bind(this);
            mf.options.savelock.runwithlock(this.__delete.bind(this), [opts], this);
        }
    });
    return mf;
};
