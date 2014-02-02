var verymodel = require('verymodel');
var uuid = require('node-uuid');
var async = require('async');

function makeModelLevely(mf) {
    mf.addDefinition({
        key: {private: true,
        default: function () {
            if (this.__verymeta.parent) {
                return this.__verymeta.parent.key + '!' + this.__verymeta.prefix + uuid.v4();
            } else {
                return this.__verymeta.prefix + uuid.v4();
            }
        },
        required: true},
    });

    mf.load = function (id, callback) {
        mf.options.db.get(id, function (err, result) {
            var obj;
            if (!err) {
                obj = mf.create(result);
                obj.key = id;
                callback(err, obj);
            } else {
                callback(err);
            }
        });
    };

    mf.delete = function (key, callback) {
        mf.options.db.del(key, callback);
    };

    mf.all = function (callback) {
        var objects = [];
        var err;
        var stream = mf.options.db.createReadStream({
            start : mf.options.prefix,
            end : mf.options.prefix + '~'
        });
        stream.on('data', function (entry) {
            var inst = mf.create(entry.value);
            inst.key = entry.key;
            objects.push(inst);
        });
        stream.on('error', function (error) {
            err = error;
            callback(err, null);
        });
        stream.on('close', function () {
            callback(err, objects);
        });
    };

    function indexName(field) {
        return 'index!' + field;
    }


    mf.getByIndex = function (field, value, callback, _keyfilter) {
        if (this.definition[field].hasOwnProperty('index') && this.definition[field].index === true) {
            this.options.db.get(indexName(field), function (err, index) {
                var keys;
                if (err || !index) index = {};
                if (index.hasOwnProperty(value)) {
                    keys = index[value];
                    if (_keyfilter) {
                        keys = keys.filter(function (key) {
                            return key.indexOf(_keyfilter) === 0;
                        });
                    }
                    async.map(keys, function (key, acb) {
                        this.options.db.get(key, function (err, result) {
                            var obj;
                            if (!err) {
                                obj = mf.create(result);
                                obj.key = index[value];
                                acb(err, obj);
                            } else {
                                acb(err);
                            }
                        }.bind(this));
                    }.bind(this),
                    function (err, results) {
                        callback(err, results);
                    });
                } else {
                    callback("no index for value");
                }
            }.bind(this));
        } else {
            callback("field does not have index");
        }
    };

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
                            ikey = indexName(field);
                            this.__verymeta.db.get(ikey, function (err, obj) {
                                var objkeys, idx, kidx;
                                if (err || !obj) {
                                    obj = {};
                                }
                                objkeys = Object.keys(obj);
                                for (kidx in objkeys) {
                                    idx = obj[objkeys[kidx]].indexOf(this.key);
                                    if (idx !== -1) {
                                        obj[objkeys[kidx]].pop(idx);
                                    }
                                }
                                if (!obj.hasOwnProperty(field)) obj[this[field]] = [];
                                obj[this[field]].push(this.key);
                                this.__verymeta.db.put(ikey, obj, scb);
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
                start : this.key + '!' + factory.options.prefix,
                end : this.key + '!' + factory.options.prefix + '~'
            });
            stream.on('data', function (entry) {
                var inst = factory.create(entry.value);
                inst.key = entry.key;
                inst.__verymeta.parent = this;
                objects.push(inst);
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
            factory.getByIndex(field, value, callback, this.key + '!' + factory.options.prefix);
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

