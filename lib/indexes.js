var keylib = require('./keys');
var async = require('async');
var increment = require('./increment');

module.exports = function (mf) {
    mf.options.bin_indexes = [];
    mf.options.int_indexes = [];
    
    (function () {
        var def_fields = Object.keys(mf.definition);
        var newdef, def, field;
        for (var fidx in def_fields) {
            def = mf.definition[def_fields[fidx]];
            field = def_fields[fidx];
            if (def.index === true) {
                mf.options.bin_indexes.push(field);
            } else if (def.index_int === true) {
                mf.options.int_indexes.push(def_fields[fidx]);
            }
        }
    })();
    
    mf.getIndexTotal = function (field, value, opts, callback) {
        opts = mf.handleOpts('Factory.getIndexTotal', opts, callback);
        if (mf.definition[field].index_int) {
            value = keylib.base60Fill(value, 10);
        }
        var key = mf.joinSep('__total__', '__index_value__', opts.prefix, field, value);
        if (opts.db.isRiak) {
            opts.db.riak.getCounter({bucket: 'levelup_default', key: key}, function (err, total) {
                if (typeof total === 'object') {
                    total = 0;
                }
                opts.cb(err, total);
            });
        } else {
            opts.db.get(mf.joinSep('__total__', '__index_value__', opts.prefix, field, value), function (err, total) {
                opts.cb(null, parseInt(total || 0, 10));
            });
        }
    };

    mf.allSortByIndex = function (field, opts, callback) {
        opts = mf.handleOpts('Factory.allSortByIndex', opts, callback);
        opts.sortBy = field;
        mf.all(opts, opts.cb);
    };

    mf.getByIndex = function (field, value, opts, callback) {
        opts = mf.handleOpts('Factory.getByIndex', opts, callback);
        opts.index = field;
        opts.indexValue = value;
        mf.all(opts, opts.cb);
    };
    
    mf.findByIndex = function (field, value, opts, callback) {
        opts = mf.handleOpts('Factory.findByIndex', opts, callback);
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
                    increment.incrementKey({db: db, key: keylib.joinSep(mf, '__counter__', '__index_value__', prefix, field, value), change: 1}, acb);
                },
                function (count, acb) {
                    var ikey = keylib.joinSep(mf, '__index__', prefix, field, value, keylib.base60Fill(count, 8));
                    db.put(ikey, this.key, function (err) {
                        var index = {key: ikey, value: value};
                        acb(err, index);
                    });
                }.bind(this),
                function (index, acb) {
                    increment.incrementTotal({db: db, key: keylib.joinSep(mf, '__total__', '__index_value__', prefix, field, value), change: 1}, function (err) {
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
                    increment.incrementTotal({db: db, key: keylib.joinSep(mf, '__total__', '__index_value__', prefix, field, value), change: -1}, acb);
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
                        async.each(mf.options.bin_indexes, function (field, ecb) {
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
                        async.each(mf.options.int_indexes, function (field, ecb) {
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

    });
    
    return mf;
};
