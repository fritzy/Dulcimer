var verymodel  = require('verymodel');
var uuid       = require('node-uuid');
var async      = require('async');
var base60     = require('base60');
var Padlock    = require('padlock').Padlock;
var keylib     = require('./lib/keys');
var underscore = require('underscore');
var getDBPath  = require('./lib/dbpool');
var dbstreams  = require('./lib/streams');
var concat     = require('concat-stream');

function makeModelLevely(mf) {

    var savelock = new Padlock();

    function incrementKey(db, key, change, callback) {
        var count;
        db.get(key, {valueEncoding: 'utf8'}, function (err, val) {
            if (err || !val) {
                count = 0;
            } else {
                count = parseInt(val, 10);
            }
            count += change;
            db.put(key, count, {valueEncoding: 'utf8'}, function (err, val) {
                savelock.release();
                callback(err, count);
            });
        });
    }

    mf.getBucketDB = function (bucket) {
        if (mf.options.dbdir.substr(-1) !== '/') {
            mf.options.dbdir += '/';
        }
        return getDBPath(mf.options.dbdir + bucket + '.db');
    };

    if (mf.options.dbdir) {
        mf.options.db = mf.getBucketDB(mf.options.bucket || 'defaultbucket');
    }

    if (typeof mf.options.prefix !== 'string') {
        throw new Error("Model factories must include a prefix option.");
    }

    mf.addDefinition({
        key: {
            derive: function () {
                var value;
                if (this.__verymeta.data.key) return this.__verymeta.data.key;
                if (this.__verymeta.parent) {
                    value = keylib.joinChild(mf, keylib.joinSep(mf, ('__child__', this.__verymeta.parent.key)), this.__verymeta.prefix, undefined);
                } else {
                    value = this.__verymeta.prefix + (this.__verymeta.sep || '!');
                }
                if (!this.keyname) {
                    return '';
                }
                value += this.keyname;
                return value;
            },
            private: !mf.options.includeKey,
        },
        keyname: {
            private: !mf.options.includeKey,
        },
    });


    var bin_indexes = [];
    var int_indexes = [];
    var foreignkey_fields = [];
    var collection_fields = [];

    var def_fields = Object.keys(mf.definition);

    (function () {
        var newdef, def, field;
        for (var fidx in def_fields) {
            def = mf.definition[def_fields[fidx]];
            field = def_fields[fidx];
            if (def.index === true) {
                bin_indexes.push(field);
            } else if (def.index_int === true) {
                int_indexes.push(def_fields[fidx]);
            }
            if (def.hasOwnProperty('foreignKey')) {
                foreignkey_fields.push(field);
            } else if (def.hasOwnProperty('foreignCollection')) {
                collection_fields.push(field);
            }
        }
    })();

    mf.bucket = function (bucket) {
        var opts = underscore.clone(mf.options);
        opts.bucket = bucket;
        return new VeryLevelModel(mf.definition, opts);
    };

    function handleOpts(name, opts, callback) {
        if (typeof callback === 'undefined') {
            opts = {cb: opts};
        } else {
            opts.cb = callback;
        }
        if (opts.bucket) {
            opts.db = mf.getBucketDB(opts.bucket);
        } else if (!opts.db) {
            opts.db = mf.options.db;
        }
        if (typeof opts.cb !== 'function') {
            throw Error('The last argument in ' + name + 'must be a function');
        }
        if (!opts.db) {
            throw new Error("Model factories must include a db option of a levelup instance with valueEncoding of json.");
        }
        if (opts.db.isClosed()) {
            mf.options.db = opts.db = mf.getBucketDB(mf.options.bucket || 'defaultbucket');
        }
        if (typeof opts.depth === 'undefined') {
            opts.depth = 5;
        }
        opts.prefix = opts.prefix || mf.options.prefix;
        return opts;
    }

    mf.load = function (key, opts, callback) {
        //if this isn't a child and the user didn't include the prefix, add it
        opts = handleOpts('Factory.get', opts, callback);

        if (typeof key === 'undefined') {
            throw new Error("key cannot be undefined for get/load in " + mf.options.prefix);
        } else if (typeof key === 'number') {
            key = keylib.joinSep(mf, mf.options.prefix, base60.encode(key));
        }

        if (keylib.getLastChildPrefix(mf, key) !== this.options.prefix) {
            key = keylib.joinSep(mf, mf.options.prefix, key);
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
        savelock.runwithlock(function () {
            opts = handleOpts('Factory.delete', opts, callback);
            var optcb = opts.cb;
            mf.get(key, opts, function (err, inst) {
                if (!err && inst) {
                    opts.cb = optcb;
                    savelock.release();
                    inst.__delete(opts, optcb);
                } else {
                    savelock.release();
                    optcb("Not found");
                }
            });
        }.bind(this));
    };
    
    mf.wipe = function (opts, callback) {
        opts = handleOpts('Factory.wipe', opts, callback);
        async.series([
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep(mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__index__', mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__meta__', mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__counter__', mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__total__', mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__child__', mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__total__', '__index_value__', mf.options.prefix, undefined), scb);
            },
            function (scb) {
                dbstreams.deleteKeysWithPrefix(opts.db, mf.joinSep('__counter__', '__index_value__', mf.options.prefix, undefined), scb);
            },
        ], function (err) {
            opts.cb(err);
        });
    };
    

    mf.update = function (key, updated_fields, opts, callback) {
        savelock.runwithlock(function () {
            opts = handleOpts('Factory.update', opts, callback);
            if (typeof key === 'undefined') {
                throw new Error("key cannot be undefined for update in " + mf.options.prefix);
            } else if (typeof key === 'number') {
                key = keylib.joinSep(mf, mf.options.prefix, base60.encode(key));
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
                            savelock.release();
                            cb(err, result);
                        };
                        result.__save(opts);
                    } else {
                        savelock.release();
                        opts.cb(errors);
                    }
                } else {
                    savelock.release();
                    opts.cb(err);
                }
            });
        }.bind(this));
    };

    mf.all = function (opts, callback) {
        opts = handleOpts('Factory.all', opts, callback);
        var offset = opts.offset || 0;
        var limit = opts.limit || -1;

        var streamType = 'base';
        var laststream;

        //if we're sorting by an index...
        if (opts.hasOwnProperty('sortBy')) {
            streamType = 'index';
            opts.index = opts.sortBy;
        //if we're sorting by an index value...
        } else if (opts.hasOwnProperty('indexValue')) {
            streamType = 'index-value';
            opts.indexValue = String(opts.indexValue);
        }

        if (streamType === 'index' || streamType === 'index-value') {
            //if we're looking for an field index, and that field isn't indexed, abort
            if (mf.definition[opts.index].index !== true && mf.definition[opts.index].index_int !== true) {
                opts.cb("Field " + opts.index + " is not indexed.");
                return;
            }
            //if the indexed field is indexed as an int, convert it to base60 for sorting
            if (mf.definition[opts.index].index_int === true) {
                opts.indexValue = keylib.base60Fill(opts.indexValue, 10);
            }
        }

        if (streamType === 'base') {
            //read in all of the key and values from prefix -> prefix~
            laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep(opts.prefix, undefined), opts.reverse);
        } else if (streamType === 'index') {
            //read all of the index-values of the index
            laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep('__index__', opts.prefix, opts.sortBy, undefined), opts.reverse);
        } else if (streamType === 'index-value') {
            //read all of the index-values of a specific value
            laststream = dbstreams.createPrefixEntryReadStream(opts.db, mf.joinSep('__index__', opts.prefix, opts.index, opts.indexValue, undefined), opts.reverse);
        }

        //if offset or limit, cull the results
        if (offset > 0 || limit != -1) {
            laststream = laststream.pipe(new dbstreams.OffsetCountStream(offset, limit));
        }

        //if we got the values from an index stream, we need to load the actual entries
        if (streamType === 'index' || streamType === 'index-value') {
            laststream = laststream.pipe(new dbstreams.KeyValueGetStream(opts.db));
        }

        //turn results into models
        laststream = laststream.pipe(new dbstreams.EntryToModelStream(mf, opts.parent));
 
        //if foreign keys, get them for each model
        if (foreignkey_fields.length > 0 || collection_fields.length > 0) {
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
                mf.getIndexTotal(opts.index, opts.indexValue, {db: opts.db, prefix: opts.prefix}, function (err, total) {
                    gotTotal(err, total, models);
                });
            }
        }));
    };

    mf.getTotal = function (opts, callback) {
        opts = handleOpts('Factory.getTotal', opts, callback);
        opts.db.get(keylib.joinSep(mf, '__total__', opts.prefix), {valueEncoding: 'utf8'}, function (err, cnt) {
            if (!cnt) cnt = 0;
            cnt = parseInt(cnt, 10);
            opts.cb(null, cnt);
        });
    };
    

    mf.getIndexTotal = function (field, value, opts, callback) {
        opts = handleOpts('Factory.getIndexTotal', opts, callback);
        opts.db.get(keylib.indexName(mf, field, value, this.definition[field].index_int), function (err, index) {
            var count = 0;
            if (!err && index && index.hasOwnProperty(value) && Array.isArray(index[value])) {
                count = index[value].length;
            }
            opts.cb(null, count);
        });
    };

    mf.allSortByIndex = function (field, opts, callback) {
        opts = handleOpts('Factory.allSortByIndex', opts, callback);
        opts.sortBy = field;
        mf.all(opts, opts.cb);
    };

    mf.getByIndex = function (field, value, opts, callback) {
        opts = handleOpts('Factory.getByIndex', opts, callback);
        opts.index = field;
        opts.indexValue = value;
        mf.all(opts, opts.cb);
    };
    
    mf.findByIndex = function (field, value, opts, callback) {
        opts = handleOpts('Factory.findByIndex', opts, callback);
        opts.limit = 1;
        mf.getByIndex(field, value, {db: opts.db, bucket: opts.bucket}, function (err, results) {
            if (Array.isArray(results) && results.length > 0) {
                results = results[0];
            } else {
                results = undefined;
            }
            opts.cb(err, results);
        });
    };

    mf.extendModel({
        getNextKey: function (opts, callback)  {
            var prefix = this.getPrefix();
            incrementKey(opts.db, keylib.joinSep(mf, '__counter__', prefix), 1, function (err, ctr) {
                var value;
                value = base60.encode(ctr);
                value = '00000000'.slice(0, 8 - value.length) + value;
                value = keylib.joinSep(mf, prefix, value);
                callback(err, value);
            }.bind(this));
        },
        getPrefix: function () {
            var prefix = mf.options.prefix;
            if (this.__verymeta.parent) {
                prefix = keylib.joinChild(mf, keylib.joinSep(mf, '__child__', this.__verymeta.parent.key), prefix);
            }
            return prefix;
        },
        toJSONKeys: function () {
            var field, fidx;
            var out = this.toJSON();
            for (fidx in foreignkey_fields) {
                field = foreignkey_fields[fidx];
                if (typeof out[field] === 'object') {
                    out[field] = this[field].key;
                }
            }
            for (fidx in collection_fields) {
                field = collection_fields[fidx];
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
            return out;
        },
        __save: function (opts) {
            var newkey = false;
            async.waterfall([
                function (acb) {
                    //generate key if we need one
                    if (this.key) {
                        acb(null, this.key);
                    } else {
                        newkey = true;
                        this.getNextKey(opts, acb);
                    }
                }.bind(this),
                function (key, acb) {
                    //save the key
                    this.key = key;
                    var out = this.toJSONKeys();
                    opts.db.put(this.key, out, acb);
                }.bind(this),
                function (acb) {
                    //increment the total
                    var totalkey;
                    if (newkey) {
                        totalkey = this.getPrefix();
                        totalkey = keylib.joinSep(mf, '__total__', totalkey);
                        incrementKey(opts.db, totalkey, 1, function (err, ctr) {
                            acb();
                        });
                    } else {
                        acb();
                    }
                }.bind(this),
                function (acb) {
                    //update indexes
                    if (int_indexes.length || bin_indexes.length) {
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
        },
        save: function (opts, callback) {
            opts = handleOpts(mf.options.prefix + '.save', opts, callback);
            callback = opts.cb;
            opts.cb = function () {
                savelock.release();
                callback.apply(null, arguments);
            }.bind(this);
            savelock.runwithlock(this.__save.bind(this), [opts], this);
        },
        _loadForeign: function (db, depth, callback) {
            var obj = this;
            async.waterfall(
                [function (wcb) {
                    if (foreignkey_fields.length > 0 && depth > 0) {
                        async.each(foreignkey_fields,
                        function (field, ecb) {
                            if (typeof obj[field] !== 'undefined') {
                                mf.definition[field].foreignKey.load(obj[field], {db: db, depth: depth - 1}, function (err, subresult) {
                                    obj[field] = subresult;
                                    ecb(err);
                                });
                            } else {
                                ecb();
                            }
                        },
                        wcb);
                    } else {
                        wcb();
                    }
                },
                function (wcb) {
                    if (collection_fields.length > 0 && depth > 0) {
                        async.each(collection_fields,
                        function (field, ecb) {
                            var collection = [];
                            if (Array.isArray(obj[field])) {
                                async.each(obj[field],
                                function (key, acb) {
                                    mf.definition[field].foreignCollection.load(key, {db: db, depth: depth - 1}, function (err, subresult) {
                                        collection.push(subresult);
                                        acb(err);
                                    });
                                },
                                function (err) {
                                    obj[field] = collection;
                                    ecb(err);
                                });
                            } else {
                                ecb();
                            }
                        },
                        wcb);
                    } else {
                        wcb();
                    }
                }],
            function (err) {
                callback(err, obj);
            });
        },
        _updateIndex: function (db, field, oldikey, prefix, oldvalue, newvalue, callback) {
            async.waterfall([
                function (acb) {
                    this._deleteIndex(db, prefix, oldikey, field, oldvalue, function (err) {
                        acb(null);
                    });
                }.bind(this),
                function (acb) {
                    this._saveIndex(db, prefix, field, newvalue, acb);
                }.bind(this),
            ],
            function (err, index) {
                callback(err, index);
            });
        },
        _saveIndex: function (db, prefix, field, value, callback) {
            async.waterfall([
                function (acb) {
                    incrementKey(db, keylib.joinSep(mf, '__counter__', '__index_value__', prefix, field, value), 1, acb);
                },
                function (count, acb) {
                    var ikey = keylib.joinSep(mf, '__index__', prefix, field, value, keylib.base60Fill(count, 8));
                    db.put(ikey, this.key, function (err) {
                        var index = {key: ikey, value: value};
                        acb(err, index);
                    });
                }.bind(this),
                function (index, acb) {
                    incrementKey(db, keylib.joinSep(mf, '__total__', '__index_value__', prefix, field, value), 1, function (err) {
                        acb(err, index);
                    });
                },
            ],
            function (err, index) {
                callback(err, index);
            });
        },
        _deleteIndex: function (db, prefix, oldikey, field, value, callback) {
            async.waterfall([
                function (acb) {
                    db.del(oldikey, acb);
                },
                function (acb) {
                    incrementKey(db, keylib.joinSep(mf, '__total__', '__index_value__', prefix, field, value), -1, acb);
                }
            ],
            callback
            );

        },
        _updateIndexes: function (opts, callback) {
            var prefix = this.getPrefix();
            opts.db.get(keylib.joinSep(mf, '__meta__', this.key), function (err, meta) {
                var iidx, field, old_value;
                if (err || !meta) {
                    meta = {bin_indexes: {}, int_indexes: {}};
                }
                async.parallel(
                    [function (pcb) {
                        async.each(bin_indexes, function (field, ecb) {
                            var newvalue = String(this[field]);
                            if (meta.bin_indexes.hasOwnProperty(field)) {
                                if (newvalue !== meta.bin_indexes[field].value) {
                                    this._updateIndex(opts.db, field, meta.bin_indexes[field].key, prefix,  meta.bin_indexes[field].value, newvalue, function (err, index) {
                                        if (index) {
                                            meta.bin_indexes[field] = index;
                                        }
                                        ecb(err);
                                    });
                                } else {
                                    ecb(null);
                                }
                            } else {
                                this._saveIndex(opts.db, prefix, field, newvalue, function (err, index) {
                                    if (index) {
                                        meta.bin_indexes[field] = index;
                                    }
                                    ecb(err);
                                });
                            }
                        }.bind(this),
                        function (err, index) {
                            pcb(err);
                        });
                    }.bind(this),
                    function (pcb) {
                        async.each(int_indexes, function (field, ecb) {
                            var newvalue = keylib.base60Fill(parseInt(this[field], 10), 10);
                            if (meta.int_indexes.hasOwnProperty(field)) {
                                if (newvalue !== meta.bin_indexes[field].value) {

                                    this._updateIndex(opts.db, field, meta.int_indexes[field].key, prefix,  meta.bin_indexes[field].value, newvalue, function (err, index) {
                                        if (index) {
                                            meta.bin_indexes[field] = index;
                                        }
                                        ecb(err);
                                    });
                                } else {
                                    ecb(null);
                                }
                            } else {
                                this._saveIndex(opts.db, prefix, field, newvalue, function (err, index) {
                                    if (index) {
                                        meta.bin_indexes[field] = index;
                                    }
                                    ecb(err);
                                });
                            }
                        }.bind(this),
                        function (err, index) {
                            pcb(err);
                        });
                    }.bind(this)],
                    function (err) {
                        opts.db.put(keylib.joinSep(mf, '__meta__', this.key), meta, callback);
                    }.bind(this)
                );
            }.bind(this));
        },
        __delete: function (opts) {
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
                    incrementKey(opts.db, keylib.joinSep(mf, '__total__', this.getPrefix()), -1, function (err, ctr) {
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
        },
        delete: function (opts, callback) {
            opts = handleOpts(mf.options.prefix + 'delete', opts, callback);
            callback = opts.cb;
            opts.cb = function () {
                savelock.release();
                callback.apply(null, arguments);
            }.bind(this);
            savelock.runwithlock(this.__delete.bind(this), [opts], this);
        },
        createChild: function (factory, obj) {
            var clone = new VeryLevelModel(factory.definition, factory.options);
            clone.options.parent = this;
            return clone.create(obj);
        },
        getChildren: function (factory, opts, callback) {
            opts = handleOpts(mf.options.prefix + 'getChildren', opts, callback);
            var prefix = keylib.joinChild(mf, keylib.joinSep(mf, '__child__', this.key), factory.options.prefix);
            opts.prefix = prefix;
            opts.parent = this;
            factory.all(opts, opts.cb);
        },
        getChildrenByIndex: function (factory, field, value, opts, callback) {
            var prefix = keylib.joinChild(mf, keylib.joinSep(mf, '__child__', this.key), factory.options.prefix);
            opts = handleOpts(mf.options.prefix + 'getChildrenByIndex', opts, callback);
            opts.prefix = prefix;
            opts.parent = this;
            factory.getByIndex(field, value, opts, opts.cb);
        },
    });
    return mf;
}

function VeryLevelModel() {
    verymodel.VeryModel.apply(this, arguments);
    makeModelLevely(this);
}

VeryLevelModel.prototype = Object.create(verymodel.VeryModel.prototype);

module.exports = VeryLevelModel;

