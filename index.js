var verymodel = require('verymodel');
var uuid = require('node-uuid');
var async = require('async');
var base60 = require('base60');
var Padlock = require('padlock').Padlock;
var keylib = require('./lib/keys');
var underscore = require('underscore');
var getDBPath = require('./lib/dbpool');

function makeModelLevely(mf) {

    var savelock = new Padlock();

    function incrementKey(db, key, change, callback) {
        savelock.runwithlock(function () {
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

    /*
    if (!mf.options.db) {
        throw new Error("Model factories must include a db option of a levelup instance with valueEncoding of json.");
    }

    if (mf.options.db.options.valueEncoding != 'json') {
        throw new Error("The levelup db must have valueEncoding set as json.");
    }
    */

    mf.addDefinition({
        key: {
            derive: function () {
                var value;
                if (this.__verymeta.data.key) return this.__verymeta.data.key;
                if (this.__verymeta.parent) {
                    value = this.__verymeta.parent.key + (this.__verymeta.childsep || '~') + this.__verymeta.prefix + (this.__verymeta.sep || '!');
                } else {
                    value = this.__verymeta.prefix + (this.__verymeta.sep || '!');
                }
                if (!this.keyname) {
                    return '';
                }
                value += this.keyname;
                return value;
            },
            private: true,
        },
        keyname: {
            private: true
        },
    });

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
        } else {
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
            var obj;
            if (!err) {
                obj = mf.create(result);
                obj.key = key;
                opts.cb(err, obj);
            } else {
                opts.cb(err);
            }
        });
    };
    
    mf.get = mf.load;

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

    mf.update = function (key, updated_fields, opts, callback) {
        savelock.runwithlock(function () {
            opts = handleOpts('Factory.update', opts, callback);
            if (typeof key === 'undefined') {
                throw new Error("key cannot be undefined for update in " + mf.options.prefix);
            } else if (typeof key === 'number') {
                key = keylib.joinSep(mf, mf.options.prefix, base60.encode(key));
            }
            mf.load(key, function (err, result) {
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
        if (opts.hasOwnProperty('sortBy')) {
            mf.allSortByIndex(opts.sortBy, opts, callback);
            return;
        }
        var count = 0;
        var offset = opts.offset || 0;
        var limit = opts.limit || -1;
        var objects = [];
        var err, stream;
        if (opts.reverse) {
            stream = opts.db.createReadStream({
                end: mf.options.prefix + (mf.options.sep || '!'),
                start: mf.options.prefix + (mf.options.sep || '!') + '~',
                reverse: opts.reverse
            });
        } else { 
            stream = opts.db.createReadStream({
                start : mf.options.prefix + (mf.options.sep || '!'),
                end : mf.options.prefix + (mf.options.sep || '!') + '~',
                reverse: opts.reverse
            });
        }
        stream.on('data', function (entry) {
            if (entry.key.indexOf(mf.options.childsep || '~') == -1) {
                if (offset === 0) {
                    var inst = mf.create(entry.value);
                    inst.key = entry.key;
                    objects.push(inst);
                    count++;
                    if (limit !== -1 && count >= limit) {
                        stream.destroy();
                    }
                } else {
                    offset--;
                }
            }
        });
        stream.on('error', function (err) {
            opts.cb(err, null);
        });
        stream.on('close', function () {
            opts.cb(err, objects, {count: count, offset: opts.offset || 0, limit: opts.limit || -1});
        });
    };

    mf.allSortByIndex = function (index, opts, callback) {
        opts = handleOpts('Factory.allSortByIndex', opts, callback);
        var count = 0;
        var offset = opts.offset || 0;
        var limit = opts.limit || -1;
        var objects = [];
        var keys = [];
        var stream;
        if (opts.reverse) {
            stream = opts.db.createReadStream({
                end: keylib.joinSep(mf, '__index__', mf.options.prefix, index, undefined),
                start: keylib.joinSep(mf, '__index__', mf.options.prefix, index, '~'),
                reverse: opts.reverse
            });
        } else {
            stream = opts.db.createReadStream({
                start: keylib.joinSep(mf, '__index__', mf.options.prefix, index, undefined),
                end: keylib.joinSep(mf, '__index__', mf.options.prefix, index, '~'),
                reverse: opts.reverse
            });
        }
        stream.on('data', function (entry) {
            var index = entry.value;
            var values = Object.keys(index).sort();
            for (var vidx in values)  {
                for (var kidx in index[values[vidx]]) {
                    keys.push(index[values[vidx]][kidx]);
                }
            }
            if (offset > 0 && offset > keys.length) {
                offset -= keys.length;
                keys = [];
            } else if (offset > 0) {
                keys = keys.slice(offset);
                offset = 0;
            }
            if (limit !== -1 && keys.length >= limit) {
                keys = keys.slice(0, limit);
                stream.destroy();
            }
        });
        stream.on('error', function (err) {
            opts.cb(err, null);
        });
        stream.on('close', function () {
            async.eachSeries(keys,
                function (key, acb) {
                    mf.get(key, function (err, inst) {
                        if (!err || inst) {
                            objects.push(inst);
                        } else {
                            objects.push(undefined);
                        }
                        acb(null);
                    });
                },
                function (err) {
                    opts.cb(null, objects, {count: count, offset: opts.offset || 0, limit: opts.limit || -1});
                }
            );
        });
    };



    mf.getByIndex = function (field, value, opts, callback) {
        opts = handleOpts('Factory.getByIndex', opts, callback);
        var count = 0;
        var offset = opts.offset || 0;
        var limit = opts.limit || -1;
        if (this.definition[field].index === true || this.definition[field].index_int === true) {
            opts.db.get(keylib.indexName(mf, field, value, this.definition[field].index_int), function (err, index) {
                var keys;
                if (err || !index) index = {};
                if (index.hasOwnProperty(value)) {
                    keys = index[value];
                    if (opts.keyfilter) {
                        keys = keys.filter(function (key) {
                            return key.indexOf(opts.keyfilter) === 0;
                        });
                    }
                    if (offset > 0) {
                        keys = keys.slice(offset);
                    }
                    if (limit !== -1) {
                        keys = keys.slice(0, limit);
                    }
                    async.map(keys, function (key, acb) {
                        opts.db.get(key, function (err, result) {
                            var obj;
                            if (!err) {
                                obj = mf.create(result);
                                obj.key = key;
                                acb(err, obj);
                            } else {
                                acb(err);
                            }
                        }.bind(this));
                    }.bind(this),
                    function (err, results) {
                        if (limit === 1) {
                            opts.cb(err, results[0]);
                        } else {
                            opts.cb(err, results);
                        }
                    });
                } else {
                    opts.cb("no index for value");
                }
            }.bind(this));
        } else {
            opts.cb("field does not have index");
        }
    };
    
    mf.findByIndex = function (field, value, opts, callback) {
        opts = handleOpts('Factory.findByIndex', opts, callback);
        mf.getByIndex.call(this, field, value, {keyfilter: opts.keyfilter, limit: 1}, opts.cb);
    };

    function deleteFromIndex(db, field, value, key, callback) {
        var factory = mf;
        value = String(value);
        var ikey = keylib.indexName(factory, field, value);
        db.get(ikey, function (err, obj) {
            var idx, lidx;
            if (!err && obj) {
                idx = obj[value].indexOf(key);
                if (idx !== -1) {
                    obj[value].splice(idx, 1);
                    var foundvals = false;
                    var keys = Object.keys(obj);
                    for (lidx = 0; lidx < keys.length; lidx++) {
                        if (obj[keys[lidx]].length > 0) {
                            foundvals = true;
                            break;
                        }
                    }
                    if (foundvals) { 
                        db.put(ikey, obj, callback);
                    } else {
                        db.del(ikey, callback);
                    }
                } else {
                    callback();
                }
            } else {
                callback();
            }
        });
    }

    mf.extendModel({
        getNextKey: function (opts, callback)  {
            opts.db.get(keylib.joinSep(mf, '__counter__', mf.options.prefix), function (err, ctr) {
                var value;
                ctr = ctr || 0;
                ctr++;
                value = base60.encode(ctr);
                value = '00000000'.slice(0, 8 - value.length) + value;
                value = keylib.joinSep(mf, mf.options.prefix, value);
                if (this.__verymeta.parent) {
                    value = keylib.joinChild(mf, this.__verymeta.parent.key, value);
                }
                opts.db.put(keylib.joinSep(mf, '__counter__', mf.options.prefix), ctr, function (err) {
                    callback(null, value);
                });
            }.bind(this));
        },
        __save: function (opts) {
            async.waterfall([
                function (acb) {
                    if (this.key) {
                        acb(null, this.key);
                    } else {
                        this.getNextKey(opts, acb);
                    }
                }.bind(this),
                function (key, acb) {
                    this.key = key;
                    opts.db.put(this.key, this.toJSON(), acb);
                }.bind(this),
                function (acb) {
                    async.each(Object.keys(this.__verymeta.defs), function (field, scb) {
                        var ikey;
                        if (this.__verymeta.defs[field].index === true || this.__verymeta.defs[field].index_int === true) {
                            var value = this[field];
                            ikey = keylib.indexName(mf, field, value, this.__verymeta.defs[field].index_int);
                            opts.db.get(ikey, function (err, obj) {
                                var objkeys, idx, kidx;
                                if (err || !obj) {
                                    obj = {};
                                }
                                if (!obj.hasOwnProperty(String(value))) obj[value] = [];
                                if (obj[String(value)].indexOf(this.key) == -1) {
                                    obj[String(value)].push(this.key);
                                }
                                opts.db.put(ikey, obj, function (err) {
                                    if (this.__verymeta.old_data.hasOwnProperty(field) && this.__verymeta.old_data[field] != this[field]) {
                                        deleteFromIndex(opts.db, field, this.__verymeta.old_data[field], this.key, scb);
                                    } else {
                                        scb(err);
                                    }
                                }.bind(this));
                            }.bind(this));
                        } else {
                            scb();
                        }
                    }.bind(this),
                    function (err) {
                        acb(err);
                    });
                }.bind(this),
            ],
            function (err) {
                if (typeof mf.options.onSave === 'function') {
                    mf.options.onSave.call(this, err, {model: this, changes: this.getChanges(), ctx: opts.ctx}, opts.cb);
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
        __delete: function (opts) {
            opts.db.del(this.key, function (err) {
                if (err) {
                    opts.cb(err);
                    return;
                }
                async.each(Object.keys(this.__verymeta.defs), function (field, acb) {
                    if (this.__verymeta.defs[field].index === true || this.__verymeta.defs[field].index_int === true) {
                        deleteFromIndex(opts.db, field, this[field], this.key, acb);
                    } else {
                        acb();
                    }
                }.bind(this),
                function (err) {
                    if (typeof mf.options.onDelete === 'function') {
                        mf.options.onDelete.call(this, err, {model: this, ctx: opts.ctx}, opts.cb);
                    } else {
                        opts.cb(err);
                    }
                }.bind(this));
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
            var count = 0;
            var offset = opts.offset || 0;
            var limit = opts.limit || -1;
            var objects = [];
            var err, stream;
            if (opts.reverse) {
                stream = opts.db.createReadStream({
                    start : this.key + (factory.options.childsep || '~') + factory.options.prefix,
                    end : this.key + (factory.options.childsep || '~') + factory.options.prefix + '~'
                });
            } else {
                stream = opts.db.createReadStream({
                    start : this.key + (factory.options.childsep || '~') + factory.options.prefix,
                    end : this.key + (factory.options.childsep || '~') + factory.options.prefix + '~'
                });
            }
            stream.on('data', function (entry) {
                var segs = entry.key.split(factory.childsep || '~');
                var inst;
                //if the child is prefixed with this factory's prefix
                if (segs[segs.length - 1].indexOf(factory.options.prefix) === 0) {
                    if (offset < 1) {
                        inst = factory.create(entry.value);
                        inst.key = entry.key;
                        inst.__verymeta.parent = this;
                        objects.push(inst);
                        count++;
                    } else {
                        offset--;
                    }
                }
                if (limit !== -1 && count >= limit) {
                    stream.destroy();
                }
            }.bind(this));
            stream.on('error', function (err) {
                opts.cb(err, null);
            });
            stream.on('close', function () {
                opts.cb(err, objects);
            });
        },
        getChildrenByIndex: function (factory, field, value, opts, callback) {
            opts = handleOpts(mf.options.prefix + 'getChildrenByIndex', opts, callback);
            factory.getByIndex(field, value, {keyfilter: this.key + (factory.options.sep || '!') + factory.options.prefix}, opts.cb);
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

