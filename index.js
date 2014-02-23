var verymodel = require('verymodel');
var uuid = require('node-uuid');
var async = require('async');
var crypto = require('crypto');
var base60 = require('base60');
var Padlock = require('padlock').Padlock;

function makeModelLevely(mf) {

    var savelock = new Padlock();

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

    function joinSep() {
        var args = Array.prototype.slice.call(arguments);
        return args.join(mf.options.sep || '!');
    }

    function joinChild() {
        var args = Array.prototype.slice.call(arguments);
        return args.join(mf.options.childsep || '~');
    }

    function getLastChildPrefix(key) {
        var ksegs = key.split(mf.options.childsep || '~');
        var csegs = ksegs[ksegs.length - 1].split(mf.options.sep || '!');
        return csegs[0];
    }
    
    function handleOpts(name, opts, callback) {
        if (typeof callback === 'undefined') {
            opts = {cb: opts};
        } else {
            opts.cb = callback;
        }
        if (!opts.bucket) {
            opts.bucket = mf.options.bucket;
        }
        if (typeof opts.cb !== 'function') {
            throw Error('The last argument in ' + name + 'must be a function');
        }
        return opts;
    }

    mf.load = function (key, opts, callback) {
        //if this isn't a child and the user didn't include the prefix, add it
        opts = handleOpts('Factory.get', opts, callback);
        if (getLastChildPrefix(key) !== this.options.prefix) {
            key = joinSep(mf.options.prefix, key);
        }
        mf.options.db.get(key, function (err, result) {
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
        opts = handleOpts('Factory.delete', opts, callback);
        mf.options.db.del(key, opts.cb);
    };

    mf.update = function (key, updated_fields, opts, callback) {
        opts = handleOpts('Factory.update', opts, callback);
        mf.load(key, function (err, result) {
            if (!err && result) {
                var keys = Object.keys(updated_fields);
                for (var idx = 0; idx < keys.length; idx++) {
                    result[keys[idx]] = updated_fields[keys[idx]];
                }
                result.save({ctx: opts.ctx}, function (err) {
                    opts.cb(err, result);
                });
            } else {
                opts.cb(err);
            }
        });
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
        var err;
        var stream = mf.options.db.createReadStream({
            start : mf.options.prefix,
            end : mf.options.prefix + '~',
        });
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
        
        var stream = mf.options.db.createReadStream({
            start: joinSep('__index__', mf.options.prefix, index, undefined),
            end: joinSep('__index__', mf.options.prefix, index, '~'),
        });
        stream.on('data', function (entry) {
            stream.pause();
            var index = entry.value;
            var keys = [];
            var length;
            var values = Object.keys(index).sort();
            for (var vidx in values)  {
                for (var kidx in index[values[vidx]]) {
                    keys.push(index[values[vidx]][kidx]);
                }
            }
            length = keys.length;
            if (offset > 0) {
                keys = keys.slice(offset);
                offset -= length;
                if (offset < 0) offset = 0;
            }
            if (limit !== -1 && count < limit && keys.length > 0) {
                keys = keys.slice(0, limit - count);
            }
            if (keys.length > 0) {
                async.each(keys,
                    function (key, acb) {
                        mf.get(key, function (err, inst) {
                            if (!err || inst) {
                                objects.push(inst);
                            } else {
                                objects.push(undefined);
                            }
                            count++;
                            acb(null);
                        });
                    },
                    function (err) {
                        if (limit !== -1 && count >= limit) {
                            stream.destroy();
                        } else {
                            stream.resume();
                        }
                    }
                );
            } else {
                stream.resume();
            }
        });
        stream.on('error', function (err) {
            opts.cb(err, null);
        });
        stream.on('close', function () {
            opts.cb(null, objects, {count: count, offset: opts.offset || 0, limit: opts.limit || -1});
        });
    };

    function indexName(factory, field, value, is_int) {
        if (!is_int) {
            value = String(value).substring(0, 10).replace(/\s/g, "X");
        } else {
            value = base60.encode(value);
            value = '0000000000'.slice(0, 10 - value.length) + value;
        }
        var hash = crypto.createHash('md5').update(String(value)).digest('hex');
        var result = joinSep('__index__', factory.options.prefix, field, value, hash);
        return result;
    }


    mf.getByIndex = function (field, value, opts, callback) {
        opts = handleOpts('Factory.getByIndex', opts, callback);
        var count = 0;
        var offset = opts.offset || 0;
        var limit = opts.limit || -1;
        if (this.definition[field].index === true || this.definition[field].index_int === true) {
            mf.options.db.get(indexName(mf, field, value, this.definition[field].index_int), function (err, index) {
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
                        mf.options.db.get(key, function (err, result) {
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

    function deleteFromIndex(factory, field, value, key, callback) {
        value = String(value);
        var ikey = indexName(factory, field, value);
        factory.options.db.get(ikey, function (err, obj) {
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
                        factory.options.db.put(ikey, obj, callback);
                    } else {
                        factory.options.db.del(ikey, callback);
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
        getNextKey: function (callback)  {
            mf.options.db.get(joinSep('__counter__', mf.options.prefix), function (err, ctr) {
                var value;
                ctr = ctr || 0;
                ctr++;
                value = base60.encode(ctr);
                value = '00000000'.slice(0, 8 - value.length) + value;
                value = joinSep(mf.options.prefix, value);
                if (this.__verymeta.parent) {
                    value = joinChild(this.__verymeta.parent.key, value);
                }
                mf.options.db.put(joinSep('__counter__', mf.options.prefix), ctr, function (err) {
                    callback(null, value);
                });
            }.bind(this));
        },
        save: function (opts, callback) {
            savelock.runwithlock(function () {
                opts = handleOpts(mf.options.prefix + '.save', opts, callback);
                async.waterfall([
                    function (acb) {
                        if (this.key) {
                            acb(null, this.key);
                        } else {
                            this.getNextKey(acb);
                        }
                    }.bind(this),
                    function (key, acb) {
                        this.key = key;
                        this.__verymeta.db.put(this.key, this.toJSON(), acb);
                    }.bind(this),
                    function (acb) {
                        async.each(Object.keys(this.__verymeta.defs), function (field, scb) {
                            var ikey;
                            if (this.__verymeta.defs[field].index === true || this.__verymeta.defs[field].index_int === true) {
                                var value = this[field];
                                ikey = indexName(mf, field, value, this.__verymeta.defs[field].index_int);
                                this.__verymeta.db.get(ikey, function (err, obj) {
                                    var objkeys, idx, kidx;
                                    if (err || !obj) {
                                        obj = {};
                                    }
                                    if (!obj.hasOwnProperty(String(value))) obj[value] = [];
                                    if (obj[String(value)].indexOf(this.key) == -1) {
                                        obj[String(value)].push(this.key);
                                    }
                                    this.__verymeta.db.put(ikey, obj, function (err) {
                                        if (this.__verymeta.old_data.hasOwnProperty(field) && this.__verymeta.old_data[field] != this[field]) {
                                            deleteFromIndex(mf, field, this.__verymeta.old_data[field], this.key, scb);
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
                    savelock.release();
                }.bind(this));
            }.bind(this));
        },
        delete: function (opts, callback) {
            opts = handleOpts(mf.options.prefix + 'delete', opts, callback);
            this.__verymeta.db.del(this.key, function (err) {
                if (typeof mf.options.onDelete === 'function') {
                    mf.options.onDelete.call(this, err, {model: this, ctx: opts.ctx}, opts.cb);
                } else {
                    opts.cb(err);
                }
            });
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
            var err;
            var stream = this.__verymeta.db.createReadStream({
                start : this.key + (factory.options.childsep || '~') + factory.options.prefix,
                end : this.key + (factory.options.childsep || '~') + factory.options.prefix + '~'
            });
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

