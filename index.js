var verymodel = require('verymodel');
var uuid = require('node-uuid');
var async = require('async');
var crypto = require('crypto');
var base60 = require('base60');

function makeModelLevely(mf) {
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
        if ((key.indexOf(mf.options.childsep) === -1 && key.indexOf('~') === -1) && key.indexOf(mf.options.prefix) !== 0)  {
            key = mf.options.prefix + (mf.options.sep || '!') + key;
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
        var count = 0;
        var offset = opts.offset || 0;
        var limit = opts.limit || -1;
        var objects = [];
        var err;
        var stream = mf.options.db.createReadStream({
            start : mf.options.prefix,
            end : mf.options.prefix + '~'
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
            opts.cb(err, objects);
        });
    };

    function indexName(factory, field, value) {
        value = String(value);
        var hash = crypto.createHash('md5').update(String(value)).digest('hex');
        var trunk = value.substring(0, 10).replace(/\s/g, "X");
        var result = '__index__' + (factory.options.sep || '!') + factory.options.prefix + (factory.options.sep || '!') + field + (factory.options.sep || '!') + trunk + (factory.options.sep || '!') + hash;
        return result;
    }


    mf.getByIndex = function (field, value, opts, callback) {
        opts = handleOpts('Factory.getByIndex', opts, callback);
        if (this.definition[field].hasOwnProperty('index') && this.definition[field].index === true) {
            mf.options.db.get(indexName(mf, field, value), function (err, index) {
                var keys;
                if (err || !index) index = {};
                if (index.hasOwnProperty(value)) {
                    keys = index[value];
                    if (opts.keyfilter) {
                        keys = keys.filter(function (key) {
                            return key.indexOf(opts.keyfilter) === 0;
                        });
                    }
                    if (opts.limit) {
                        keys = keys.slice(0, opts.limit);
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
                        if (opts.limit === 1) {
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
            var nextkey;
            if (typeof mf.options.lastkeyidx === 'undefined') {
                mf.options.db.get("__counter__" + (mf.options.sep || '!') + mf.options.prefix, function (err, ctr) {
                    mf.options.lastkeyidx = parseInt(ctr || 0, 10);
                    this.getNextKey(callback);
                }.bind(this));
            } else {
                mf.options.lastkeyidx++;
                nextkey = base60.encode(mf.options.lastkeyidx);
                nextkey = mf.options.prefix + (mf.options.sep || '!') + '00000000'.slice(0, 8 - nextkey.length) + nextkey;
                if (this.__verymeta.parent) {
                    nextkey = this.__verymeta.parent.key + (this.__verymeta.childsep || '~') + nextkey;
                }
                mf.options.db.put("__counter__" + (mf.options.sep || '!') + mf.options.prefix, mf.options.lastkeyidx, function (err) {
                    callback(null, nextkey);
                });
            }
        },
        save: function (opts, callback) {
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
                    //console.log(key)
                    this.key = key;
                    this.__verymeta.db.put(this.key, this.toJSON(), acb);
                }.bind(this),
                function (acb) {
                    async.each(Object.keys(this.__verymeta.defs), function (field, scb) {
                        var ikey;
                        if (this.__verymeta.defs[field].hasOwnProperty('index') && this.__verymeta.defs[field].index === true) {
                            ikey = indexName(mf, field, this[field]);
                            this.__verymeta.db.get(ikey, function (err, obj) {
                                var objkeys, idx, kidx;
                                if (err || !obj) {
                                    obj = {};
                                }
                                if (!obj.hasOwnProperty(String(this[field]))) obj[this[field]] = [];
                                if (obj[String(this[field])].indexOf(this.key) == -1) {
                                    obj[String(this[field])].push(this.key);
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
                    inst = factory.create(entry.value);
                    inst.key = entry.key;
                    inst.__verymeta.parent = this;
                    objects.push(inst);
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

