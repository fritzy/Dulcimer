var verymodel = require('verymodel');
var uuid = require('node-uuid');
var async = require('async');
var crypto = require('crypto');

function makeModelLevely(mf) {
    mf.addDefinition({
        key: {
            private: true,
            derive: function () {
                var value;
                if (this.__verymeta.data.key) return this.__verymeta.data.key;
                if (this.__verymeta.parent) {
                    value = this.__verymeta.parent.key + (this.__verymeta.childsep || '~') + this.__verymeta.prefix + (this.__verymeta.sep || '!');
                } else {
                    value = this.__verymeta.prefix + (this.__verymeta.sep || '!');
                }
                if (!this.keyname) {
                    this.keyname = uuid.v4();
                }
                value += this.keyname;
                return value;
            },
            required: true
        },
        keyname: {
            private: true
        },
    });

    mf.load = function (key, callback) {
        //if this isn't a child and the user didn't include the prefix, add it
        if (key.indexOf(mf.options.childsep) === -1 && key.indexOf(mf.options.prefix) !== 0)  {
            key = mf.options.prefix + (mf.options.sep || '!') + key;
        }
        mf.options.db.get(key, function (err, result) {
            var obj;
            if (!err) {
                obj = mf.create(result);
                obj.key = key;
                callback(err, obj);
            } else {
                callback(err);
            }
        });
    };
    
    mf.get = mf.load;

    mf.delete = function (key, callback) {
        mf.options.db.del(key, callback);
    };

    mf.update = function (key, updated_fields, callback) {
        mf.load(key, function (err, result) {
            if (!err && result) {
                var keys = Object.keys(updated_fields);
                for (var idx = 0; idx < keys.length; idx++) {
                    result[keys[idx]] = updated_fields[keys[idx]];
                }
                result.save(function (err) {
                    callback(err, result);
                });
            } else {
                callback(err);
            }
        });
    };

    mf.all = function (callback) {
        var objects = [];
        var err;
        var stream = mf.options.db.createReadStream({
            start : mf.options.prefix,
            end : mf.options.prefix + '~'
        });
        stream.on('data', function (entry) {
            if (entry.key.indexOf(mf.options.childsep || '~') == -1) {
                var inst = mf.create(entry.value);
                inst.key = entry.key;
                objects.push(inst);
            }
        });
        stream.on('error', function (error) {
            err = error;
            callback(err, null);
        });
        stream.on('close', function () {
            callback(err, objects);
        });
    };

    function indexName(factory, field, value) {
        var hash = crypto.createHash('md5').update(String(value)).digest('hex');
        return '__index__' + (factory.options.sep || '!') + factory.options.prefix + (factory.options.sep || '!') + field + (factory.options.sep || '!') + hash;
    }


    mf.getByIndex = function (field, value, callback, _keyfilter, limit) {
        if (this.definition[field].hasOwnProperty('index') && this.definition[field].index === true) {
            mf.options.db.get(indexName(mf, field, value), function (err, index) {
                var keys;
                if (err || !index) index = {};
                if (index.hasOwnProperty(value)) {
                    keys = index[value];
                    if (_keyfilter) {
                        keys = keys.filter(function (key) {
                            return key.indexOf(_keyfilter) === 0;
                        });
                    }
                    if (limit) {
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
                            callback(err, results[0]);
                        } else {
                            callback(err, results);
                        }
                    });
                } else {
                    if (limit === 1) {
                        callback("no index for value");
                    } else {
                        callback("no index for value", []);
                    }
                }
            }.bind(this));
        } else {
            callback("field does not have index");
        }
    };

    mf.findByIndex = function (field, value, callback, _keyfilter) {
        mf.getByIndex.call(this, field, value, callback, _keyfilter, 1);
    };

    function deleteFromIndex(factory, field, value, key, callback) {
        value = String(value);
        var ikey = indexName(factory, field, value);
        factory.options.db.get(ikey, function (err, obj) {
            var idx, lidx;
            if (!err && obj) {
                idx = obj[value].indexOf(key);
                if (idx !== -1) {
                    obj[value].pop(idx);
                    var foundvals = false;
                    var keys = Object.keys(obj);
                    for (lidx = 0; idx < keys.length; idx++) {
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
        save: function (callback) {
            async.waterfall([
                function (acb) {
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
                                obj[String(this[field])].push(this.key);
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
                callback(err);
            });
        },
        delete: function (callback) {
            this.__verymeta.db.del(this.key, callback);
        },
        createChild: function (factory, obj) {
            var clone = new VeryLevelModel(factory.definition, factory.options);
            clone.options.parent = this;
            return clone.create(obj);
        },
        getChildren: function (factory, callback) {
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
            stream.on('error', function (error) {
                err = error;
                callback(err, null);
            });
            stream.on('close', function () {
                callback(err, objects);
            });
        },
        getChildrenByIndex: function (factory, field, value, callback) {
            factory.getByIndex(field, value, callback, this.key + (factory.options.sep || '!') + factory.options.prefix);
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

